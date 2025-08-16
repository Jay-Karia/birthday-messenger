from PIL import Image, ImageDraw, ImageFont

# Load your birthday card image
image_path = "./components/card.png"  # change to your file
img = Image.open(image_path)

# Create a drawing object
draw = ImageDraw.Draw(img)

# Choose a font (make sure you have the .ttf file)
font_path = "./components/font-title.ttf"  # replace with your font path
name_font = ImageFont.truetype(font_path, 50)  # font size for the name
msg_font = ImageFont.truetype(font_path, 20)   # font size for the message

# Text you want to add
name = "[NAME]"
message = "Wishing you the happiest birthday ever! 🎉"

# Positioning (x, y) — tweak as needed
name_position = (200, 150)  # name
msg_position = (200, 300)   # message

# Draw text onto image
draw.text(name_position, name, font=name_font, fill="blue")
draw.text(msg_position, message, font=msg_font, fill="black")

# Save or show
img.save("birthday_card_custom.png")
img.show()
