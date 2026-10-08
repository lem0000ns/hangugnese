import asyncio
import json
import os
import re
from collections.abc import AsyncIterator

import httpx
import joblib
import opencc
import pinyin
import spacy
from jamo import h2j, j2hcj

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

converter = opencc.OpenCC("t2s.json")

GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"
nlp = spacy.load("en_core_web_sm")
model = joblib.load(os.path.join(BASE_DIR, "ml", "loanword_model.pkl"))

# Chosen in ml/loanword_ml.ipynb: best F1 among cutoffs with precision of at least 0.85.
LOANWORD_THRESHOLD = 0.5

with open(os.path.join(BASE_DIR, "sino-ko_dict.json"), "r", encoding="utf-8") as f:
    hanja_dict: dict[str, str] = json.load(f)

# Longest first, so a compound particle is removed before the shorter one it ends with.
PARTICLES = sorted(
    [
        "에서는", "에서도", "에서의", "에게서", "에게는", "에게도", "으로는", "으로도", "으로서", "으로써",
        "까지는", "까지도", "부터는", "이라는", "이라고", "이라도",
        "처럼", "라는", "라고", "에서", "에게", "한테", "으로", "로서", "로써", "까지", "부터", "보다",
        "마다", "하고", "이나", "이랑", "조차", "마저", "밖에",
        "과", "와", "을", "를", "은", "는", "이", "가", "의", "에", "도", "만", "로", "께", "랑", "나", "야",
    ],
    key=len,
    reverse=True,
)

NAMED_ENTITY_LABELS = ("PERSON", "ORG", "GPE")


def strip_particles(token: str) -> str:
    """Drop non-hangul characters, one trailing particle, and a plural 들."""
    word = re.sub(r"[^\uac00-\ud7a3]", "", token)
    for particle in PARTICLES:
        if word.endswith(particle) and len(word) > len(particle):
            word = word[: -len(particle)]
            break
    if word.endswith("들") and len(word) > 1:
        word = word[:-1]
    return word


def split_particles(token: str) -> tuple[str, str, str]:
    """Split a token into leading characters, the stem, and the trailing particle or punctuation."""
    stem = strip_particles(token)
    start = token.find(stem) if stem else -1
    if start < 0:
        return "", token, ""
    return token[:start], stem, token[start + len(stem):]


def find_hanja(token: str) -> tuple[str, str, str] | None:
    """Return (prefix, dictionary word, suffix) when the token is Sino-Korean.

    Stems of one syllable are skipped. Short stems collide with unrelated entries
    (함께 -> 함, 하는 -> 하).
    """
    if token in hanja_dict:
        return "", token, ""
    prefix, stem, suffix = split_particles(token)
    if len(stem) >= 2 and stem in hanja_dict:
        return prefix, stem, suffix
    return None


class TranslationError(Exception):
    """The translation provider failed or is not configured."""


async def google_translate(text: str, src: str, dest: str) -> str:
    """Translate text with the Google Cloud Translation API (v2)."""
    api_key = os.getenv("GOOGLE_TRANSLATE_API_KEY")
    if not api_key:
        raise TranslationError("GOOGLE_TRANSLATE_API_KEY not set in environment")

    async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
            GOOGLE_TRANSLATE_URL,
            params={"key": api_key},
            json={"q": text, "source": src, "target": dest, "format": "text"},
        )
    if res.status_code != 200:
        raise TranslationError(f"Google Translate returned {res.status_code}: {res.text[:300]}")
    return res.json()["data"]["translations"][0]["translatedText"]


def simplified(hanja: str) -> str:
    """Convert traditional hanja to simplified Chinese."""
    return converter.convert(hanja)


def loanword_confidence(word: str) -> float:
    """Probability that the particle-stripped word is a Western loanword."""
    stem = strip_particles(word)
    if not stem:
        return 0.0
    return model.predict_proba([j2hcj(h2j(stem))])[0][1]


def check_loanword(word: str) -> bool:
    """True when loanword confidence is above LOANWORD_THRESHOLD."""
    return bool(loanword_confidence(word) > LOANWORD_THRESHOLD)


async def translate_loanword(word: str) -> str:
    """Spanish rendering of a Korean loanword, shown in place of the hangul."""
    return await google_translate(word, src="ko", dest="es")


def get_pinyin(word: str) -> str:
    """Mandarin pinyin for a simplified hanja string."""
    return pinyin.get(word)


async def get_english_definition(word: str, kind: str = "ko") -> str:
    """English meaning of a Korean word, or of simplified Chinese when kind is 'hanja'."""
    src = "zh-CN" if kind == "hanja" else "ko"
    return await google_translate(word, src=src, dest="en")


def hold_named_entities(english_text: str) -> tuple[str, dict[str, str]]:
    """Replace person, organization, and place names with placeholders."""
    names: dict[str, str] = {}
    doc = nlp(english_text)
    for i, ent in enumerate(doc.ents):
        if ent.label_ in NAMED_ENTITY_LABELS:
            placeholder = f"<NAME{i}>"
            names[placeholder] = ent.text
            english_text = english_text.replace(ent.text, placeholder)
    return english_text, names


def restore_named_entities(text: str, names: dict[str, str]) -> str:
    """Put the original names back in place of their placeholders."""
    for placeholder, name in names.items():
        text = text.replace(placeholder, name)
    return text


async def annotate_token(surface: str) -> dict[str, str]:
    """Classify one Korean token as hanja, a loanword, or plain text."""
    hanja_match = find_hanja(surface)
    if hanja_match:
        prefix, word, suffix = hanja_match
        hanja = simplified(hanja_dict[word])
        return {
            "message": hanja,
            "pinyin": get_pinyin(hanja),
            "original": surface,
            "prefix": prefix,
            "suffix": suffix,
        }

    if check_loanword(surface):
        prefix, stem, suffix = split_particles(surface)
        translated = await translate_loanword(stem)
        return {
            "message": translated.upper(),
            "pinyin": "",
            "original": surface,
            "prefix": prefix,
            "suffix": suffix,
        }

    return {"message": surface, "pinyin": "", "original": ""}


async def translate_text_stream(english_text: str) -> AsyncIterator[dict[str, str]]:
    """Yield translation segments as they are classified.

    Each item has message, pinyin, and original. Hanja and loanword items also
    include prefix and suffix, so particles and punctuation stay unhighlighted.
    """
    english_text, names = await asyncio.to_thread(hold_named_entities, english_text)
    korean_text = await google_translate(english_text, src="en", dest="ko")
    korean_text = restore_named_entities(korean_text, names)

    idx = 0
    for match in re.finditer(r"\S+", korean_text):
        start, end = match.span()
        if start > idx:
            yield {"message": korean_text[idx:start], "pinyin": "", "original": ""}
        yield await annotate_token(match.group(0))
        idx = end

    if idx < len(korean_text):
        yield {"message": korean_text[idx:], "pinyin": "", "original": ""}
