# ProofLoad AI – Visual Load Verification

AI-powered tool that compares expected vs. actual load images and flags discrepancies.

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your TARS API key (https://router.tetrate.ai/api-keys)
npm start
```

Backend runs on `http://localhost:3001`

### 2. Frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173` (proxies API calls to backend)

### 3. Demo

1. Upload an "Expected Load" image (e.g., fridge + bed)
2. Upload an "Actual Load" image (e.g., bed only)
3. Click **Verify Load**
4. AI flags the missing fridge

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **AI:** Tetrate Agent Router Service (TARS) – GPT-4o Vision
- **Upload:** Multer (in-memory)

## API

```
POST /api/verify
Content-Type: multipart/form-data

Fields: expectedImage, actualImage
```

Response:

```json
{
  "status": "Verified | Mismatch",
  "missing_items": [],
  "extra_items": [],
  "summary": "string",
  "confidence": "Low | Medium | High"
}
```
