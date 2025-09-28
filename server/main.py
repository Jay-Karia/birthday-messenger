import ssl
import pandas as pd
import glob
import os
import base64
import secrets
import asyncio
import json
from datetime import datetime, date
from typing import Optional
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
from components.text_ai import text_gen
from helper import send_email_with_image
import re

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
EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
EMAIL_RECEIVER = os.getenv("EMAIL_RECEIVER")
# Mutable current password (can be changed at runtime)
AUTH_STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth_state.json")

# Load persisted password override if present
if os.path.exists(AUTH_STATE_PATH):
    try:
        with open(AUTH_STATE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and data.get("password"):
            AUTH_PASS = data["password"]
    except Exception:
        pass

# Working password used for auth comparisons
CURRENT_AUTH_PASS = AUTH_PASS

def _persist_password(new_pass: str):
    try:
        with open(AUTH_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump({"password": new_pass}, f)
    except Exception:
        # Non-fatal; log or ignore in minimal implementation
        print("[WARN] Failed to persist new password")

# --- SendGrid / paths ---
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
FROM_EMAIL = os.getenv("FROM_EMAIL", "devtest10292025@outlook.com")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CARD_TEMPLATE = os.path.join(BASE_DIR, "components", "card.png")
FONT_PATH = os.path.join(BASE_DIR, "components", "font-title.ttf")
CSV_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "data", "All_StudentMaster.csv"))

# --------------------------------------------------------------------------------------
# Utilities
# --------------------------------------------------------------------------------------


