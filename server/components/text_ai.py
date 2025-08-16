import os
from dotenv import load_dotenv
from groq import AsyncGroq

load_dotenv()

async def text_gen(name):
    client = AsyncGroq(api_key=os.environ.get("GROQ_API_KEY"))
    
    # Await the coroutine here
    completion = await client.chat.completions.create(
        model="gemma2-9b-it",
        messages=[
            {
                "role": "system",
                "content": "You will be given a name of a student in SRMIST Trichy. You're supposed to wish them happy birthday. Limit to 3 sentences. Add relevant emojis.. less than 3 per sentence. Add SRMIST, Trichy name on it."
            },
            {
                "role": "user",
                "content": name
            },
        ],
        temperature=1,
        max_completion_tokens=1024,
        top_p=1,
        stream=False,
        stop=None
    )

    return completion.choices[0].message.content