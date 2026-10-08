"""Build the loanword training and evaluation CSVs.

Combines four sources:

  1. dictionary words from dictionary_words.csv (created from korean_loanwords.csv if missing)
  2. Sino-Korean words from sino-ko_dict.json, labeled as not loanwords
  3. those dictionary nouns with a particle attached (커피 -> 커피를)
  4. words from translated paragraphs, labeled by GPT, checked again where the label is
     uncertain, then cleared when the word is in the hanja dictionary

Writes korean_loanwords.csv for training and loanword_eval.csv for held-out paragraphs.
Every word occurrence is kept in the eval file so it matches running text. API results are
cached in sentence_corpus.jsonl and verified_labels.json.

Usage (from backend/ml):  ../venv/bin/python build_training_data.py
"""

import asyncio
import hashlib
import json
import os
import random
import re
import sys

import pandas as pd
from dotenv import load_dotenv
from openai import AsyncOpenAI

ML_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(ML_DIR)
sys.path.insert(0, BACKEND_DIR)
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

from generation import PASSAGE_MAX_TOKENS, VERBOSITY_LEVELS, passage_instructions
from util import (
    LOANWORD_THRESHOLD,
    google_translate,
    hanja_dict,
    loanword_confidence,
    strip_particles,
)

TRAIN_CSV = os.path.join(ML_DIR, "korean_loanwords.csv")
DICTIONARY_CSV = os.path.join(ML_DIR, "dictionary_words.csv")
EVAL_CSV = os.path.join(ML_DIR, "loanword_eval.csv")
CORPUS_JSONL = os.path.join(ML_DIR, "sentence_corpus.jsonl")
VERIFIED_JSON = os.path.join(ML_DIR, "verified_labels.json")

MODEL = "gpt-4o-mini"
VERIFY_MODEL = "gpt-4o"
VERIFY_BATCH = 80
CONCURRENCY = 5
EVAL_FRACTION = 0.2
SEED = 42

TOPICS = [
    "morning routines", "a farmers market", "a job interview", "recycling", "a road trip", "video game design",
    "a library visit", "learning a new language", "a wedding", "the ocean", "a bakery", "smartphones",
    "a hospital stay", "camping in winter", "basketball", "an art museum", "airport travel", "online classes",
    "a coffee shop", "the solar system", "gardening", "a hotel stay", "a movie theater", "social media",
    "working out at the gym", "a music festival", "cooking pasta", "a science fair", "a train journey",
    "a grocery store", "electric cars", "a zoo", "summer vacation", "the stock market", "a dentist visit",
    "robots", "a snowstorm", "a picnic", "fashion trends", "a radio show", "firefighters", "a chess tournament",
    "a rock band", "ancient history", "a startup company", "a broken laptop", "yoga", "a cruise ship",
    "a birthday party", "space exploration", "pets", "a day at the beach", "a soccer match", "climate change",
    "the history of the internet", "a family dinner", "a rainy day in the city", "a trip to the mountains",
    "starting a new job", "shopping at the mall", "school life", "a concert", "a visit to the doctor",
    "friendship", "a haunted house", "a small village", "a thunderstorm", "a car accident", "baking cookies",
    "a talent show", "a marathon", "a farm", "a lost wallet", "a theme park", "a news reporter", "a pizza restaurant",
    "a bookstore", "a camping trip", "a video call with family", "artificial intelligence", "a desert",
    "a rainforest", "an old photograph", "a piano lesson", "a bicycle ride", "a city park", "a police officer",
    "a fishing trip", "the Olympics", "a kitchen fire", "a school play", "a wildlife documentary",
    "a Korean drama", "online shopping", "a spa day", "a volcano", "a winter festival", "a chemistry lab",
    "a soccer coach", "a tennis tournament",
]

LABEL_PROMPT = """아래 한국어 문단의 어절 중에서 외래어(영어 등 서양 언어에서 온 차용어, 예: 커피, 인터넷, 팀, 골, 쇼핑)가 들어 있는 어절을 모두 찾아줘.
한자어(예: 건강, 교육, 학교)와 순우리말(예: 하늘, 마음)은 외래어가 아니니 제외해.
어절은 문단에 쓰인 그대로(조사 포함) 적어. 없으면 빈 배열을 돌려줘.
JSON 형식으로만 답해: {"loanwords": ["어절1", "어절2"]}

문단:
"""

VERIFY_PROMPT = """다음 한국어 어절 각각이 외래어(영어 등 서양 언어에서 온 차용어)를 포함하는지 판단해.
- 외래어 명사에 조사나 '하다'가 붙은 경우(예: 커피를, 쇼핑하는)는 true.
- 한자어(예: 전문성, 만화경, 건강), 순우리말(예: 더, 볼, 키울), 그 활용형은 false.
- 외래어 지명·인명(예: 이집트, 뉴욕)은 true.
JSON 형식으로만 답해: {"어절": true 또는 false, ...}

어절 목록:
"""

HADA_ENDINGS = ("하", "했", "해", "한", "할", "합", "함", "되", "된", "될", "됩", "됐", "돼")

NON_HANGUL = re.compile(r"[^\uac00-\ud7a3]")


