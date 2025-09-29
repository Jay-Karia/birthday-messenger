from email.message import EmailMessage
from email.utils import make_msgid
import ssl
import smtplib
import os
import mimetypes
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

EMAIL_SENDER = os.getenv("EMAIL_SENDER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")

def validate_env():
    missing = [k for k, v in {
        "EMAIL_SENDER": EMAIL_SENDER,
        "EMAIL_PASSWORD": EMAIL_PASSWORD,
    }.items() if not v]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")

def send_email_with_image(
    subject: str,
    body_text: str,
    image_path: str,
    recipient: str | None = None,
    to: str | None = None,
    inline: bool = True,
    cc: list[str] | None = None,
):
    print(f"[EMAIL_DEBUG] Starting email send to {recipient}")
    if cc:
        print(f"[EMAIL_DEBUG] CC recipients: {cc}")
    
    try:
        validate_env()
        print("[EMAIL_DEBUG] Environment validation passed")
    except Exception as e:
        print(f"[EMAIL_ERROR] Environment validation failed: {e}")
        raise
    
    try:
        msg = EmailMessage()
        msg["From"] = EMAIL_SENDER
        msg["To"] = recipient
        msg["Subject"] = subject
        print(f"[EMAIL_DEBUG] Email headers set - From: {EMAIL_SENDER}, To: {recipient}")

        # Add CC recipients if provided
        if cc:
            msg["Cc"] = ", ".join(cc)
            print(f"[EMAIL_DEBUG] Added CC: {msg['Cc']}")
        
        msg.set_content(body_text)
        print("[EMAIL_DEBUG] Message content set")

        img_file = Path(image_path)
        if not img_file.exists():
            print(f"[WARN] Image not found at {image_path}; sending without image.")
        else:
            print(f"[EMAIL_DEBUG] Processing image: {image_path}")
            mime_type, _ = mimetypes.guess_type(img_file.name)
            if not mime_type:
                mime_type = "application/octet-stream"
            maintype, subtype = mime_type.split('/', 1)
            data = img_file.read_bytes()
            print(f"[EMAIL_DEBUG] Image processed - Type: {mime_type}, Size: {len(data)} bytes")

            if inline:
                cid = make_msgid(domain="inline.image")[1:-1]  # strip <>
                html = f"""
                <html><body style='font-family:Arial,Helvetica,sans-serif;'>
                  <p>{body_text}</p>
                  <img src=\"cid:{cid}\" alt=\"Embedded Image\" style=\"max-width:600px;border:1px solid #ccc;padding:4px;\" />
                </body></html>
                """
                msg.add_alternative(html, subtype='html')
                # Attach related image to the HTML part
                for part in msg.iter_parts():
                    if part.get_content_type() == 'text/html':
                        part.add_related(data, maintype=maintype, subtype=subtype, cid=f"<{cid}>", filename=img_file.name)
                        break
                print("[EMAIL_DEBUG] Inline image attached")
            else:
                msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=img_file.name)
                print("[EMAIL_DEBUG] Image attached as attachment")

        print("[EMAIL_DEBUG] Attempting SMTP connection...")
        context = ssl._create_unverified_context()
        print(f"[EMAIL_DEBUG] Email sender: {EMAIL_SENDER}")
        print(f"[EMAIL_DEBUG] Password length: {len(EMAIL_PASSWORD) if EMAIL_PASSWORD else 0}")
        
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=context, timeout=30) as smtp:
            print("[EMAIL_DEBUG] SMTP connection established")
            smtp.login(EMAIL_SENDER, EMAIL_PASSWORD)
            print("[EMAIL_DEBUG] SMTP login successful")
            smtp.send_message(msg)
            print("[EMAIL_DEBUG] Message sent successfully")
        
        print("[SUCCESS] Email with image sent to", recipient, f"(inline={inline})")
        
    except Exception as e:
        print(f"[EMAIL_ERROR] Failed to send email: {type(e).__name__}: {e}")
        import traceback
        print(f"[EMAIL_ERROR] Full traceback: {traceback.format_exc()}")
        raise

# if __name__ == "__main__":
#     # Example inline image email (update image filename if needed)
#     send_email_with_image(
#         subject="Inline Image Test",
#         body_text="Here is an inline image.",
#         image_path="birthday_card_custom.png",
#         inline=True,
#     )