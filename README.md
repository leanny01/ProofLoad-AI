# ProofLoad AI — Load Verification with Checkpoints

AI-powered load verification that compares manifests against photos, documents item condition, and compares reality across multiple checkpoints (Start → End).

---

## Documentation

| Document | Description |
|----------|-------------|
| [**docs/**](docs/README.md) | Documentation index |
| [**Project Overview**](docs/PROJECT_OVERVIEW.md) | App summary, AI features, Tetrate usage, target user, implementation |
| [**Scope**](docs/SCOPE.md) | MVP scope, in/out of scope, expected formats, report schemas, success criteria |
| [**AI Verification Agent**](docs/AI_VERIFICATION_AGENT.md) | Agent spec for image comparison: inputs, outputs, rules |
| [**Integration Standards**](docs/AGENT.md) | TARS integration patterns, security, streaming, cost controls |

---

## Setup Notes

### Prerequisites

- Node.js 18+
- TARS API key from [router.tetrate.ai/api-keys](https://router.tetrate.ai/api-keys)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env and set TARS_API_KEY
npm install
npm start
```

Backend runs on `http://localhost:3001`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` (proxies `/api` to backend).

### 3. Verify

- Health: `GET http://localhost:3001/api/health`
- Open `http://localhost:5173` and create a project by uploading a manifest (CSV, XLSX, PDF, or image).

---

## Demo Credentials

**No login required.** ProofLoad AI does not use authentication in the MVP. All features are available immediately.

**Demo workflow:**

1. **Create Project** — Upload a manifest. Use `backend/test-sample.csv` or any CSV/XLSX/PDF/image with items.
2. **Add Checkpoint** — Add a Start, Checkpoint, or End inspection with 1–20 photos.
3. **Compare** — With 2+ checkpoints, select From → To to view delta (missing, added, condition changes).

---

## Internal Notes

- **Tetrate usage:** All AI calls go through TARS (`api.router.tetrate.ai`) to GPT-4o. See [Project Overview](docs/PROJECT_OVERVIEW.md) for details.
- **Stateless MVP:** Projects are stored in memory; data is lost on backend restart.
- **Legacy endpoint:** `POST /api/verify` (expectedImage + actualImage) remains for simple image-vs-image comparison.
- **Sample data:** `backend/test-sample.csv` is provided for quick testing.

---

## API Quick Reference

```
GET  /api/projects
POST /api/projects                    # multipart: manifest
GET  /api/projects/:id
POST /api/projects/:id/checkpoints     # multipart: type, photos[]
GET  /api/projects/:id/delta?from=&to=
POST /api/verify                      # multipart: expectedImage, actualImage (legacy)
```
