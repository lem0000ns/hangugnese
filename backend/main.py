import asyncio
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI

from generation import PASSAGE_MAX_TOKENS, passage_instructions
from util import TranslationError, get_english_definition, translate_text_stream

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


def ndjson_line(obj: dict) -> bytes:
    """Encode one JSON object as a newline-delimited UTF-8 line."""
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")


@app.get("/")
async def root():
    """Health check. The frontend calls this on load to wake a sleeping host."""
    return {"status": "ok"}


@app.get("/translate/{text}")
async def translate(text: str):
    """Stream the Korean translation as newline-delimited JSON.

    The first segment is awaited here so a translation failure becomes an HTTP
    error instead of a broken stream.
    """
    segments = translate_text_stream(text)
    try:
        first = await anext(segments)
    except StopAsyncIteration:
        first = None
    except TranslationError as e:
        print(f"[translate] {e}")
        raise HTTPException(status_code=502, detail="Translation service failed")

    async def ndjson_stream():
        if first is None:
            return
        yield ndjson_line(first)
        async for obj in segments:
            # Short pause so the client can paint each token as it arrives.
            await asyncio.sleep(0.04)
            yield ndjson_line(obj)

    return StreamingResponse(
        ndjson_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )


@app.get("/generate")
async def generate(
    prompt: str | None = None,
    temperature: float = 0.7,
    verbosity: str = "adequate",
):
    """Draft an English passage about a topic at the requested verbosity and temperature."""
    if prompt is None:
        prompt = "Anything you want."

    response = await asyncio.to_thread(
        client.chat.completions.create,
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": passage_instructions(verbosity, guard_inappropriate=True)},
            {"role": "user", "content": "Topic: " + prompt},
        ],
        temperature=max(0.1, min(1.0, temperature)),
        max_tokens=PASSAGE_MAX_TOKENS,
    )
    text = response.choices[0].message.content or ""
    return {"text": text}


@app.get("/define")
async def define(word: str, kind: str = "ko"):
    """English definition for a Korean word, or for simplified Chinese when kind is 'hanja'."""
    try:
        definition = await get_english_definition(word, kind=kind)
    except TranslationError as e:
        print(f"[define] {e}")
        raise HTTPException(status_code=502, detail="Translation service failed")
    return {"definition": definition}
