import os
import csv
import base64
import secrets
import asyncio
from datetime import datetime
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
    Disposition
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
            # Validate by constructing a dummy year date
            datetime.strptime(f"2000-{date_str}", "%Y-%m-%d")
            return date_str
        if len(date_str) == 10 and date_str[4] == "-" and date_str[7] == "-":
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            return dt.strftime("%m-%d")
    except ValueError:
        return None
    return None


def read_csv_matches(month_day: str) -> list[dict]:
    """
    Read the CSV (no headers) and build rows that match month-day of birthday
    Expected columns:
      0:id 1:name 2:app_id 3:birthday 4:email 5:phone 6:father_email
      7:father_phone 8:mother_email 9:mother_phone
    """
    matches: list[dict] = []
    if not os.path.exists(CSV_PATH):
        return matches

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 4:
                continue
            birthday_raw = row[3].strip()
            try:
                bday = datetime.strptime(birthday_raw, "%Y-%m-%d")
            except ValueError:
                continue
            if bday.strftime("%m-%d") == month_day:
                matches.append({
                    "id": row[0] if len(row) > 0 else "",
                    "name": row[1] if len(row) > 1 else "",
                    "app_id": row[2] if len(row) > 2 else "",
                    "birthday": birthday_raw,
                    "email": row[4] if len(row) > 4 else "",
                    "phone": row[5] if len(row) > 5 else "",
                    "father_email": row[6] if len(row) > 6 else "",
                    "father_phone": row[7] if len(row) > 7 else "",
                    "mother_email": row[8] if len(row) > 8 else "",
                    "mother_phone": row[9] if len(row) > 9 else ""
                })
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

    data = request.json or {}
    recipient = data.get("recipient")
    if not recipient:
        return jsonify({"error": "Recipient email required"}), 400

    name = data.get("name", "Friend")
    subject = data.get("subject", f"Happy Birthday, {name} 🎂")
    recipient_phone = data.get("recipient_phone", "919486870915")

    # Generate AI message
    try:
        message = asyncio.run(text_gen(name))
    except Exception as e:
        return jsonify({"error": f"AI text generation failed: {e}"}), 500

    # Build card
    try:
        card_path = create_birthday_card(name, message)
    except Exception as e:
        return jsonify({"error": f"Card generation failed: {e}"}), 500

    # Encode image
    try:
        with open(card_path, "rb") as f:
            encoded_file = base64.b64encode(f.read()).decode()
    except Exception as e:
        return jsonify({"error": f"Attachment encoding failed: {e}"}), 500

    attachment = Attachment(
        FileContent(encoded_file),
        FileName(os.path.basename(card_path)),
        FileType("image/png"),
        Disposition("attachment")
    )

    email = Mail(
        from_email=FROM_EMAIL,
        to_emails=recipient,
        subject=subject,
        html_content=f"<p>{message}</p>"
    )
    email.attachment = attachment

    # Send WhatsApp (best-effort)
    try:
        send_whatsapp(message, str(recipient_phone), card_path)
    except Exception:
        # Log or ignore; for now we don't abort the email
        pass

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(email)
        return jsonify({
            "status": response.status_code,
            "message": "Email sent successfully!"
        }), 200
    except Exception as e:
        return jsonify({"error": f"Email send failed: {e}"}), 500


# --- Error Handlers ---


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": f"Server error: {e}"}), 500


if __name__ == "__main__":
    # Bind host for broader accessibility; remove if not needed
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)