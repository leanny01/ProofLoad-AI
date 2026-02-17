# ProofLoad AI — MVP Scope (Manifest + Photos Verification)

## Purpose

Define the **implementation scope** for the next iteration of ProofLoad AI: users upload an **expected list** (multiple formats) plus **actual load photos**, and the system returns a **verification report** comparing **items, quantities, and condition**.

This document is intentionally explicit about **in-scope**, **out-of-scope**, and **assumptions** to keep delivery predictable during the buildathon.

---

## In scope (MVP)

### Project + checkpoints (inspections) model

An MVP verification flow is organized as:

- **Project**: a container for one shipment/load over time
  - Holds **one expected list file** (the manifest) and the normalized `expected_items[]`
  - Holds **multiple checkpoints** (also called **inspections**) of reality captured at different times

Each **checkpoint** has:

- `checkpoint_id`
- `type`: `start | checkpoint | end` (or a user-defined label)
- `photos[]`: 1..N images
- An **inspection report** documenting reality at that time:
  - matched items, missing items, extra items, and item condition

The system also produces a **delta report** that compares two checkpoints (default: **Start ↔ End**):

- Items **missing since** an earlier checkpoint
- Items **added since** an earlier checkpoint (including new extras)
- Condition **changes** (ok → damaged, unknown → confirmed, etc.)

### Inputs supported

- **Expected list file (exactly 1 per verification job)**:
  - CSV (`.csv`)
  - Spreadsheet (`.xlsx` and optionally `.xls`)
  - PDF (`.pdf`) including scanned PDFs (treated as image/OCR)
  - Image (`.png`, `.jpg`, `.jpeg`, `.webp`)
- **Actual load photos (1..N)**:
  - Image formats: `.png`, `.jpg`, `.jpeg`, `.webp`

### Expected item schema (normalized)

The system will normalize the expected list into a canonical structure:

- **name**: required string
- **description**: optional string
- **qty**: required numeric field, may be `null` if unreadable/absent (then flagged)

### Extraction & normalization

- Extract expected items from the list file into normalized records.
- Capture extraction warnings and a confidence level.
- Basic normalization: whitespace trimming, simple unit/format cleanup, basic number parsing (e.g., `"10 pcs"` → `10`).

### Photo understanding (actual load)

- Identify **clearly visible** items in photos.
- For each identified item, attempt:
  - **observed_qty** (best-effort; may be `null` if not reliably countable)
  - **condition classification** (see taxonomy below)
- Provide an **evidence trail**: which photo(s) support each finding.
- Identify **extra items**: any observed item that cannot be matched to a list item is categorized as **Extra** for that checkpoint.

### Condition taxonomy (MVP)

The system will classify condition into one of:

- `as_loaded_ok`
- `broken_damaged`
- `crushed`
- `wet_contaminated`
- `open_partial`
- `label_mismatch`
- `unknown`

### Comparison outputs

For each expected item, compute:

- **qty_result**: `Match | MissingQty | ExtraQty | UnknownQty`
- **qty_delta**: numeric difference when both expected and observed quantities exist
- **condition_result**: `Pass | Fail | Unknown` based on policy (below)

### Policy (default MVP behavior)

- Condition `Fail` if condition is any of:
  - `broken_damaged`, `crushed`, `wet_contaminated`, `open_partial`, `label_mismatch`
- Condition `Pass` if `as_loaded_ok`
- `Unknown` if `unknown` or low confidence

### Overall status

The report will include a top-level status:

- **Verified**: no confirmed discrepancies and no condition failures; confidence not Low
- **Mismatch**: any confirmed missing/extra quantity or any condition failure
- **NeedsReview**: ambiguity in extraction, matching, counting, or condition confidence that blocks a clear decision

### Report format (required)

Return **machine-readable JSON reports** including:

- **Checkpoint (inspection) report** for each checkpoint:
  - `status`, `confidence`, `summary`
  - Input filenames (expected list + checkpoint photos)
  - Item-by-item reconciliation (expected vs observed + condition + evidence)
  - Exception lists: missing, **extra**, condition issues, low-confidence flags
  - Recommendations for next actions (e.g., retake photo, recount, hold shipment)

- **Delta report** comparing two checkpoints (default Start ↔ End):
  - `missing_since`: items observed earlier but not later
  - `added_since`: items not observed earlier but observed later (includes new extras)
  - `condition_changes`: items whose condition classification changed

Optional (nice-to-have): generate an **HTML/PDF** printable report from the same JSON.

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
- **Human-in-the-loop review UI** beyond surfacing “NeedsReview” warnings
- **Internationalization** (languages, locales) beyond basic English text
- **Fraud detection / tamper detection** for images and documents

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

## Future scope candidates (post-MVP)

- Persistent job storage + report download links
- Human review/override workflow with annotations
- Barcode/label OCR improvements and SKU mapping
- Configurable policies per customer (allowed damage thresholds, tolerances)
- Retrieval (RAG) over manifests / historical loads for better matching
- Real-time streaming progress updates for long analyses

