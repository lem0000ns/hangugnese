from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from util import translate_text

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
async def translate(text: str) -> dict[str, str]:
    try:
        response = await translate_text(text)
        return {"message": response}
    except Exception as e:
        return {"message": str(e)}