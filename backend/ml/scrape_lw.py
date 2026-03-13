from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
import csv
import time
import re

chrome_options = Options()
chrome_options.add_argument("--headless")
chrome_options.add_argument("--disable-gpu")

CSV_PATH = "korean_loanwords.csv"

def load_existing_words() -> set[str]:
    try:
        with open(CSV_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return {row["word"] for row in reader}
    except FileNotFoundError:
        return set()


def append_to_csv(words: list[str], label: int = 1) -> None:
    with open(CSV_PATH, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        for word in words:
            writer.writerow([word, label])


existing = load_existing_words()
loanwords: list[str] = []

driver = webdriver.Chrome(options=chrome_options)
driver.get("https://en.wiktionary.org/wiki/Category:Korean_terms_borrowed_from_English")

words = 0
while True:
    category_url = driver.current_url

    start_section = driver.find_element(
        By.XPATH, "/html/body/div[3]/div/div[3]/main/div[3]/div[3]/div[2]/div[2]"
    )
    groups = start_section.find_elements(By.CLASS_NAME, "mw-category-group")

    for group in groups:
        for item in group.find_elements(By.TAG_NAME, "li"):
            hangul = item.text
            if hangul[0].isdigit():
                continue
            if hangul in existing or hangul in loanwords:
                continue
            loanwords.append(hangul)
            words += 1

    driver.get(category_url)
    time.sleep(1)

    try:
        next_link = driver.find_element(
            By.XPATH,
            "//a[@title='Category:Sino-Korean words' and contains(normalize-space(.), 'next page')]",
        )
        next_link.click()
        time.sleep(1)
    except Exception as e:
        print(e)
        break

driver.quit()

append_to_csv(loanwords, label=1)
print(f"Done. Appended {len(loanwords)} loanwords to {CSV_PATH} (all with label 1)")
