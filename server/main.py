import pandas as pd
import glob
import os
import csv
import base64
import secrets
import asyncio
from datetime import datetime, date
from typing import Optional
from flask import Flask, request, jsonify
from flask_cors import CORS
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Mail,
    Attachment,
    FileContent,
    FileName,
    FileType,
    Disposition,
)
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
from components.whatsapp_msg import send_whatsapp
from components.text_ai import text_gen

# --- Load environment first ---
load_dotenv()

# --- App setup ---
app = Flask(__name__)
app.secret_key = os.getenv("APP_SECRET") or secrets.token_hex(16)

# CORS: electron renderer is file:// so we allow all origins (token auth still protects)
CORS(app, resources={r"/*": {"origins": "*"}})

# --- Auth / tokens ---
ACTIVE_TOKENS: set[str] = set()
AUTH_USER = os.getenv("AUTH_USER")
AUTH_PASS = os.getenv("AUTH_PASS")

# --- SendGrid / paths ---
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "devtest10292025@outlook.com")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CARD_TEMPLATE = os.path.join(BASE_DIR, "components", "card.png")
FONT_PATH = os.path.join(BASE_DIR, "components", "font-title.ttf")
CSV_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "dummy.csv"))

# --- Utilities ---


def create_birthday_card(name: str, message: str) -> str:
    """Create a custom birthday card image with name & AI-generated message."""
    img = Image.open(CARD_TEMPLATE)
    draw = ImageDraw.Draw(img)

    name_font = ImageFont.truetype(FONT_PATH, 80)
    msg_font = ImageFont.truetype(FONT_PATH, 50)

    draw.text((200, 150), name, font=name_font, fill="blue")
    draw.text((200, 300), message, font=msg_font, fill="black")

    output_path = os.path.join(BASE_DIR, "birthday_card_custom.png")
    img.save(output_path)
    return output_path


