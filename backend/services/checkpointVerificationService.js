const OpenAI = require("openai");

const TARS_BASE_URL = "https://api.router.tetrate.ai/v1";
const AI_REQUEST_TIMEOUT_MS = 90_000;

const CONDITION_TAXONOMY = [
  "as_loaded_ok",
  "broken_damaged",
  "crushed",
  "wet_contaminated",
  "open_partial",
  "label_mismatch",
  "unknown",
];

let _client = null;

function getAIClient() {
  if (!_client) {
    const apiKey = process.env.TARS_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.TARS_BASE_URL || TARS_BASE_URL;
    if (!apiKey || apiKey === "your_api_key_here") {
      throw new Error(
        "TARS_API_KEY (or OPENAI_API_KEY) is not configured. For TARS, get a key from https://router.tetrate.ai/api-keys"
      );
    }
    _client = new OpenAI({
      apiKey,
      baseURL,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }
  return _client;
}

function imageToBase64DataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

const CHECKPOINT_SYSTEM_BASE = `You are a logistics load verification agent. You receive an EXPECTED ITEM LIST (manifest) and PHOTOS of the actual load.

Your tasks:
1. Identify which expected items are visible in the photos. For each, estimate observed_qty (or null if not countable) and classify condition.
2. Identify EXTRA items: anything visible in photos that does NOT match any expected list item. Categorize these as "extra".
3. Note MISSING items: expected items not observed in the photos.

Condition taxonomy (use exactly one per item):
- as_loaded_ok: in good condition, no visible damage, scratches, dents, or issues
- broken_damaged: visibly broken or damaged (cracks, holes, torn packaging)
- crushed: crushed or severely deformed
- wet_contaminated: wet, stained, or contaminated
- open_partial: open package or partially empty
- label_mismatch: wrong label or doesn't match expected
- unknown: cannot determine

CRITICAL — condition_notes:
For EVERY item you observe, you MUST provide detailed "condition_notes" describing the physical state:
- Specific damage: "dent on top-left corner", "torn packaging along right edge", "scratch across label"
- Wear signs: "scuff marks on base", "faded label", "minor surface wear"
- If in good condition: "no visible damage, packaging intact, labels clear"
- If unknown: explain why — "partially occluded by other items", "photo too dark to assess"

RULES:
- ALWAYS use the same item_id from the expected list when reporting on an expected item.
- Only report clearly visible items. Do NOT hallucinate.
- If unclear, use "unknown" condition and lower confidence.
- For extra items, provide name (as best you can identify), estimated qty, condition, and condition_notes.
- Evidence: reference which photo supports each finding (by filename when provided).
- Summary: concise operational summary (1-2 sentences).
- Status: "Verified" only if no discrepancies and no condition failures. Otherwise "Mismatch". Use "NeedsReview" if evidence is ambiguous.
- Confidence: Low/Medium/High based on photo clarity and matching certainty.

You MUST respond with ONLY valid JSON in this exact format (no markdown):
{
  "status": "Verified" | "Mismatch" | "NeedsReview",
  "confidence": "Low" | "Medium" | "High",
  "summary": "string",
  "line_items": [
    {
      "item_id": "string (MUST match the item_id from expected list)",
      "name": "string",
      "description": "string or null",
      "expected_qty": number or null,
      "observed_qty": number or null,
      "qty_result": "Match" | "MissingQty" | "ExtraQty" | "UnknownQty",
      "qty_delta": number or null,
      "condition": "one of taxonomy",
      "condition_notes": "detailed description of physical state",
      "condition_result": "Pass" | "Fail" | "Unknown",
      "evidence": [{"photo": "filename", "note": "string"}],
      "notes": "string or null"
    }
  ],
  "missing": [{"item_id": "string", "name": "string", "expected_qty": number}],
  "extra": [{"name": "string", "observed_qty": number or null, "condition": "taxonomy", "condition_notes": "string", "evidence": [{"photo": "string", "note": "string"}]}],
  "condition_issues": [{"item_id": "string", "name": "string", "condition": "string", "condition_notes": "string", "severity": "High"|"Medium"|"Low"}],
  "recommendations": ["string"]
}`;

const FOLLOWUP_ADDENDUM = `

IMPORTANT — PREVIOUS CHECKPOINT DATA:
You are given the results from a PREVIOUS checkpoint inspection below. This is what was observed earlier for the same shipment.
Your job is now to inspect the NEW photos and compare the current state of items to the previous state.

Pay special attention to CONDITION CHANGES:
- If an item was "as_loaded_ok" before but now shows damage, you MUST flag it and describe what changed in condition_notes.
- If an item had damage before and now looks worse, note the progression.
- If condition is the same, confirm it explicitly in condition_notes (e.g., "condition unchanged from previous checkpoint: still intact").
- For each item, include a "condition_changed" field: true if condition differs from previous, false otherwise.

Updated line_items format (adds condition_changed and previous_condition):
{
  "item_id": "string",
  "name": "string",
  "description": "string or null",
  "expected_qty": number or null,
  "observed_qty": number or null,
  "qty_result": "Match" | "MissingQty" | "ExtraQty" | "UnknownQty",
  "qty_delta": number or null,
  "condition": "one of taxonomy",
  "condition_notes": "detailed description — explicitly compare to previous state",
  "condition_changed": true | false,
  "previous_condition": "what it was at previous checkpoint",
  "condition_result": "Pass" | "Fail" | "Unknown",
  "evidence": [{"photo": "filename", "note": "string"}],
  "notes": "string or null"
}`;

/**
 * Verify a checkpoint: compare expected items to photos, return inspection report.
 * @param {Array} expectedItems - [{item_id, name, description, expected_qty}]
 * @param {Array} photos - Multer files [{buffer, mimetype, originalname}]
 * @param {string} manifestFilename - optional, for evidence
 * @param {Object|null} previousReport - previous checkpoint report for condition comparison
 * @returns {Promise<Object>} Checkpoint inspection report
 */
async function verifyCheckpoint(expectedItems, photos, manifestFilename = "manifest", previousReport = null) {
  if (!expectedItems?.length) {
    throw new Error("Expected items list is empty");
  }
  if (!photos?.length) {
    throw new Error("At least one photo is required");
  }

  const client = getAIClient();
  const model = process.env.AI_MODEL || "gpt-4o";

  const itemsJson = JSON.stringify(
    expectedItems.map(({ item_id, name, description, expected_qty }) => ({
      item_id,
      name,
      description: description || null,
      expected_qty,
    })),
    null,
    2
  );

  // Build system prompt — add follow-up addendum if previous report exists
  let systemPrompt = CHECKPOINT_SYSTEM_BASE;
  if (previousReport) {
    systemPrompt += FOLLOWUP_ADDENDUM;
  }

  // Build user message
  let userText = `EXPECTED ITEM LIST (manifest: ${manifestFilename}):\n${itemsJson}\n\nPHOTOS: ${photos.map((p) => p.originalname || "photo").join(", ")}`;

  if (previousReport) {
    const prevSummary = buildPreviousReportSummary(previousReport);
    userText += `\n\nPREVIOUS CHECKPOINT FINDINGS:\n${prevSummary}`;
    userText += `\n\nAnalyze the NEW photos. For each item, compare its current condition to the previous checkpoint findings. Flag any condition changes explicitly. Also identify matched, missing, and extra items.`;
  } else {
    userText += `\n\nAnalyze the photos and compare to the expected list. Identify matched, missing, and extra items. Classify condition for each observed item with detailed condition_notes.`;
  }

  const contentParts = [{ type: "text", text: userText }];
  for (const photo of photos) {
    const dataUrl = imageToBase64DataUrl(photo.buffer, photo.mimetype);
    contentParts.push({
      type: "image_url",
      image_url: { url: dataUrl, detail: "high" },
    });
  }

  const startTime = Date.now();
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: contentParts },
    ],
  });

  const latencyMs = Date.now() - startTime;
  if (response.usage) {
    console.log(
      JSON.stringify({
        service: "checkpoint_verification",
        model,
        latency_ms: latencyMs,
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
      })
    );
  }

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No response from AI");

  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  // Validate and normalize
  const validStatuses = ["Verified", "Mismatch", "NeedsReview"];
  const validConfidences = ["Low", "Medium", "High"];
  result.status = validStatuses.includes(result.status) ? result.status : "NeedsReview";
  result.confidence = validConfidences.includes(result.confidence) ? result.confidence : "Medium";
  result.line_items = Array.isArray(result.line_items) ? result.line_items : [];
  result.missing = Array.isArray(result.missing) ? result.missing : [];
  result.extra = Array.isArray(result.extra) ? result.extra : [];
  result.recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
  result.summary = typeof result.summary === "string" ? result.summary : "Verification completed.";
  result.inputs = {
    manifest: manifestFilename,
    photos: photos.map((p) => p.originalname || "photo"),
  };
  result.has_previous_checkpoint = !!previousReport;

  // Derive condition_issues from line_items + extras (don't rely on AI populating it)
  result.condition_issues = deriveConditionIssues(result);

  return result;
}

