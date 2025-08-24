# Server

## 🛠 Setup

### Install dependencies
```bash
pip install -r requirements.txt
```

### Run the server
```bash
python main.py
```

---

## 🔌 API Endpoints

### POST `/send_card`
Send a birthday message to a user.

**Request Body**
```json
{
  "recipient": "string",
  "name": "string",
  "recipient_phone": "string"
}
```

---

### POST `/login`
Login in as an admin.

**Request Body**
```json
{
  "user": "string",
  "password": "string"
}
```

---

### POST `/logout`
Logout from the session.

---

### GET `/filter&date=dd-mm`
Filter the data from the given date.

> Note: Specifying the year is not mandatory. It will filter from month and date given.

---