def require_auth():
    """Check Bearer token, return None if ok else (response, code)."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token in ACTIVE_TOKENS:
            return None
    return jsonify({"error": "Unauthorized"}), 401


def parse_month_day(date_str: str) -> Optional[str]:
    """
    Accept MM-DD or YYYY-MM-DD and return MM-DD or None if invalid.
    """
    if not date_str:
        return None
    try:
        if len(date_str) == 5 and date_str[2] == "-":
            # Assume 2000 for validation
            datetime.strptime(f"2000-{date_str}", "%Y-%m-%d")
            return date_str
        if len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return dt.strftime("%m-%d")
    except ValueError:
        return None
    return None


def _coerce_birthday(val) -> Optional[datetime]:
    """
    Try to parse a cell/string into a datetime for known formats.
    Accepts: YYYY-MM-DD, DD/MM/YYYY, YYYY/MM/DD.
    """
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime.combine(val, datetime.min.time())
    if isinstance(val, (int, float)):
        # Unlikely with CSV (unless numeric epoch; ignoring)
        return None
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        formats = ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d")
        for fmt in formats:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
    return None


def _normalize_phone(val) -> str:
    """
    Convert phone values to a clean string while preserving any leading zeros or formatting if present.
    """
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        # Convert numeric to int string without scientific notation
        # (assumes phone numbers aren't fractions)
        try:
            as_int = int(val)
            return str(as_int)
        except Exception:
            return str(val)
    s = str(val).strip()
    return s


def read_csv_matches(month_day: str) -> list[dict]:
    """
    Read CSV rows and return those matching the supplied MM-DD birthday.
    Expected column order:
      0 id
      1 name
      2 app_id
      3 birthday (parse formats)
      4 email
      5 phone
      6 father_email
      7 father_phone
      8 mother_email
      9 mother_phone
    Rows with unparsable birthdays are skipped. A header row is automatically skipped if
    the birthday column cannot be parsed.
    """
    matches: list[dict] = []
    if not os.path.exists(CSV_PATH):
        print(f"[read_csv_matches] CSV not found: {CSV_PATH}")
        return matches

    try:
        with open(CSV_PATH, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if not row:
                    continue
                # Ensure at least 4 columns (birthday index)
                if len(row) < 4:
                    continue
                raw_bday = row[3]
                bday_dt = _coerce_birthday(raw_bday)
                if not bday_dt:
                    # Probably header or invalid; skip
                    continue
                if bday_dt.strftime("%m-%d") != month_day:
                    continue

                def _safe(i):
                    return row[i].strip() if len(row) > i and row[i] is not None else ""

                matches.append({
                    "id": _safe(0),
                    "name": _safe(1),
                    "app_id": _safe(2),
                    "birthday": bday_dt.strftime("%Y-%m-%d"),
                    "email": _safe(4),
                    "phone": _normalize_phone(_safe(5)),
                    "father_email": _safe(6),
                    "father_phone": _normalize_phone(_safe(7)),
                    "mother_email": _safe(8),
                    "mother_phone": _normalize_phone(_safe(9)),
                })
    except Exception as e:
        print(f"[read_csv_matches] Error reading CSV: {e}")

    return matches


# --- Routes ---


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    user = data.get("user")
    password = data.get("password")

    if user == AUTH_USER and password == AUTH_PASS:
        token = secrets.token_urlsafe(32)
        ACTIVE_TOKENS.add(token)
        return jsonify({"message": "Login successful", "token": token}), 200

    return jsonify({"error": "Invalid credentials"}), 401


@app.route("/logout", methods=["POST"])
def logout():
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if token in ACTIVE_TOKENS:
        ACTIVE_TOKENS.remove(token)
    return jsonify({"message": "Logged out"}), 200


@app.route("/filter", methods=["GET"])
def filter_birthdays():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    date_str = request.args.get("date")
    month_day = parse_month_day(date_str)
    if not month_day:
        return jsonify({"error": "Invalid date format. Use MM-DD or YYYY-MM-DD"}), 400

    matches = read_csv_matches(month_day)
    formatted_date = datetime.strptime(f"2000-{month_day}", "%Y-%m-%d").strftime("%B %d")

    return jsonify({
        "date": formatted_date,
        "month_day": month_day,
        "count": len(matches),
        "people": matches
    }), 200


@app.route("/send_card", methods=["POST"])
def send_email():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    datas = request.json
    if not datas:
        return jsonify({"error": "No input data provided"}), 400

    # Normalize input: always work with a list of dicts
    if isinstance(datas, dict):
        data_list = [datas]
    elif isinstance(datas, list):
        data_list = datas
    else:
        return jsonify({"error": "Invalid input format. Must be dict or list"}), 400

    results = []
    for entry in data_list:
        print(entry)
        recipient = entry.get("recipient")
        if not recipient:
            results.append({"status": 400, "error": "Recipient email required"})
            continue

        name = entry.get("name", "Friend")
        subject = entry.get("subject", f"Happy Birthday, {name} 🎂")
        recipient_phone = entry.get("recipient_phone", "")

        father_email = entry.get("father_email")
        father_phone = entry.get("father_phone")
        mother_email = entry.get("mother_email")
        mother_phone = entry.get("mother_phone")

        # Collect extra contacts
        extra_recipients = []
        if father_email:
            extra_recipients.append(father_email)
        if mother_email:
            extra_recipients.append(mother_email)

        extra_phones = []
        if father_phone:
            extra_phones.append(str(father_phone))
        if mother_phone:
            extra_phones.append(str(mother_phone))

        # Generate AI message
        try:
            message = asyncio.run(text_gen(name))
        except Exception as e:
            results.append({"status": 500, "error": f"AI text generation failed: {e}"})
            continue

        # Build card
        try:
            card_path = create_birthday_card(name, message)
        except Exception as e:
            results.append({"status": 500, "error": f"Card generation failed: {e}"})
            continue

        # Encode image
        try:
            with open(card_path, "rb") as f:
                encoded_file = base64.b64encode(f.read()).decode()
        except Exception as e:
            results.append({"status": 500, "error": f"Attachment encoding failed: {e}"})
            continue

        attachment = Attachment(
            FileContent(encoded_file),
            FileName(os.path.basename(card_path)),
            FileType("image/png"),
            Disposition("attachment"),
        )

        all_recipients = [recipient] + extra_recipients

        # Send WhatsApp (best-effort)
        all_phones = [str(recipient_phone)] if recipient_phone else []
        all_phones += extra_phones
        for phone in all_phones:
            if not phone:
                continue
            try:
                send_whatsapp(message, phone, card_path)
            except Exception:
                pass

        try:
            sg = SendGridAPIClient(SENDGRID_API_KEY)
            for email_addr in all_recipients:
                email = Mail(
                    from_email=FROM_EMAIL,
                    to_emails=email_addr,
                    subject=subject,
                    html_content=f"<p>{message}</p>",
                )
                email.attachment = attachment
                sg.send(email)

            results.append({
                "status": 200,
                "message": f"Email sent successfully to {all_recipients}"
            })
        except Exception as e:
            results.append({"status": 500, "error": f"Email send failed: {e}"})

    return jsonify(results), 200

@app.route("/csvdump", methods=["POST"])
def csvDump():
    excel_files = glob.glob(os.path.join("./server/components/xlsDump/", "*.xls*"))
    target_keyword = "Student Master"
    skipped_students = []
    seen_students = set()
    all_data = []
    for file in excel_files:
        sheets = pd.read_excel(file, sheet_name=None, header=None)
        matching_sheets = {name: df for name, df in sheets.items() if target_keyword in name}
        
        if matching_sheets:
            for sheet_name, df in matching_sheets.items():
                if df.empty:
                    continue
                df.columns = df.iloc[1]
                df = df.drop([0, 1])
                df = df.dropna(how="all")
                for col in df.columns:
                    col_str = str(col).strip().lower()
                    if col_str in ["s.no", "sl no", "slno", "sno"] or col_str.startswith("unnamed"):
                        df = df.drop(columns=[col])
                        break 
                dob_col = [c for c in df.columns if "DOB" in str(c).upper()]
                if dob_col:
                    col = dob_col[0]
                    df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True)
                    df[col] = df[col].dt.strftime("%d-%m-%Y")
                    missing_dob = df[df[col].isna()]
                    if not missing_dob.empty and "Student Name" in df.columns:
                        skipped_students.extend(missing_dob["Student Name"].dropna().tolist())
                    df = df[df[col].notna()]
                phone_cols = [
                    "Parent Whatsapp No.",
                    "Student Whatsapp No."
                ]
                for phone_col in phone_cols:
                    if phone_col in df.columns:
                        df[phone_col] = (
                            df[phone_col]
                            .astype(str)
                            .str.replace(r"\D", "", regex=True)
                            .str.lstrip("0")
                            .apply(lambda x: "91" + x if x else x)
                        )
                if "Student Name" in df.columns:
                    df = df[~df["Student Name"].isin(seen_students)]
                    seen_students.update(df["Student Name"].dropna().tolist())
                
                if not df.empty:
                    all_data.append(df)
        else:
            print(f"{file}: no sheet with '{target_keyword}' found")
    if all_data:
        final_df = pd.concat(all_data, ignore_index=True)
        final_df.to_csv("All_StudentMaster.csv", index=False)
    else:
        print("\nNo valid data to save")
        return "No Valid Data"
    if skipped_students:
        return skipped_students
    else:
        print("\nNo students skipped, all had DOBs!")
        return "All Students Processed"
    
@app.route("/delete_all_xls", methods=["POST"])
def delete_all_xls():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    base_dir = os.path.join(".", "server", "components", "xlsDump")
    if not os.path.exists(base_dir):
        return jsonify({"deleted": [], "message": "Directory does not exist"}), 200

    deleted = []
    failed = []

    try:
        for filename in os.listdir(base_dir):
            if filename.lower().endswith((".xlsx", ".xls")):
                file_path = os.path.join(base_dir, filename)
                try:
                    os.remove(file_path)
                    deleted.append(filename)
                except Exception as e:
                    failed.append({"filename": filename, "error": str(e)})

        return jsonify({
            "deleted": deleted,
            "failed": failed,
            "count_deleted": len(deleted),
            "message": "Deletion complete"
        }), 200
    except Exception as e:
        return jsonify({"error": f"Failed to delete files: {e}"}), 500

@app.route("/list_files", methods=["GET"])
def list_files():
    """List all uploaded Excel files with metadata."""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    base_dir = os.path.join(".", "server", "components", "xlsDump")
    if not os.path.exists(base_dir):
        os.makedirs(base_dir, exist_ok=True)
        return jsonify({"files": []}), 200
    
    files = []
    try:
        for filename in os.listdir(base_dir):
            if filename.endswith(('.xlsx', '.xls')):
                file_path = os.path.join(base_dir, filename)
                stat = os.stat(file_path)
                files.append({
                    "filename": filename,
                    "size": stat.st_size,
                    "uploaded_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size_mb": round(stat.st_size / (1024 * 1024), 2)
                })
        
        # Sort by upload time (newest first)
        files.sort(key=lambda x: x["uploaded_at"], reverse=True)
        return jsonify({"files": files}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to list files: {e}"}), 500

@app.route("/upload_excel", methods=["POST"])
def upload_excel():
    """Upload and process Excel file."""
    auth_error = require_auth()
    if auth_error:
        return auth_error
    
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        return jsonify({"error": "Only Excel files (.xlsx, .xls) are allowed"}), 400
    
    try:
        # Create xlsDump directory if it doesn't exist
        base_dir = os.path.join(".", "server", "components", "xlsDump")
        os.makedirs(base_dir, exist_ok=True)
        
        # Save the file
        filename = file.filename
        file_path = os.path.join(base_dir, filename)
        file.save(file_path)
        
        # Process the Excel file and convert to CSV
        try:
            df = pd.read_excel(file_path)
            # Save to the main CSV file used by the system
            df.to_csv(CSV_PATH, index=False)
            
            return jsonify({
                "message": f"Excel file '{filename}' uploaded and processed successfully",
                "filename": filename,
                "rows_processed": len(df)
            }), 200
        except Exception as e:
            # Remove the uploaded file if processing fails
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({"error": f"Failed to process Excel file: {e}"}), 400
            
    except Exception as e:
        return jsonify({"error": f"Failed to upload file: {e}"}), 500

# --- Error Handlers ---


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": f"Server error: {e}"}), 500


if __name__ == "__main__":
    # Default port changed earlier in Electron fetches to 8000; keep 5000 if you run separately
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)