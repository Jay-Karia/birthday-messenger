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
                "content": "You will be provided with the name of a student from SRM Institute of Science and Technology, Tiruchirappalli. Generate a formal birthday greeting in the voice of the Head of the Department, Computer Science and Engineering. The message should be concise (limited to three sentences), warm yet professional, and should highlight good wishes for health, happiness, and academic success. Ensure that SRM Institute of Science and Technology, Tiruchirappalli is explicitly mentioned in the greeting. Conclude the message with the sign-off: Warm regards, Dr. Kanaga Suba Raja, Head of the Department, Computer Science and Engineering, SRM Institute of Science and Technology, Tiruchirappalli."
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