const FAIL_CONDITIONS = ["broken_damaged", "crushed", "wet_contaminated", "open_partial", "label_mismatch"];

/**
 * Derive condition_issues from line_items and extras.
 * This ensures condition_issues is always populated when items have failing conditions,
 * regardless of whether the AI returned them in the condition_issues array.
 */
function deriveConditionIssues(result) {
  const issues = [];
  const seen = new Set();

  // From line_items: any item with a failing condition
  for (const item of result.line_items || []) {
    const cond = item.condition || "unknown";
    if (FAIL_CONDITIONS.includes(cond)) {
      const key = `${item.item_id || item.name}::${cond}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          item_id: item.item_id || null,
          name: item.name,
          condition: cond,
          condition_notes: item.condition_notes || null,
          severity: cond === "broken_damaged" || cond === "crushed" ? "High" : "Medium",
          condition_changed: item.condition_changed ?? false,
          previous_condition: item.previous_condition || null,
        });
      }
    }
  }

  // From extras: any extra item with a failing condition
  for (const extra of result.extra || []) {
    const cond = extra.condition || "unknown";
    if (FAIL_CONDITIONS.includes(cond)) {
      const key = `extra::${extra.name}::${cond}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push({
          item_id: null,
          name: extra.name + " (extra)",
          condition: cond,
          condition_notes: extra.condition_notes || null,
          severity: cond === "broken_damaged" || cond === "crushed" ? "High" : "Medium",
          condition_changed: false,
          previous_condition: null,
        });
      }
    }
  }

  // Merge any AI-provided issues that we didn't already capture
  for (const aiIssue of result.condition_issues || []) {
    const key = `${aiIssue.item_id || aiIssue.name}::${aiIssue.condition}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push({
        item_id: aiIssue.item_id || null,
        name: aiIssue.name,
        condition: aiIssue.condition,
        condition_notes: aiIssue.condition_notes || null,
        severity: aiIssue.severity || "Medium",
        condition_changed: aiIssue.condition_changed ?? false,
        previous_condition: aiIssue.previous_condition || null,
      });
    }
  }

  return issues;
}

/**
 * Build a concise text summary of a previous checkpoint report
 * so the AI can compare conditions.
 */
function buildPreviousReportSummary(report) {
  const lines = [];
  lines.push(`Previous status: ${report.status} (confidence: ${report.confidence})`);
  lines.push(`Previous summary: ${report.summary}`);
  lines.push("");
  lines.push("Previous item observations:");
  for (const item of report.line_items || []) {
    const parts = [
      `  - item_id: ${item.item_id}`,
      `name: "${item.name}"`,
      `qty: ${item.observed_qty ?? "unknown"}`,
      `condition: ${item.condition || "unknown"}`,
    ];
    if (item.condition_notes) {
      parts.push(`notes: "${item.condition_notes}"`);
    }
    lines.push(parts.join(", "));
  }
  if (report.extra?.length) {
    lines.push("");
    lines.push("Previous extra items (not on list):");
    for (const e of report.extra) {
      lines.push(`  - "${e.name}", condition: ${e.condition || "unknown"}, notes: "${e.condition_notes || "none"}"`);
    }
  }
  if (report.missing?.length) {
    lines.push("");
    lines.push("Previously missing items:");
    for (const m of report.missing) {
      lines.push(`  - item_id: ${m.item_id || "?"}, "${m.name}", expected_qty: ${m.expected_qty}`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  verifyCheckpoint,
  CONDITION_TAXONOMY,
};
