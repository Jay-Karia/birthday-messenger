import mimetypes
import requests
import os

def upload_media(file_path):
    GRAPH_API_TOKEN = os.getenv("GRAPH_API_TOKEN")
    WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    if not GRAPH_API_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print("Missing environment variables (GRAPH_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID)")
        return None
    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"  # fallback
    url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/media"
    headers = {
        "Authorization": f"Bearer {GRAPH_API_TOKEN}"
    }
    files = {
        "file": (os.path.basename(file_path), open(file_path, "rb"), mime_type),
        "messaging_product": (None, "whatsapp")
    }
    response = requests.post(url, headers=headers, files=files)
    print("Upload Status:", response.status_code)
    print("Upload Response:", response.text)
    if response.status_code == 200:
        return response.json().get("id")
    else:
        return None
def send_whatsapp(msg, recipient, image_path=None):
    GRAPH_API_TOKEN = os.getenv("GRAPH_API_TOKEN")
    WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
    if not GRAPH_API_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        print("Missing environment variables (GRAPH_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID)")
        return
    url = f"https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {GRAPH_API_TOKEN}",
        "Content-Type": "application/json"
    }
    media_id = upload_media(image_path)
    if not media_id:
        print("Failed to upload image")
        return
    data = {
        "messaging_product": "whatsapp",
        "to": str(recipient),
        "type": "image",
        "image": {
            "id": media_id,
            "caption": msg if msg else ""
        }
    }
    response = requests.post(url, headers=headers, json=data)
    print("Send Response:", response.text)