def hangul_only(text: str) -> str:
    """Remove every character that is not a hangul syllable."""
    return NON_HANGUL.sub("", text)


def has_batchim(syllable: str) -> bool:
    """True when the syllable ends in a final consonant."""
    return (ord(syllable) - 0xAC00) % 28 != 0


def attach_particle(word: str, rng: random.Random) -> str:
    """Attach a random particle, picking the right form for the final syllable (커피를, 인터넷을)."""
    pairs = [("을", "를"), ("이", "가"), ("은", "는"), ("과", "와"), ("으로", "로"), ("이나", "나")]
    plain = ["의", "에", "에서", "도", "만", "처럼", "까지", "부터", "에게"]
    choice = rng.choice(pairs + [(p, p) for p in plain])
    return word + (choice[0] if has_batchim(word[-1]) else choice[1])


def paragraph_key(topic: str, verbosity: str) -> str:
    """Stable id for one topic at one verbosity."""
    return f"{verbosity}:{topic}"


def is_eval(key: str) -> bool:
    """Hold out a stable fraction of paragraphs for evaluation."""
    return int(hashlib.md5(key.encode()).hexdigest(), 16) % 100 < EVAL_FRACTION * 100


def load_dictionary_words() -> pd.DataFrame:
    """Load dictionary_words.csv, building it from the training CSV when it is missing."""
    if not os.path.exists(DICTIONARY_CSV):
        raw = pd.read_csv(TRAIN_CSV)
        raw["word"] = raw["word"].astype(str).str.replace(" ", "", regex=False)
        raw = raw[raw["word"].str.len() > 0].drop_duplicates()
        conflicting = raw.groupby("word")["label"].nunique()
        raw = raw[~raw["word"].isin(conflicting[conflicting > 1].index)]
        raw = raw.drop_duplicates("word").sort_values(["label", "word"])
        raw.to_csv(DICTIONARY_CSV, index=False)
        print(f"Created {os.path.basename(DICTIONARY_CSV)} from {os.path.basename(TRAIN_CSV)} ({len(raw)} unique words).")
    return pd.read_csv(DICTIONARY_CSV)


def append_jsonl(path: str, row: dict) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def read_json(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0, sort_keys=True)


def load_cache() -> dict[str, dict]:
    cache: dict[str, dict] = {}
    if os.path.exists(CORPUS_JSONL):
        with open(CORPUS_JSONL, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    row = json.loads(line)
                    cache[row["key"]] = row
    return cache


async def build_paragraph(client: AsyncOpenAI, topic: str, verbosity: str) -> dict:
    """Generate an English passage, translate it, and list the loanwords in the Korean."""
    gen = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": passage_instructions(verbosity)},
            {"role": "user", "content": "Topic: " + topic},
        ],
        temperature=0.9,
        max_tokens=PASSAGE_MAX_TOKENS,
    )
    english = (gen.choices[0].message.content or "").strip()
    korean = await google_translate(english, src="en", dest="ko")
    lab = await client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": LABEL_PROMPT + korean}],
        temperature=0,
        response_format={"type": "json_object"},
    )
    loanwords = json.loads(lab.choices[0].message.content or "{}").get("loanwords", [])
    return {
        "key": paragraph_key(topic, verbosity),
        "english": english,
        "korean": korean,
        "gpt_loanwords": [w for w in loanwords if isinstance(w, str)],
    }


async def collect_paragraphs() -> list[dict]:
    cache = load_cache()
    jobs = [(t, v) for t in TOPICS for v in VERBOSITY_LEVELS if paragraph_key(t, v) not in cache]
    print(f"{len(cache)} cached paragraphs, {len(jobs)} to fetch.")
    if jobs:
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        sem = asyncio.Semaphore(CONCURRENCY)
        failed = 0

        async def run(topic: str, verbosity: str):
            nonlocal failed
            async with sem:
                try:
                    row = await build_paragraph(client, topic, verbosity)
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(f"  failed {verbosity}:{topic}: {e}")
                    return
            cache[row["key"]] = row
            await asyncio.to_thread(append_jsonl, CORPUS_JSONL, row)

        await asyncio.gather(*(run(t, v) for t, v in jobs))
        if failed:
            print(f"{failed} paragraphs failed; re-run the script to retry them.")
    return list(cache.values())


def is_known_loanword(clean: str, stem: str, known_loanwords: set[str]) -> bool:
    """True when the word, or the word before a 하다/되다 ending, is a known loanword."""
    if stem in known_loanwords:
        return True
    # 쇼핑하는, 업데이트된: a known loanword followed by a 하다/되다 ending.
    for i in range(2, len(clean)):
        if clean[i] in HADA_ENDINGS and clean[:i] in known_loanwords:
            return True
    return False


