import requests

url = "http://127.0.0.1:5000/send_card"

data = {
    "recipient": "s.shaunbenedict@gmail.com",
    "name": "S. Shaun Benedict",
    "recipient_phone": "919486870915"
}

response = requests.post(url, json=data)

print("Status:", response.status_code)
print("Response:", response.json())
