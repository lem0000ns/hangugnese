from openai import OpenAI
import pandas as pd
import dotenv
import os

dotenv.load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

csv_path = "korean_loanwords.csv"
df = pd.read_csv(csv_path)
existing_words: set[str] = set(df["word"].astype(str))

cur_words: set[str] = set()

def fetch_batch(use_loanwords: bool = False, batch_size: int = 300) -> list[str]:
    lw_prompt = f"""
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
    prompt = f"""
        너는 한국어 어휘 전문가야.

        순우리말(고유어)만 나열해 줘. 한자어, 일본어/영어 등 외래어, 고유명사(인명, 지명, 브랜드명)는 포함하지 마.

        각 단어는 최소 2글자 이상이어야 하고, 복합명사도 괜찮아.
        아주 흔한 기본 단어(예: 사람, 물, 하늘, 집 등)는 피하고,
        일상에서 쓰이긴 하지만 비교적 덜 흔한 순우리말 위주로 골라.
        너무 방언이거나 지나치게 희귀한 단어는 제외해.

        {batch_size}개의 서로 다른 단어를 한 줄에 하나씩만 출력해.
        다른 설명, 번호, 기호는 쓰지 마.
        """
    if use_loanwords:
        prompt = lw_prompt
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=2048,
    )
    text = resp.choices[0].message.content or ""
    candidates: list[str] = []
    for line in text.splitlines():
        w = line.strip().split()[0] if line.strip() else ""
        if not w:
            continue
        # Basic filters: at least 2 chars, no spaces
        if len(w) < 2 or " " in w:
            continue
        candidates.append(w)
    return candidates

TARGET = 2300
max_batches = 15

for _ in range(max_batches):
    if len(cur_words) >= TARGET:
        break
    batch = fetch_batch(use_loanwords=True)
    for w in batch:
        if w not in existing_words:
            cur_words.add(w)

print(f"Collected {len(cur_words)} new candidate words.")

if cur_words:
    add_df = pd.DataFrame({"word": sorted(cur_words), "label": 1})
    add_df.to_csv(csv_path, mode="a", header=False, index=False)
    print(f"Appended {len(add_df)} rows with label 1 to {csv_path}.")
else:
    print("No new words collected; nothing appended.")