# Server

## Setup

**Install dependencies**

`pip install -r requirements.txt`

**Set up environment variables in a .env file:**
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

**Run the server:**

`python main.py`

## API Endpoints

### `POST /send_card`

Send a birthday message to a user.

**Request Body:**

```json
{
  "recipient": "string",
  "name": "string",
  "recipient_phone": "string"
}
```

---

### `POST /login`

Login in as an admin

**Request Body:**

```json
{
  "user": "string",
  "password": "string",
}
```

---

### `POST /logout`

Logout from the session

---

### `GET /filter&date=dd-mm`

Filter the data from the given date

**Note**: Specifying the year is not mandatory. It will filter from month and date given.

---
