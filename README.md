# Birthday Messenger

Cross‑platform desktop app to:

- Look up students with birthdays on a selected date (year‑agnostic filtering)
- Generate a personalized AI birthday message
- Create a custom birthday card image
- Send emails (via SendGrid) and WhatsApp image messages (Meta Graph API)
- Include father/mother contact details automatically if present


---

## ✨ Features

- Date picker (filters by MM-DD; year ignored)
- Token authentication (login once; cached client side for 1 hour)
- Dark / Light theme toggle
- Excel-based data source with parent contact info
- SendGrid email sending with card PNG attachment
- WhatsApp media message sending (optional; needs Graph credentials)
- AI-generated birthday text (Groq API)
- Parent (father/mother) emails + phones auto-included in sends

---

## 🔐 Environment Variables

Create a `.env`:

```
EMAIL_USER
SENDGRID_API_KEY
GROQ_API_KEY
WEBHOOK_VERIFY_TOKEN
GRAPH_API_TOKEN
PORT
WHATSAPP_PHONE_NUMBER_ID
AUTH_USER
AUTH_PASS
APP_SECRET
CERTIFICATE_PASSWORD
```

---

## 🚀 Setup Frontend (Development)

1. Install Electron dependencies:

```powershell
npm install
```

2. Run development mode:

```powershell
npm start
```

---

## ⚙️ Setup Backend

Read the server [`README.md`](/server/README.md) file.

---

## 🧩 Building & Packaging

Electron Forge scripts:

```powershell
# Dev
npm start

# Make distributables 
npm run make

# Windows-only quick package (with icon)
npm run package
```

Output artifacts go to `out/` or the forge default (`out` / `make` subfolders).

---

## 👥 Contributors

- [Jay-Karia](https://github.com/Jay-Karia)
- [shaunbenedict](https://github.com/shaunbenedict)

---

## 📝 License

MIT – see [`LICENSE`](/LICENSE).
