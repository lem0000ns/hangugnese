from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
import json
import time
import re
import opencc

chrome_options = Options()
chrome_options.add_argument("--headless")
chrome_options.add_argument("--disable-gpu")

OUTPUT_PATH = "sino-ko_dict.json"

def save_progress(data: dict[str, str]) -> None:
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# Load existing progress so we can resume after a crash
try:
    with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
        kor_sino_dict = json.load(f)
    print(f"Resumed: {len(kor_sino_dict)} entries already in {OUTPUT_PATH}")
except FileNotFoundError:
    kor_sino_dict = {}

driver = webdriver.Chrome(options=chrome_options)
# driver.get("https://en.wiktionary.org/w/index.php?title=Category:Sino-Korean_words")
driver.get("https://en.wiktionary.org/w/index.php?title=Category:Sino-Korean_words&pagefrom=%EC%B2%9C%EC%A3%BC%EA%B5%90%0A%EC%B2%9C%EC%A3%BC%EA%B5%90#mw-pages")

converter = opencc.OpenCC('t2s.json')

def is_chinese(text: str) -> bool:
    """Return True only if every character in text is a CJK ideograph."""
    if not text:
        return False
    for ch in text:
        code = ord(ch)
        if not (0x4E00 <= code <= 0x9FFF):
            return False
    return True

words = 0
while True:
    category_url = driver.current_url

    start_section = driver.find_element(
        By.XPATH, "/html/body/div[3]/div/div[3]/main/div[3]/div[3]/div[2]/div[2]"
    )
    groups = start_section.find_elements(By.CLASS_NAME, "mw-category-group")

    page_items: list[tuple[str, str]] = []
    for group in groups:
        for item in group.find_elements(By.TAG_NAME, "li"):
            hangul = item.text
            href = item.find_element(By.TAG_NAME, "a").get_attribute("href")
            page_items.append((hangul, href))

    for hangul, href in page_items:
        if hangul[0].isdigit():
            continue
        if hangul in kor_sino_dict:
            continue  #
        driver.get(href)
        time.sleep(1)
        try:
            hanja_elem = driver.find_element(By.CSS_SELECTOR, ".Kore.mention")
            traditional_hanja = hanja_elem.text
            if not is_chinese(traditional_hanja):
                continue
            simplified_hanja = converter.convert(traditional_hanja)
            print(hangul + " -> " + simplified_hanja)
            kor_sino_dict[hangul] = simplified_hanja
            words += 1
            if words % 50 == 0:
                save_progress(kor_sino_dict)
        except Exception as e:
            print(e)
            continue

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

save_progress(kor_sino_dict)
print(f"Done. Saved {len(kor_sino_dict)} entries to {OUTPUT_PATH}")