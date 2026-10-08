"""Append GPT-suggested Korean loanwords to dictionary_words.csv.

Skips words already in the file. Run from backend/ml.
"""

import os

import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

CSV_PATH = "dictionary_words.csv"
TARGET = 2300
BATCH_SIZE = 300
MAX_BATCHES = 15

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def fetch_loanwords(batch_size: int = BATCH_SIZE) -> list[str]:
    """Ask for mid-frequency Korean loanwords, one word per line."""
    prompt = f"""
        너는 한국어 어휘 전문가야.

        외래어(주로 영어에서 온 차용어)만 나열해 줘.
        순우리말(고유어)이나 한자어는 포함하지 마.
        또한 고유명사(인명, 지명, 브랜드명)는 포함하지 마.

        각 단어는 최소 2글자 이상이어야 하고,
        한국어에서 일반 명사처럼 쓰이는 외래어로 골라.

        아주 흔한 외래어(예: 아이스크림, 버스, 택시, 커피, 컴퓨터 등)는 제외하고,
        비교적 덜 흔하지만 실제로 쓰이는 외래어 위주로 선택해.
        너무 전문적이거나 거의 쓰이지 않는 단어도 피하고
        중간 정도 빈도의 외래어를 골라.

        {batch_size}개의 서로 다른 단어를 한 줄에 하나씩만 출력해.
        다른 설명, 번호, 기호는 쓰지 마.
        """
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=2048,
    )
    text = resp.choices[0].message.content or ""
    candidates: list[str] = []
    for line in text.splitlines():
        word = line.strip().split()[0] if line.strip() else ""
        if len(word) < 2 or " " in word:
            continue
        candidates.append(word)
    return candidates


def main() -> None:
    df = pd.read_csv(CSV_PATH)
    existing_words: set[str] = set(df["word"].astype(str))
    collected: set[str] = set()

    for _ in range(MAX_BATCHES):
        if len(collected) >= TARGET:
            break
        for word in fetch_loanwords():
            if word not in existing_words:
                collected.add(word)

    print(f"Collected {len(collected)} new candidate words.")
    if not collected:
        print("No new words collected; nothing appended.")
        return

    add_df = pd.DataFrame({"word": sorted(collected), "label": 1})
    add_df.to_csv(CSV_PATH, mode="a", header=False, index=False)
    print(f"Appended {len(add_df)} rows with label 1 to {CSV_PATH}.")


if __name__ == "__main__":
    main()
