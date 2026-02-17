# ProofLoad AI — Project Overview

## App Summary

**ProofLoad AI** is a load verification application that compares what *should* be in a shipment (manifest) against photos of what was *actually* loaded. It replaces manual visual inspection in logistics workflows.

Users upload an expected list (manifest) in multiple formats—CSV, XLSX, PDF, or images—and capture photos of the actual load at different checkpoints (start, mid-route, end). The system produces structured verification reports that flag missing items, extra items, and condition issues (damage, contamination, etc.), with evidence trails linking findings to specific photos.

**Why it matters:** Manual verification is slow, error-prone, and subjective. ProofLoad AI automates comparison, provides audit-ready reports, and surfaces uncertainty as "NeedsReview" instead of guessing—reducing disputes and enabling faster, more consistent load verification.

---

## AI Feature Summary

| Capability | Role | Enhances UX |
|------------|------|-------------|
| **Manifest extraction** | Extract line items (name, qty, description) from CSV, XLSX, PDF text, and images via GPT-4o Vision | Supports real-world formats—no strict template required; scanned or photographed manifests work |
| **Checkpoint verification** | Compare expected items to load photos; classify quantities and condition (OK, damaged, crushed, wet, etc.); identify extra items | Gives item-level reconciliation with confidence; flags what passed, failed, or needs review |
| **Delta comparison** | Compare two checkpoints (e.g., Start ↔ End) for condition changes and item movements | Highlights damage incurred in transit and items missing/added between stops |
| **Structured output** | All AI calls return validated JSON with fixed schemas | Enables automation, reporting, and downstream integrations without parsing free text |

The system explicitly prioritizes *not hallucinating* over guessing: ambiguous evidence yields `Unknown` and `NeedsReview` instead of overconfident claims.

---

## Tetrate

ProofLoad AI uses **Tetrate Agent Router Service (TARS)** as its sole AI gateway. All AI traffic flows through TARS to GPT-4o.

| Usage | Details |
|-------|---------|
| **TARS routing** | Base URL `https://api.router.tetrate.ai/v1`; OpenAI-compatible `/chat/completions` |
| **Model** | `gpt-4o` (configurable via `AI_MODEL` env) for both text and vision tasks |
| **Endpoints** | One API key (`TARS_API_KEY` or `OPENAI_API_KEY`), server-side only |
| **Services using TARS** | `listExtractionService.js` (manifest extraction from PDF/image), `checkpointVerificationService.js` (photo verification), `aiComparisonService.js` (legacy image-to-image compare) |

**Tools:** No external MCP tools; the app uses TARS Chat Completions with vision for image analysis and text extraction.

**Design choices:**
- Temperature `0` for deterministic, repeatable results
- Structured JSON responses with strict schema validation
- Token limits and timeouts for cost control and reliability

---

## Target User

**Who:** Logistics operators, warehouse staff, freight handlers, and drivers who verify loads at pick-up, in-transit, and delivery.

**Problem solved:**
- *Manual mismatch detection:* Slow and inconsistent; ProofLoad AI automates expected vs. actual comparison.
- *Damage documentation:* Condition taxonomy (broken, crushed, wet, etc.) gives standardized, auditable records.
- *Transit accountability:* Delta reports between Start and End checkpoints show what changed—missing items, new extras, or damage incurred in transit.
- *Format flexibility:* Accepts CSV, XLSX, PDF, and images, so users can work with whatever manifests they already have.

---

## Assumptions & constraints

- Photos are sufficiently clear to see at least item-level packaging/labels for a portion of the load.
- The expected list describes items at a human-recognizable granularity (not just internal SKUs with no visible markings).
- The system will prioritize **not hallucinating** over guessing; unclear evidence yields `Unknown` and `NeedsReview`.
- Typical job size is limited (e.g., ≤ 1 list file and ≤ 10–20 photos) to keep latency acceptable.

---

## Success criteria (MVP)

