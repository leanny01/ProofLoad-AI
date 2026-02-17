const { parse } = require("csv-parse/sync");
const XLSX = require("xlsx");
const pdf = require("pdf-parse");
const OpenAI = require("openai");

const TARS_BASE_URL = "https://api.router.tetrate.ai/v1";
const AI_REQUEST_TIMEOUT_MS = 60_000;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const ALLOWED_LIST_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/pdf",
  ...ALLOWED_IMAGE_TYPES,
];

let _aiClient = null;

function getAIClient() {
  if (!_aiClient) {
    const apiKey = process.env.TARS_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.TARS_BASE_URL || TARS_BASE_URL;
    if (!apiKey || apiKey === "your_api_key_here") {
      throw new Error(
        "TARS_API_KEY (or OPENAI_API_KEY) is not configured. For TARS, get a key from https://router.tetrate.ai/api-keys"
      );
    }
    _aiClient = new OpenAI({
      apiKey,
      baseURL,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }
  return _aiClient;
}

function imageToBase64DataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function normalizeQty(val) {
  if (val == null || val === "") return null;
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/[^\d.-]/g, ""));
  return isNaN(num) ? null : Math.max(0, Math.floor(num));
}

function normalizeName(val) {
  if (val == null) return "";
  return String(val).trim() || "";
}

function normalizeDescription(val) {
  if (val == null) return "";
  return String(val).trim() || "";
}

// ----- CSV -----
function extractFromCsv(buffer) {
  const text = buffer.toString("utf-8");
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const nameCols = ["name", "item", "product", "description", "item name"];
  const descCols = ["description", "desc", "details"];
  const qtyCols = ["qty", "quantity", "count", "amount", "qty."];

  const warnings = [];
  const items = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const cols = Object.keys(row);

    let name = "";
    for (const c of nameCols) {
      const key = cols.find((col) => col.toLowerCase().includes(c));
      if (key && row[key]) {
        name = normalizeName(row[key]);
        break;
      }
    }
    if (!name) {
      name = normalizeName(row[cols[0]] || "");
    }

    let description = "";
    for (const c of descCols) {
      const key = cols.find((col) => col.toLowerCase().includes(c) && !nameCols.some((n) => col.toLowerCase().includes(n)));
      if (key && row[key] && key !== Object.keys(row).find((k) => row[k] === name)) {
        description = normalizeDescription(row[key]);
        break;
      }
    }

    let qty = null;
    for (const c of qtyCols) {
      const key = cols.find((col) => col.toLowerCase().includes(c));
      if (key && row[key] != null) {
        qty = normalizeQty(row[key]);
        break;
      }
    }

    if (!name) continue;
    items.push({
      item_id: `csv:row:${i + 2}`,
      name,
      description: description || undefined,
      expected_qty: qty,
    });
    if (qty === null) warnings.push(`Row ${i + 2}: qty missing or unreadable for "${name}"`);
  }

  const confidence = items.length > 0 ? (warnings.length > items.length / 2 ? "Medium" : "High") : "Low";
  return {
    expected_items: items,
    extraction_warnings: warnings,
    extraction_confidence: confidence,
  };
}

// ----- XLSX -----
function extractFromXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!data || data.length < 2) {
    return {
      expected_items: [],
      extraction_warnings: ["Sheet is empty or has no data rows"],
      extraction_confidence: "Low",
    };
  }

  const headers = data[0].map((h) => String(h || "").trim().toLowerCase());
  const nameIdx = headers.findIndex((h) => /name|item|product/.test(h));
  const descIdx = headers.findIndex((h) => /^desc|details/.test(h) && !/name|item|product/.test(h));
  const qtyIdx = headers.findIndex((h) => /qty|quantity|count|amount/.test(h));

  const warnings = [];
  const items = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = normalizeName(
      nameIdx >= 0 ? row[nameIdx] : row[0]
    );
    const description = descIdx >= 0 ? normalizeDescription(row[descIdx]) : "";
    const qty = qtyIdx >= 0 ? normalizeQty(row[qtyIdx]) : null;

    if (!name) continue;
    items.push({
      item_id: `xlsx:row:${i + 1}`,
      name,
      description: description || undefined,
      expected_qty: qty,
    });
    if (qty === null) warnings.push(`Row ${i + 1}: qty missing or unreadable for "${name}"`);
  }

  const confidence = items.length > 0 ? (warnings.length > items.length / 2 ? "Medium" : "High") : "Low";
  return {
    expected_items: items,
    extraction_warnings: warnings,
    extraction_confidence: confidence,
  };
}

