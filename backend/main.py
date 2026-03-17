import asyncio
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from util import translate_text_stream
from openai import OpenAI
from dotenv import load_dotenv
import os
from enum import Enum

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY not set in environment")
client = OpenAI(api_key=api_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://hangugnese.vercel.app",
        "https://hangugnese.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Verbosity(Enum):
    LOW = 1   # modest
    MEDIUM = 2  # adequate
    HIGH = 3   # rich

@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/translate/{text}")
async def translate(text: str):
    async def ndjson_stream():
        async for obj in translate_text_stream(text):
            yield (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
            await asyncio.sleep(0.04)

    return StreamingResponse(
        ndjson_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )

VERBOSITY_MAP = {"modest": Verbosity.LOW, "adequate": Verbosity.MEDIUM, "rich": Verbosity.HIGH}


@app.get("/generate")
async def generate(
    prompt: str | None = None,
    temperature: float = 0.7,
    verbosity: str = "adequate",
):
    vb = VERBOSITY_MAP.get(verbosity, Verbosity.MEDIUM)
    max_tokens = 400
    max_sentences = 6
    vocab_description = "at a very sophisticated and advanced level; use your imagination"

    if vb == Verbosity.LOW:
        max_sentences = 2
        vocab_description = "relatively simple and easy to understand for a very beginner's children book level"
    elif vb == Verbosity.MEDIUM:
        max_sentences = 4
        vocab_description = "level appropriate for a high school student"

    system_prompt = f"Generate about {max_sentences} sentences about the given topic. Keep the vocabulary {vocab_description}. Do not include line breaks. If the topic is inappropriate, generate about {max_sentences} sentences about the dangers of the topic."
    if prompt is None:
        prompt = "Anything you want."

    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": "Topic: " + prompt}],
        temperature=max(0.1, min(1.0, temperature)),
        max_tokens=max_tokens,
    )
    text = response.choices[0].message.content or ""
    return {"text": text}