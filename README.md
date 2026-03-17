# hangugnese

English → Korean translator + linguistic origins

- Streams live Korean translation using Google Translate API, ML classification, and in-memory hanja dictionary
- Detects loanwords with custom logistic regression model
- Option to generate English prompt via OpenAI API on different verbosity settings and temperatures

## Layout

- `backend/` – FastAPI app (`main.py`) and translation logic (`util.py`)
- `frontend/` – Next.js app, main UI in `app/page.tsx`

## Running it locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`.  
The frontend talks to the backend at `http://localhost:8000` for `/translate` and `/generate`.
