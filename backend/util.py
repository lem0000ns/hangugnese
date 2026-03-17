from googletrans import Translator
from kiwipiepy import Kiwi
import spacy
import asyncio
import re
import json
import joblib
from jamo import h2j, j2hcj
from collections.abc import AsyncIterator
import pinyin
import opencc

converter = opencc.OpenCC('t2s.json')

translator = Translator()
kiwi = Kiwi()
nlp = spacy.load("en_core_web_sm")
model = joblib.load('ml/loanword_model.pkl')

SINO_KO_PATH = "sino-ko_dict.json"
hanja_dict = {}
with open(SINO_KO_PATH, "r", encoding="utf-8") as f:
    hanja_dict = json.load(f)

loanword_dict: dict[str, str] = {
    "컴퓨터": "computer",
    "인터넷": "internet",
    "코드": "code",
    "데이터": "data",
    "서비스": "service",
    "시스템": "system",
    "프로그램": "program",
    "프로젝트": "project",
    "테스트": "test",
    "모델": "model",
    "이메일": "email",
    "메일": "mail",
    "앱": "app",
    "어플": "app",
    "파일": "file",
    "폴더": "folder",
    "서버": "server",
    "클라이언트": "client",
    "데이터베이스": "database",
    "카메라": "camera",
    "비디오": "video",
    "사진": "photo",
    "이미지": "image",
    "뉴스": "news",
    "채팅": "chatting",
    "게임": "game",
    "로그인": "login",
    "로그아웃": "logout",
    "패스워드": "password",
    "비밀번호": "password",
    "버튼": "button",
    "링크": "link",
    "페이지": "page",
    "프로필": "profile",
    "메시지": "message",
    "메세지": "message",
    "토큰": "token",
    "아이디": "ID",
    "계정": "account",
    "옵션": "option",
    "설정": "settings",
    "업데이트": "update",
    "버전": "version",
    "라이브러리": "library",
    "프레임워크": "framework",
    "스튜디오": "studio",
    "클래스": "class",
    "오브젝트": "object",
    "모듈": "module",
    "메서드": "method",
    "함수": "function",
    "변수": "variable",
    "커피": "coffee",
    "콜라": "cola",
    "주스": "juice",
    "피자": "pizza",
    "버거": "burger",
    "샌드위치": "sandwich",
    "초콜릿": "chocolate",
    "케이크": "cake",
    "샐러드": "salad",
    "아이스크림": "ice cream",
    "디저트": "dessert",
    "마트": "mart",
    "쇼핑": "shopping",
    "세일": "sale",
    "쿠폰": "coupon",
    "티켓": "ticket",
    "콘서트": "concert",
    "뮤직": "music",
    "노트북": "notebook",
    "모니터": "monitor",
    "키보드": "keyboard",
    "마우스": "mouse",
    "헤드폰": "headphone",
    "이어폰": "earphone",
    "스피커": "speaker",
    "라디오": "radio",
    "텔레비전": "television",
    "에어컨": "air conditioner",
    "리모컨": "remote control",
    "프린터": "printer",
}

def simplified(hanja: str) -> str:
    return converter.convert(hanja)

def check_loanword(word: str) -> bool:
    confidence = model.predict_proba([j2hcj(h2j(word))])[0][1]
    return confidence > 0.6 # only accept with high confidence to prevent false positives (loanwords should be high confidence)

async def translate_loanword(word: str) -> str:
    result = await translator.translate(word, src="ko", dest="es")
    return result.text

async def get_pinyin(word: str) -> str:
    return pinyin.get(word)

async def translate_text_stream(english_text: str) -> AsyncIterator[dict[str, str]]:
    """Stream translation as NDJSON-compatible dicts: each yield is {"message": segment}."""
    names: dict[str, str] = {}
    doc = await asyncio.to_thread(nlp, english_text)
    for i, ent in enumerate(doc.ents):
        if ent.label_ in ["PERSON", "ORG", "GPE"]:
            placeholder = f"<NAME{i}>"
            names[placeholder] = ent.text
            english_text = english_text.replace(ent.text, placeholder)

    result = await translator.translate(english_text, src="en", dest="ko")
    korean_text = result.text

    for placeholder, name in names.items():
        korean_text = korean_text.replace(placeholder, name)

    token_list = await asyncio.to_thread(kiwi.tokenize, korean_text)
    idx = 0

    for t in token_list:
        surface, tag = t.form, t.tag
        start, length = t.start, t.len
        end = start + length
        effective_start = max(start, idx)
        if effective_start >= end:
            idx = max(idx, end)
            continue
        if start > idx:
            yield {"message": korean_text[idx:start], "pinyin": "", "original": ""}
        segment = korean_text[effective_start:end]
        is_hanja = is_loanword = False
        # if effective_start == start and tag in ("NNG", "NNP"):
            # if surface in hanja_dict:
            #     is_hanja = True
            #     segment = simplified(hanja_dict[surface])
            # elif check_loanword(surface):
            #     is_loanword = True
            #     segment = await translate_loanword(surface)
        if is_hanja:
            pinyin = await get_pinyin(segment)
            yield {"message": segment, "pinyin": pinyin, "original": surface}
        elif is_loanword:
            yield {"message": segment.upper(), "pinyin": "", "original": surface}
        else:
            yield {"message": segment, "pinyin": "", "original": ""}
        idx = max(idx, end)

    if idx < len(korean_text):
        yield {"message": korean_text[idx:], "pinyin": "", "original": ""}