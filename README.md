# ProofLoad AI – Load Verification with Checkpoints

AI-powered tool that verifies loads against manifest lists, documents item condition, and compares reality across multiple checkpoints (Start → End).

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your TARS API key (https://router.tetrate.ai/api-keys)
npm install
npm start
```

Backend runs on `http://localhost:3001`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` (proxies API calls to backend)

### 3. Workflow

1. **Create Project** – Upload an expected list (CSV, XLSX, PDF, or image). Items are extracted as name, description, qty.
2. **Add Checkpoints** – Add Start, Checkpoint, or End inspections with photos. Each checkpoint is verified against the list and documents missing items, extra items, and condition.
3. **Compare** – When you have 2+ checkpoints, select From → To and get a delta report: missing since, added since, condition changes.

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **AI:** Tetrate Agent Router Service (TARS) – GPT-4o Vision
- **List extraction:** csv-parse, xlsx, pdf-parse + AI for PDF/image

## API

### Projects & Checkpoints

```
GET  /api/projects
POST /api/projects          # multipart: manifest (CSV/XLSX/PDF/image)
GET  /api/projects/:id
POST /api/projects/:id/checkpoints  # multipart: type (start|checkpoint|end), photos[]
GET  /api/projects/:id/delta?from=checkpointId&to=checkpointId
```

### Legacy (image vs image)

```
POST /api/verify
Fields: expectedImage, actualImage
```

## Scope

See `docs/SCOPE.md` for full MVP scope, in-scope/out-of-scope, and report formats.
