"""Append Korean loanwords from Wiktionary to dictionary_words.csv.

Skips words already in the file. Every appended row is labeled 1. Run from backend/ml.
"""

import csv
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

chrome_options = Options()
chrome_options.add_argument("--headless")
chrome_options.add_argument("--disable-gpu")

CSV_PATH = "dictionary_words.csv"

def load_existing_words() -> set[str]:
    try:
        with open(CSV_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return {row["word"] for row in reader}
    except FileNotFoundError:
        return set()

def contains_digit(text: str) -> bool:
    return any(char.isdigit() for char in text)

def append_to_csv(words: list[str], label: int = 1) -> None:
    with open(CSV_PATH, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        for word in words:
            writer.writerow([word, label])


existing = load_existing_words()
loanwords: list[str] = []

driver = webdriver.Chrome(options=chrome_options)
driver.get("https://en.wiktionary.org/w/index.php?title=Category:Korean_terms_borrowed_from_English&pagefrom=%EB%8B%A4%ED%81%AC%EC%84%9C%ED%81%B4%0A%EB%8B%A4%ED%81%AC%EC%84%9C%ED%81%B4#mw-pages")

while True:
    category_url = driver.current_url

    start_section = driver.find_element(
        By.XPATH, "/html/body/div[3]/div/div[3]/main/div[3]/div[3]/div[2]/div[2]"
    )
    groups = start_section.find_elements(By.CLASS_NAME, "mw-category-group")

    for group in groups:
        for item in group.find_elements(By.TAG_NAME, "li"):
            hangul = item.text
            if contains_digit(hangul):
                continue
            if hangul in existing or hangul in loanwords:
                continue
            print(hangul)
            loanwords.append(hangul)

    driver.get(category_url)
    time.sleep(1)

    try:
        next_link = driver.find_element(
            By.XPATH,
            "//*[@id=\"mw-pages\"]/a[2]",
        )
        next_link.click()
        time.sleep(1)
    except Exception as e:
        print(e)
        break

driver.quit()

append_to_csv(loanwords, label=1)
print(f"Done. Appended {len(loanwords)} loanwords to {CSV_PATH} (all with label 1)")