- Accepts all supported list file types and produces normalized expected items with warnings when needed.
- Produces a JSON report for any job, even when extraction/counting is imperfect.
- Identifies major mismatches (obvious missing/extra items) and obvious condition failures with evidence references.
- Clearly flags uncertainty with `NeedsReview` rather than overconfident claims.

---

## Out of scope (for MVP)

### Not guaranteed in MVP

- **Perfect counting** in cluttered / occluded photos (allowed to return `observed_qty=null`)
- **Barcode/QR scanning** and formal SKU-level identification
- **3D reasoning** (stack depth estimation) beyond what is clearly visible
- **Automatic photo annotation** (bounding boxes / drawn overlays)
- **Warehouse integration** (WMS/ERP), EDI, or carrier APIs
- **Long-term storage** of uploads or reports in a database (MVP may be stateless)
- **Multi-manifest** reconciliation in one job (MVP is exactly one expected list per job)
- **User accounts / auth / roles**, audit trails, or multi-tenant isolation
- **Human-in-the-loop review UI** beyond surfacing "NeedsReview" warnings
- **Internationalization** (languages, locales) beyond basic English text
- **Fraud detection / tamper detection** for images and documents

---

## Future scope candidates (post-MVP)

- Persistent job storage + report download links
- Human review/override workflow with annotations
- Barcode/label OCR improvements and SKU mapping
- Configurable policies per customer (allowed damage thresholds, tolerances)
- Retrieval (RAG) over manifests / historical loads for better matching
- Real-time streaming progress updates for long analyses

---

## Implementation

### Architecture

```
Frontend (React + Vite)
    ↓
Backend (Express.js)
    ├── /api/projects         — create project, list, get
    ├── /api/projects/:id/checkpoints — add checkpoint, upload photos
    ├── /api/projects/:id/delta — compare two checkpoints
    └── /api/verify           — legacy single-image compare
    ↓
TARS (api.router.tetrate.ai) → GPT-4o
```

**Key layers:**
- **Routes:** `projects.js` (CRUD, checkpoints, delta), `verify.js` (legacy)
- **Services:** `listExtractionService.js`, `checkpointVerificationService.js`, `deltaReportService.js`, `aiComparisonService.js`
- **Store:** In-memory `projectStore.js` (stateless MVP; no database)

### Design Decisions

1. **Server-side AI only** — All AI calls originate from the backend; API keys never reach the browser.
2. **Hybrid extraction** — CSV/XLSX parsed deterministically; PDF text and images use AI (GPT-4o Vision) for OCR-style extraction.
3. **Project + checkpoint model** — One manifest per project; multiple checkpoints (start/checkpoint/end) with photos and inspection reports.
4. **Condition taxonomy** — Fixed set of conditions (`as_loaded_ok`, `broken_damaged`, etc.) for consistent Pass/Fail/Unknown outcomes.
5. **Delta computation in code** — Delta report is computed locally by comparing checkpoint reports; AI is used only for per-checkpoint verification.
6. **In-memory store** — MVP is stateless; projects lost on restart. Post-MVP could add DB.

### Tradeoffs

| Tradeoff | Choice | Rationale |
|----------|--------|-----------|
| Storage | In-memory | Keeps MVP simple; no DB setup; suitable for demos/single-run verification |
| Manifest formats | Deterministic for CSV/XLSX, AI for PDF/image | Balance between reliability (structured data) and flexibility (OCR/photo manifests) |
| Perfect counting | Allowed `observed_qty = null` | Avoids hallucination when items are occluded or uncountable |
| Multi-checkpoint context | Previous report passed to AI for condition comparison | Helps detect damage progression; increases token usage per checkpoint |

### Tech Stack

- **Backend:** Node.js, Express, Multer (uploads), OpenAI SDK (TARS-compatible)
- **Frontend:** React, Vite, Axios
- **Libraries:** csv-parse, xlsx, pdf-parse for deterministic extraction
