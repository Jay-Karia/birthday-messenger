import asyncio
from flask import Flask, request
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition
import base64
import os
from PIL import Image, ImageDraw, ImageFont
from dotenv import load_dotenv
from components.whatsapp_msg import send_whatsapp

from components.text_ai import text_gen

app = Flask(__name__)

# Load environment variables
load_dotenv()
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")

# Paths
CARD_TEMPLATE = "./components/card.png"
FONT_PATH = "./components/font-title.ttf"
FROM_EMAIL = "devtest10292025@outlook.com"  # Verified SendGrid sender

def create_birthday_card(name, message):
    img = Image.open(CARD_TEMPLATE)
    draw = ImageDraw.Draw(img)

    name_font = ImageFont.truetype(FONT_PATH, 80)
    msg_font = ImageFont.truetype(FONT_PATH, 50)

    draw.text((200, 150), name, font=name_font, fill="blue")
    draw.text((200, 300), message, font=msg_font, fill="black")

    output_path = "birthday_card_custom.png"
    img.save(output_path)
    return output_path

@app.route("/send_card", methods=["POST"])
def send_email():
    data = request.json
    recipient = data.get("recipient")
    name = data.get("name", "Friend")
    subject = data.get("subject", f"Happy Birthday, {name} 🎂")
    message = asyncio.run(text_gen(name))
    recipient_phone = data.get("recipient_phone", "919486870915")

    # Generate custom card
    card_path = create_birthday_card(name, message)

    # Encode image for email
    with open(card_path, "rb") as f:
        encoded_file = base64.b64encode(f.read()).decode()

    # Create attachment
    attachment = Attachment(
        FileContent(encoded_file),
        FileName(card_path),
        FileType("image/png"),
        Disposition("attachment")
    )

    # Email content
    email = Mail(
        from_email=FROM_EMAIL,
        to_emails=recipient,
        subject=subject,
        html_content=f"<p>{message}</p>"
    )
    email.attachment = attachment
    send_whatsapp(message, str(recipient_phone), card_path)
    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(email)
        return {
            "status": response.status_code,
            "message": "Email sent successfully!"
        }, response.status_code
    except Exception as e:
        return {"error": str(e)}, 500

if __name__ == "__main__":
    app.run(debug=True)
