# hangugnese

English to Korean translator that marks where each word comes from. Sino-Korean words glow yellow and show simplified hanja with pinyin. Loanwords glow red and show a Spanish rendering of the borrowed word.

After Google Translate returns Korean, each word is classified in two steps. A hanja dictionary is checked first. Anything it misses goes to a logistic regression model that decides whether the word is a Western loanword.

## Particle stripping

Both steps look at the stem, not the word as it appears in the sentence. `strip_particles` in `backend/util.py` does three things, in order:

1. Drop anything that is not a hangul syllable, so `"커피".` becomes `커피`.
2. Remove one trailing particle. The list is sorted longest-first, so `에서는` is removed before `는`. `커피를` becomes `커피`, and `팬들에게` becomes `팬`.
3. Remove a plural `들` when it is all that is left on the end.

The characters that were peeled off (quotes, the particle, punctuation) are kept as a prefix and suffix. The highlight sits on the stem, and the particle stays plain text beside it. `커피를` is shown as **CAFÉ**`를`.

One-syllable stems are not looked up in the hanja dictionary. A short stem collides with unrelated entries: `함께` strips to `함`, and `하는` strips to `하`.

## What the model sees

The classifier never receives the raw hangul. Training and the live app share the same preprocessing:

1. Strip particles, the same way as above.
2. Decompose the stem into jamo. `학교` becomes `ㅎㅏㄱㄱㅛ`.

A character n-gram vectorizer (widths 1 through 4, including word boundaries) turns that jamo string into features, and a logistic regression turns the features into a probability. A word is marked as a loanword when that probability is above `LOANWORD_THRESHOLD` (0.5). The cutoff is the one with the best F1 among thresholds whose precision is at least 0.85, measured on held-out translated paragraphs.

Hanja matches skip the model. The dictionary already decided those.

## How the training data is built

`backend/ml/build_training_data.py` writes `korean_loanwords.csv`. Each row is a word and a label: `1` for a loanword, `0` otherwise. The file is four sources concatenated, and the first copy of a word wins.

**Dictionary words.** `dictionary_words.csv` is the seed list. `scrape_lw.py` appends Korean words Wiktionary marks as borrowed from English. `generate_pk.py` asks GPT for more mid-frequency loanwords and appends those too. Both write label `1` and skip words already in the file. Native words already in the file stay label `0`.

**Sino-Korean negatives.** Every hangul entry in `sino-ko_dict.json` is added with label `0`, unless that spelling is already a known loanword. `sino-ko_scrape.py` rebuilds the dictionary from Wiktionary's Sino-Korean category and stores simplified hanja.

**Particle-augmented copies.** Each dictionary noun gets one extra row with a particle attached and the same label. The particle agrees with the final syllable: a word with a batchim (final consonant) takes `을`, and one without takes `를`, and the same rule covers `이/가`, `은/는`, `으로/로`, and a few particles that do not change. `커피` produces a row like `커피를`. This is how the model learns that a particle on a loanword is still that loanword.

**Translated paragraphs.** About a hundred everyday topics are drafted in English at the same three verbosity levels the app uses, then translated to Korean. GPT lists the loanword tokens in each Korean paragraph. A word is labeled `1` when any of these is true:

- its stem is a known dictionary loanword
- it is a known loanword plus a `하다` or `되다` ending, such as `쇼핑하는` or `업데이트된`
- GPT listed that word, or the stem of that word

Words that are still uncertain get a second judgment from a stronger model. That set is GPT loanword guesses that are not in the dictionary, plus other words the current model already scores above the threshold. If the word or its stem is in the hanja dictionary, the label is forced to `0`.

When the same spelling is a loanword in one sentence and not in another, the majority label is kept. About 20% of paragraphs are held out by a stable hash of the topic and never enter training. Those words are written to `loanword_eval.csv` with every occurrence kept, so the score reflects running text rather than a unique-word list. API calls are cached in `sentence_corpus.jsonl` and `verified_labels.json`.

## Fitting the model

`backend/ml/loanword_ml.ipynb` reads `korean_loanwords.csv`, applies the jamo preprocessing, and fits the logistic regression on every remaining row. `loanword_eval.csv` was never part of that file. Words the app would show as hanja are dropped from the eval, because the app never asks the model about them. The notebook saves `loanword_model.pkl` and prints the threshold to copy into `LOANWORD_THRESHOLD` in `backend/util.py`.

Run the data scripts from `backend/ml` with the backend virtualenv. Run `sino-ko_scrape.py` from `backend/`.

## Running it locally

Create `backend/.env` with `OPENAI_API_KEY` and `GOOGLE_TRANSLATE_API_KEY`.

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` (for example in `frontend/.env.local`) so the page calls the local API.
