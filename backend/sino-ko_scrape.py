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

driver = webdriver.Chrome(options=chrome_options)
driver.get("https://en.wiktionary.org/w/index.php?title=Category:Sino-Korean_words")

kor_sino_dict: dict[str, str] = {}

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

while True:
    category_url = driver.current_url

    # On the current category page, collect all (hangul, href) pairs
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

    # Now visit each word's page and extract hanja
    for hangul, href in page_items:
        if hangul[0].isdigit():
            continue
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

with open("sino-ko_dict.json", "w", encoding="utf-8") as f:
    json.dump(kor_sino_dict, f, ensure_ascii=False, indent=2)