def label_paragraph(row: dict, known_loanwords: set[str], verified: dict[str, bool]) -> list[tuple[str, int]]:
    """Label each word in a translated paragraph as a loanword (1) or not (0)."""
    gpt_words = {hangul_only(w) for w in row["gpt_loanwords"]}
    gpt_stems = {strip_particles(w) for w in row["gpt_loanwords"]}
    labeled = []
    for surface in row["korean"].split():
        clean = hangul_only(surface)
        if not clean:
            continue
        stem = strip_particles(surface)
        known = is_known_loanword(clean, stem, known_loanwords)
        is_loanword = known or clean in gpt_words or stem in gpt_stems
        if not known and clean in verified:
            is_loanword = verified[clean]
        if clean in hanja_dict or stem in hanja_dict:
            is_loanword = False
        labeled.append((surface, int(is_loanword)))
    return labeled


async def verify_words(words: list[str]) -> dict[str, bool]:
    """Ask a stronger model to judge uncertain words one by one; results are cached across runs."""
    verified: dict[str, bool] = await asyncio.to_thread(read_json, VERIFIED_JSON)
    todo = sorted(set(words) - set(verified))
    print(f"Verifying {len(todo)} uncertain words with {VERIFY_MODEL} ({len(verified)} cached).")
    if todo:
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        sem = asyncio.Semaphore(CONCURRENCY)

        async def run(batch: list[str]):
            async with sem:
                try:
                    res = await client.chat.completions.create(
                        model=VERIFY_MODEL,
                        messages=[{"role": "user", "content": VERIFY_PROMPT + "\n".join(batch)}],
                        temperature=0,
                        response_format={"type": "json_object"},
                    )
                    answers = json.loads(res.choices[0].message.content or "{}")
                except Exception as e:  # noqa: BLE001
                    print(f"  verification batch failed: {e}")
                    return
            for w in batch:
                if isinstance(answers.get(w), bool):
                    verified[w] = answers[w]

        batches = [todo[i : i + VERIFY_BATCH] for i in range(0, len(todo), VERIFY_BATCH)]
        await asyncio.gather(*(run(b) for b in batches))
        await asyncio.to_thread(write_json, VERIFIED_JSON, verified)
    return verified


def uncertain_words(paragraphs: list[dict], known_loanwords: set[str]) -> list[str]:
    """Words worth a second label: unmarked loanword guesses, and other words the model already flags."""
    words = []
    for row in paragraphs:
        for surface, label in label_paragraph(row, known_loanwords, {}):
            clean, stem = hangul_only(surface), strip_particles(surface)
            if clean in hanja_dict or stem in hanja_dict or is_known_loanword(clean, stem, known_loanwords):
                continue
            if label == 1 or loanword_confidence(surface) > LOANWORD_THRESHOLD:
                words.append(clean)
    return words


def main() -> None:
    rng = random.Random(SEED)

    dictionary = load_dictionary_words()
    dictionary["source"] = "dictionary"
    known_loanwords = set(dictionary.loc[dictionary["label"] == 1, "word"])

    sino_words = [w for w in hanja_dict if w and not NON_HANGUL.search(w) and w not in known_loanwords]
    sino = pd.DataFrame({"word": sino_words, "label": 0, "source": "sino-korean"})

    nouns = dictionary[~dictionary["word"].str.endswith("다")]
    augmented = pd.DataFrame({
        "word": [attach_particle(w, rng) for w in nouns["word"]],
        "label": nouns["label"].values,
        "source": "particle-augmented",
    })

    paragraphs = asyncio.run(collect_paragraphs())
    verified = asyncio.run(verify_words(uncertain_words(paragraphs, known_loanwords)))
    train_rows, eval_rows = [], []
    for row in sorted(paragraphs, key=lambda r: r["key"]):
        labeled = label_paragraph(row, known_loanwords, verified)
        if is_eval(row["key"]):
            eval_rows += [{"word": s, "label": lab} for s, lab in labeled]
        else:
            train_rows += [{"word": hangul_only(s), "label": lab} for s, lab in labeled]

    sentences = pd.DataFrame(train_rows)
    # One spelling can be labeled both ways across sentences. Keep the majority label.
    sentences = sentences.groupby("word", as_index=False)["label"].agg(lambda s: int(s.mean() >= 0.5))
    sentences["source"] = "sentences"

    combined = pd.concat([dictionary, sentences, sino, augmented], ignore_index=True)
    combined = combined.drop_duplicates("word", keep="first")
    combined[["word", "label"]].to_csv(TRAIN_CSV, index=False)
    pd.DataFrame(eval_rows).to_csv(EVAL_CSV, index=False)

    n_eval_paragraphs = sum(is_eval(r["key"]) for r in paragraphs)
    print(f"\nWrote {os.path.basename(TRAIN_CSV)}: {len(combined)} words")
    print(combined.groupby(["source", "label"]).size().unstack(fill_value=0).to_string())
    print(
        f"\nWrote {os.path.basename(EVAL_CSV)}: {len(eval_rows)} word occurrences from {n_eval_paragraphs} "
        f"held-out paragraphs ({sum(r['label'] for r in eval_rows)} loanword)"
    )

    for label, name in [(1, "loanword"), (0, "not loanword")]:
        pool = sentences.loc[sentences["label"] == label, "word"].tolist()
        sample = rng.sample(pool, min(30, len(pool)))
        print(f"\nSample sentence words labeled {name}: {' '.join(sample)}")


if __name__ == "__main__":
    main()