def create_birthday_card(name: str) -> str:
    """Create a custom birthday card image with name"""
    img = Image.open(CARD_TEMPLATE)
    draw = ImageDraw.Draw(img)
    name_font = ImageFont.truetype(FONT_PATH, 48)
    draw.text((235, 315), f"{name} ,", font=name_font, fill="#000080")
    output_path = os.path.join(BASE_DIR, "birthday_result.png")
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
    Accepts:
      YYYY-MM-DD
      DD/MM/YYYY
      YYYY/MM/DD
      DD-MM-YYYY
      MM-DD-YYYY  (fallback)
    """
    if isinstance(val, datetime):
        return val
    if isinstance(val, date):
        return datetime.combine(val, datetime.min.time())
    if isinstance(val, (int, float)):
        # Not handling Excel serial numbers here; could be added if needed.
        return None
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return None
        formats = ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y")
        for fmt in formats:
            try:
                return datetime.strptime(s, fmt)
            except ValueError:
                continue
    return None


def _normalize_phone_generic(raw: str) -> str:
    """
    Normalize phone: keep digits, ensure '91' prefix if >=10 digits and no country code yet.
    """
    if not raw:
        return ""
    digits = "".join(ch for ch in str(raw) if ch.isdigit())
    if not digits:
        return ""
    # simple heuristic
    if len(digits) >= 10 and not digits.startswith("91"):
        digits = "91" + digits
    return digits


# Legacy function still used by /send_card payload generation (left intact)
def _normalize_phone(val) -> str:
    if val is None:
        return ""
    if isinstance(val, (int, float)):
        try:
            return str(int(val))
        except Exception:
            return str(val)
    return str(val).strip()


# ---------------------------------------------
# Header-aware CSV field mapping infrastructure
# ---------------------------------------------
FIELD_SYNONYMS = {
    "name": ["student name", "name", "full name"],
    "birthday": ["dob", "date of birth", "birth date", "birthday"],
    # Parent/guardian email columns
    "parent_email": [
        "parent email", "parent mail", "parent email id", "parent mail id",
        "parent e-mail", "guardian email", "guardian mail", "guardian email id"
    ],
    # Student email columns (skip headers that contain parent/guardian at match time)
    "email": [
        "student email", "student e-mail", "email", "email id", "email address", "mail id"
    ],
    "phone": [
        "student whatsapp no.", "student whatsapp", "student whatsapp number",
        "student mobile", "student mobile no", "student phone", "phone", "mobile"
    ],
}


def _normalize_header(h: str) -> str:
    return "".join(ch for ch in h.lower().strip() if ch.isalnum() or ch == " ")


def _map_headers(columns: list[str]) -> dict:
    """Map internal field names to actual CSV column headers.

    Matching rules:
      - Exact match OR candidate substring contained in normalized column header.
      - For the student 'email' field we deliberately skip columns whose header contains
        'parent ' or 'guardian ' to avoid collisions with parent/guardian email columns.
    """
    norm_columns = { _normalize_header(c): c for c in columns }
    mapping = { k: None for k in FIELD_SYNONYMS.keys() }
    for internal, candidates in FIELD_SYNONYMS.items():
        for candidate in candidates:
            norm_candidate = _normalize_header(candidate)
            for nc_key, original in norm_columns.items():
                if internal == "email" and ("parent " in nc_key or "guardian " in nc_key):
                    continue  # don't let generic email claim parent/guardian column
                if nc_key == norm_candidate or norm_candidate in nc_key:
                    mapping[internal] = original
                    break
            if mapping[internal]:
                break
    return mapping


def read_csv_matches(month_day: str) -> list[dict]:
    """
    Reads the consolidated CSV (header-based) and returns matched birthday rows.
    Output fields:
      id, name, app_id, birthday (YYYY-MM-DD), email, phone,
      father_email, father_phone, mother_email, mother_phone
    """
    matches: list[dict] = []
    if not os.path.exists(CSV_PATH):
        print(f"[read_csv_matches] CSV not found: {CSV_PATH}")
        return matches

    # Try pandas first for robust header handling
    try:
        df = pd.read_csv(CSV_PATH, dtype=str, keep_default_na=False)
    except Exception as e:
        print(f"[read_csv_matches] Could not load CSV via pandas: {e}")
        return matches

    if df.empty:
        return matches

    columns = list(df.columns)
    header_map = _map_headers(columns)
    birthday_col = header_map.get("birthday")
    if not birthday_col:
        print("[read_csv_matches] No birthday/DOB column detected.")
        return matches

    for _, row in df.iterrows():
        raw_bday = str(row.get(birthday_col, "")).strip()
        bday_dt = _coerce_birthday(raw_bday)
        if not bday_dt:
            continue
        if bday_dt.strftime("%m-%d") != month_day:
            continue

        def get_field(key: str) -> str:
            colname = header_map.get(key)
            if not colname:
                return ""
            return str(row.get(colname, "")).strip()

        parent_email = get_field("parent_email")  # only explicit parent email column

        rec = {
            "name": get_field("name"),
            "birthday": bday_dt.strftime("%Y-%m-%d"),
            "email": get_field("email"),  # student email
            "phone": get_field("phone"),
            "parent_email": parent_email,
        }
        matches.append(rec)

    return matches


# --------------------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"}), 200


@app.route("/login", methods=["POST"])
def login():
    global CURRENT_AUTH_PASS
    data = request.json or {}
    user = data.get("user")
    password = data.get("password")

    if user == AUTH_USER and password == CURRENT_AUTH_PASS:
        token = secrets.token_urlsafe(32)
        ACTIVE_TOKENS.add(token)
        return jsonify({"message": "Login successful", "token": token}), 200

    return jsonify({"error": "Invalid credentials"}), 401


@app.route("/change_password", methods=["POST"])
def change_password():
    """Change the authentication password.
    Requires a valid bearer token AND the correct old_password in body.
    Body: { "old_password": str, "new_password": str }
    """
    global CURRENT_AUTH_PASS
    auth_error = require_auth()
    if auth_error:
        return auth_error

    data = request.json or {}
    old_pw = data.get("old_password")
    new_pw = data.get("new_password")

    if not old_pw or not new_pw:
        return jsonify({"error": "old_password and new_password required"}), 400
    if old_pw != CURRENT_AUTH_PASS:
        return jsonify({"error": "Old password incorrect"}), 403
    if len(new_pw) < 4:
        return jsonify({"error": "New password must be at least 4 characters"}), 400
    if new_pw == CURRENT_AUTH_PASS:
        return jsonify({"error": "New password must be different"}), 400

    CURRENT_AUTH_PASS = new_pw
    _persist_password(new_pw)
    return jsonify({"message": "Password updated"}), 200


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

    if isinstance(datas, dict):
        data_list = [datas]
    elif isinstance(datas, list):
        data_list = datas
    else:
        return jsonify({"error": "Invalid input format. Must be dict or list"}), 


    results = []
    for entry in data_list:
        # Accept either explicit recipient or fall back to the student's email
        recipient = entry.get("recipient") or entry.get("email")
        if not recipient:
            results.append({"status": 400, "error": "Recipient email required"})
            continue

        name = entry.get("name", "Friend")
        if isinstance(name, str) and name.strip() and name.upper() == name:
            raw = name.strip()
            # Collapse multiple trailing dots
            raw = re.sub(r'\.{2,}', '.', raw)
            parts = raw.split()
            fixed = []
            for p in parts:
            # Preserve single-letter initials (with or without period)
                if re.fullmatch(r'[A-Z]\.?', p):
                    fixed.append(p[0].upper() + '.')
                else:
                    core = re.sub(r'\.+$', '', p)
                    fixed.append(core.capitalize())
            name = " ".join(fixed).replace('. .', '.')
        subject = entry.get("subject", f"Happy Birthday, {name} 🎂")

        parent_email = entry.get("parent_email")

        extra_recipients = []
        if parent_email:
            extra_recipients.append(parent_email)

        try:
            message = asyncio.run(text_gen(name))
        except Exception as e:
            results.append({"status": 500, "error": f"AI text generation failed: {e}"})
            continue

        try:
            card_path = create_birthday_card(name)
        except Exception as e:
            results.append({"status": 500, "error": f"Card generation failed: {e}"})
            continue

        try:
            with open(card_path, "rb") as f:
                img_data = f.read()
        except Exception as e:
            results.append({"status": 500, "error": f"Attachment encoding failed: {e}"})
            continue

        all_recipients = [recipient] + extra_recipients

        try:
            for email_addr in all_recipients:
                send_email_with_image(
                    subject=f"Happy Birthday, {name}!! Wishes from SRM Institute of Science and Technology, Trichy",
                    body_text=message,
                    recipient=email_addr,
                    image_path=card_path,
                    inline=True,
                )
        except Exception as e:
            results.append({"status": 500, "error": f"Email send failed: {e}"})

    return jsonify(results), 200


@app.route("/csvdump", methods=["POST"])
def csvDump():
    """Aggregate all Excel files in xlsDump, extract target sheets, and write consolidated CSV to data folder."""
    auth_error = require_auth()
    if auth_error:
        return auth_error

    excel_files = glob.glob(os.path.join("./components/xlsDump/", "*.xls*"))
    target_keyword = "Student Master"
    skipped_students: list[str] = []
    seen_students: set[str] = set()
    all_data = []

    for file in excel_files:
        try:
            sheets = pd.read_excel(file, sheet_name=None, header=None)
        except Exception as e:
            print(f"[csvDump] Failed reading {file}: {e}")
            continue
        matching_sheets = {name: df for name, df in sheets.items() if target_keyword in name}

        if not matching_sheets:
            print(f"[csvDump] {file}: no sheet with '{target_keyword}' found")
            continue

        for sheet_name, df in matching_sheets.items():
            if df.empty:
                continue
            if len(df) > 1:
                df.columns = df.iloc[1]
                df = df.drop([0, 1])
            df = df.dropna(how="all")

            drop_cols = []
            for col in list(df.columns):
                col_str = str(col).strip().lower()
                if col_str in ["s.no", "sl no", "slno", "sno"] or col_str.startswith("unnamed"):
                    drop_cols.append(col)
            if drop_cols:
                df = df.drop(columns=drop_cols)

            dob_col = [c for c in df.columns if "DOB" in str(c).upper()]
            if dob_col:
                col = dob_col[0]
                df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True)
                missing_dob = df[df[col].isna()]
                if not missing_dob.empty and "Student Name" in df.columns:
                    skipped_students.extend(missing_dob["Student Name"].dropna().tolist())
                df = df[df[col].notna()]
                df[col] = df[col].dt.strftime("%d-%m-%Y")

            phone_cols = ["Parent Whatsapp No.", "Student Whatsapp No."]
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

    if not all_data:
        return jsonify({
            "message": "No valid data found in uploaded Excel workbooks",
            "rows": 0,
            "skipped_count": 0,
            "csv_path": None,
            "download_url": None
        }), 200

    final_df = pd.concat(all_data, ignore_index=True)

    csv_dir = os.path.dirname(CSV_PATH)
    if csv_dir and not os.path.exists(csv_dir):
        os.makedirs(csv_dir, exist_ok=True)

    try:
        final_df.to_csv(CSV_PATH, index=False, encoding="utf-8")
    except Exception as e:
        return jsonify({"error": f"Failed to write consolidated CSV: {e}"}), 500

    response = {
        "message": "CSV consolidated successfully",
        "rows": len(final_df),
        "skipped_students": skipped_students,
        "skipped_count": len(skipped_students),
        "csv_path": CSV_PATH,
        "download_url": "/download_csv"
    }
    return jsonify(response), 200

@app.route("/delete_all_xls", methods=["POST"])
def delete_all_xls():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    base_dir = os.path.join(".", "components", "xlsDump")
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

    base_dir = os.path.join(".", "components", "xlsDump")
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
        files.sort(key=lambda x: x["uploaded_at"], reverse=True)
        return jsonify({"files": files}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to list files: {e}"}), 500


@app.route("/upload_excel", methods=["POST"])
def upload_excel():
    """Upload and process Excel file (current simple path: overwrite consolidated CSV with last upload)."""
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
        base_dir = os.path.join(".", "components", "xlsDump")
        os.makedirs(base_dir, exist_ok=True)

        filename = file.filename
        file_path = os.path.join(base_dir, filename)
        file.save(file_path)

        try:
            df = pd.read_excel(file_path)
            csv_dir = os.path.dirname(CSV_PATH)
            if csv_dir and not os.path.exists(csv_dir):
                os.makedirs(csv_dir, exist_ok=True)
            df.to_csv(CSV_PATH, index=False)
            print(f"[upload_excel] Saved processed CSV to {CSV_PATH} with {len(df)} rows")
            return jsonify({
                "message": f"Excel file '{filename}' uploaded and processed successfully",
                "filename": filename,
                "rows_processed": len(df)
            }), 200
        except Exception as e:
            if os.path.exists(file_path):
                os.remove(file_path)
            print(f"[upload_excel] Processing failed for {filename}: {e}")
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


# create_birthday_card("S. Shaun Benedict")