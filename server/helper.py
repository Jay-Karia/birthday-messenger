import os
import base64
import mimetypes
from pathlib import Path
from dotenv import load_dotenv, find_dotenv
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import (
    Mail, Attachment, FileContent, FileName, 
    FileType, Disposition, ContentId
)

dotenv_path = find_dotenv()
print(f"[DEBUG] Loading .env from: {dotenv_path}")
load_dotenv(dotenv_path=dotenv_path, override=True)



def validate_env():
    missing = [k for k in ["SENDGRID_API_KEY", "EMAIL_SENDER"] if not os.environ.get(k)]
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
    Send an email with an optional image using SendGrid.
    
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
        SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")

        if not recipient:
            raise ValueError("Recipient email address is required")

        print(f"[INFO] Preparing email to {recipient} with subject '{subject}'")

        # Handle image
        img_file = Path(image_path)
        if not img_file.exists():
            print(f"[WARN] Image not found at {image_path}; sending without image.")
            inline = False

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

        # Create message
        message = Mail(
            from_email=EMAIL_SENDER,
            to_emails=recipient,
            subject=subject,
            html_content=html_content
        )

        # Add CC if provided
        if cc:
            message.cc = cc

        # Add image attachment
        if img_file.exists():
            with open(img_file, 'rb') as f:
                data = f.read()

            encoded_file = base64.b64encode(data).decode()

            # Guess MIME type
            mime_type, _ = mimetypes.guess_type(img_file.name)
            if not mime_type:
                mime_type = "application/octet-stream"

            attachment = Attachment()
            attachment.file_content = FileContent(encoded_file)
            attachment.file_name = FileName(img_file.name)
            attachment.file_type = FileType(mime_type)

            if inline:
                # Inline attachment with Content ID
                attachment.disposition = Disposition('inline')
                attachment.content_id = ContentId(cid)
            else:
                # Regular attachment
                attachment.disposition = Disposition('attachment')

            message.attachment = attachment

        # Send email
        print("[INFO] Sending email via SendGrid...")
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)

        print(f"[SUCCESS] Email sent! Status code: {response.status_code}")
        print(f"[SUCCESS] Email with image sent to {recipient} (inline={inline})")

        return {
            "status": "success",
            "message": "Email sent successfully",
            "status_code": response.status_code
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
        error_msg = f"SendGrid error: {str(e)}"
        print(f"[ERROR] {error_msg}")
        print("[TIP] Check your SENDGRID_API_KEY and make sure sender email is verified")
        return {"status": "error", "error": error_msg}