// ----- PDF (text) -----
async function extractFromPdf(buffer) {
  const data = await pdf(buffer);
  const text = (data.text || "").trim();
  if (!text || text.length < 10) {
    return {
      expected_items: [],
      extraction_warnings: ["PDF appears empty or scanned (no extractable text). Try uploading as image."],
      extraction_confidence: "Low",
    };
  }
  return extractFromTextWithAI(text, "PDF");
}

// ----- AI extraction for text or image -----
const EXTRACT_SYSTEM = `You are a logistics list extraction agent. Extract line items from the provided content.
Each item MUST have: name (required), description (optional), qty (number or null if unreadable).

Output ONLY valid JSON in this exact format, no markdown:
{
  "expected_items": [
    {
      "item_id": "source:row:N",
      "name": "string",
      "description": "string or omit",
      "expected_qty": number or null
    }
  ],
  "extraction_warnings": ["warning1"],
  "extraction_confidence": "Low" or "Medium" or "High"
}

Rules:
- Extract every line item you can identify.
- If qty is missing or unclear, use null and add a warning.
- Use item_id like "extract:row:1", "extract:row:2" etc.
- Do NOT invent items. Only extract what is clearly present.`;

async function extractFromTextWithAI(text, sourceLabel) {
  const client = getAIClient();
  const model = process.env.AI_MODEL || "gpt-4o";

  const response = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      {
        role: "user",
        content: `Extract line items from this ${sourceLabel} content:\n\n${text.slice(0, 12000)}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");

  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const parsed = JSON.parse(cleaned);

  const items = (parsed.expected_items || []).map((it, i) => ({
    item_id: it.item_id || `extract:row:${i + 1}`,
    name: normalizeName(it.name),
    description: normalizeDescription(it.description) || undefined,
    expected_qty: normalizeQty(it.expected_qty ?? it.qty),
  })).filter((it) => it.name);

  return {
    expected_items: items,
    extraction_warnings: Array.isArray(parsed.extraction_warnings) ? parsed.extraction_warnings : [],
    extraction_confidence: ["Low", "Medium", "High"].includes(parsed.extraction_confidence)
      ? parsed.extraction_confidence
      : "Medium",
  };
}

async function extractFromImageWithAI(buffer, mimeType) {
  const client = getAIClient();
  const model = process.env.AI_MODEL || "gpt-4o";
  const dataUrl = imageToBase64DataUrl(buffer, mimeType);

  const response = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract line items from this list/manifest image. Each item has name, optional description, and qty.",
          },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from AI");

  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const parsed = JSON.parse(cleaned);

  const items = (parsed.expected_items || []).map((it, i) => ({
    item_id: it.item_id || `image:row:${i + 1}`,
    name: normalizeName(it.name),
    description: normalizeDescription(it.description) || undefined,
    expected_qty: normalizeQty(it.expected_qty ?? it.qty),
  })).filter((it) => it.name);

  return {
    expected_items: items,
    extraction_warnings: Array.isArray(parsed.extraction_warnings) ? parsed.extraction_warnings : [],
    extraction_confidence: ["Low", "Medium", "High"].includes(parsed.extraction_confidence)
      ? parsed.extraction_confidence
      : "Medium",
  };
}

/**
 * Extract expected items from a list file.
 * @param {Object} file - Multer file: { buffer, mimetype, originalname }
 * @returns {Promise<{expected_items, extraction_warnings, extraction_confidence}>}
 */
async function extractList(file) {
  if (!file?.buffer) throw new Error("No file buffer");
  const mime = file.mimetype || "";
  const name = (file.originalname || "").toLowerCase();

  if (mime === "text/csv" || name.endsWith(".csv")) {
    return extractFromCsv(file.buffer);
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls")
  ) {
    return extractFromXlsx(file.buffer);
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return extractFromPdf(file.buffer);
  }
  if (ALLOWED_IMAGE_TYPES.includes(mime) || /\.(png|jpe?g|webp)$/i.test(name)) {
    return extractFromImageWithAI(file.buffer, mime);
  }

  throw new Error(`Unsupported list format: ${mime || "unknown"}. Use CSV, XLSX, PDF, or image.`);
}

function isListTypeSupported(mimetype, filename = "") {
  const n = (filename || "").toLowerCase();
  if (mimetype === "text/csv" || n.endsWith(".csv")) return true;
  if (
    mimetype?.includes("spreadsheet") ||
    mimetype?.includes("excel") ||
    n.endsWith(".xlsx") ||
    n.endsWith(".xls")
  )
    return true;
  if (mimetype === "application/pdf" || n.endsWith(".pdf")) return true;
  if (ALLOWED_IMAGE_TYPES.includes(mimetype) || /\.(png|jpe?g|webp)$/i.test(n)) return true;
  return false;
}

module.exports = {
  extractList,
  isListTypeSupported,
  ALLOWED_LIST_TYPES,
  ALLOWED_IMAGE_TYPES,
};
