import asyncio
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from util import translate_text_stream

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Hello World"}


@app.get("/translate/{text}")
async def translate(text: str):
    async def ndjson_stream():
        async for obj in translate_text_stream(text):
            yield (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
            await asyncio.sleep(0.08)

    return StreamingResponse(
        ndjson_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )