import os
import base64
import mimetypes
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from dotenv import load_dotenv, find_dotenv

dotenv_path = find_dotenv()
print(f"[DEBUG] Loading .env from: {dotenv_path}")
load_dotenv(dotenv_path=dotenv_path, override=True)



def validate_env():
    missing = [k for k in ["EMAIL_SENDER", "EMAIL_PASSWORD"] if not os.environ.get(k)]
    if missing:
        raise RuntimeError(f"Missing env vars: {', '.join(missing)}")


def send_email_with_image(
    subject: str,
    body_text: str,
    image_path: str,
    recipient: str | None = None,
    inline: bool = True,
    cc: list[str] | None = None,
):
    """
    Send an email with an optional image using SMTP.
    
    Args:
        subject: Email subject line
        body_text: Plain text or HTML body of the email
        image_path: Path to the image file
        recipient: Recipient email address
        inline: If True, embed image in email body; if False, attach as file
        cc: List of CC email addresses
    """
    try:
        # Diagnostics for .env loading
        from dotenv import find_dotenv
        env_path = find_dotenv()
        validate_env()

        EMAIL_SENDER = os.environ.get("EMAIL_SENDER")
        EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD")

        if not recipient:
            raise ValueError("Recipient email address is required")

        print(f"[INFO] Preparing email to {recipient} with subject '{subject}'")

        # Handle image
        img_file = Path(image_path)
        if not img_file.exists():
            print(f"[WARN] Image not found at {image_path}; sending without image.")
            inline = False

        # Create multipart message
        message = MIMEMultipart('related')
        message['From'] = EMAIL_SENDER
        message['To'] = recipient
        if cc:
            message['Cc'] = ', '.join(cc)
        message['Subject'] = subject

        # Create HTML content
        if inline and img_file.exists():
            # Inline image with Content ID
            cid = "inline-image"
            html_content = f"""
            <html>
            <body style='font-family:Arial,Helvetica,sans-serif;'>
                <p>{body_text}</p>
                <img src=\"cid:{cid}\" alt=\"Embedded Image\" style=\"max-width:600px;border:1px solid #ccc;padding:4px;\" />
            </body>
            </html>
            """
        else:
            # Simple HTML without inline image
            html_content = f"""
            <html>
            <body style='font-family:Arial,Helvetica,sans-serif;'>
                <p>{body_text}</p>
            </body>
            </html>
            """

        # Attach HTML content
        message.attach(MIMEText(html_content, 'html'))

        # Add image attachment
        if img_file.exists():
            with open(img_file, 'rb') as attachment:
                # Guess MIME type
                mime_type, _ = mimetypes.guess_type(img_file.name)
                if not mime_type:
                    mime_type = "application/octet-stream"

                maintype, subtype = mime_type.split('/', 1)
                part = MIMEBase(maintype, subtype)
                part.set_payload(attachment.read())
                encoders.encode_base64(part)

                if inline:
                    # Inline attachment with Content ID
                    part.add_header('Content-Disposition', 'inline', filename=img_file.name)
                    part.add_header('Content-ID', '<inline-image>')
                else:
                    # Regular attachment
                    part.add_header('Content-Disposition', 'attachment', filename=img_file.name)

                message.attach(part)

        # Send email
        print("[INFO] Sending email via SMTP...")
        
        # Determine SMTP server based on email domain
        if EMAIL_SENDER.endswith('@outlook.com') or EMAIL_SENDER.endswith('@hotmail.com'):
            smtp_server = "smtp-mail.outlook.com"
            smtp_port = 587
        elif EMAIL_SENDER.endswith('@gmail.com'):
            smtp_server = "smtp.gmail.com"
            smtp_port = 587
        else:
            # Default to generic SMTP
            smtp_server = "smtp.gmail.com"
            smtp_port = 587

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            cc_list = cc if cc else []
            to_list = [recipient] + cc_list
            server.sendmail(EMAIL_SENDER, to_list, message.as_string())

        print(f"[SUCCESS] Email sent to {recipient} (inline={inline})")

        return {
            "status": "success",
            "message": "Email sent successfully",
            "status_code": 200
        }

    except FileNotFoundError as e:
        error_msg = f"File not found: {str(e)}"
        print(f"[ERROR] {error_msg}")
        return {"status": "error", "error": error_msg}

    except ValueError as e:
        error_msg = str(e)
        print(f"[ERROR] {error_msg}")
        return {"status": "error", "error": error_msg}

    except Exception as e:
        error_msg = f"SMTP error: {str(e)}"
        print(f"[ERROR] {error_msg}")
        print("[TIP] Check your EMAIL_SENDER and EMAIL_PASSWORD, and ensure the account allows SMTP access")
        return {"status": "error", "error": error_msg}
