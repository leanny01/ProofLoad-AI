const OpenAI = require("openai");

const TARS_BASE_URL = "https://api.router.tetrate.ai/v1";
const AI_REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

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

const SYSTEM_PROMPT = `You are a logistics load verification agent. Your job is to compare two images:
1. The EXPECTED load (what should be loaded)
2. The ACTUAL load (what was actually loaded)

You must identify:
- Items present in the expected image but MISSING from the actual image
- Items present in the actual image that are EXTRA (not in the expected image)

RULES:
- Only compare clearly visible items.
- Do NOT hallucinate or guess objects that are not clearly visible.
- If the image is unclear, lower your confidence level.
- If no discrepancies exist, status must be "Verified".
- If any discrepancies exist, status must be "Mismatch".
- Summary must be concise and operational (1-2 sentences).

You MUST respond with ONLY valid JSON in this exact format, no markdown, no explanation:
{
  "status": "Verified" or "Mismatch",
  "missing_items": ["item1", "item2"],
  "extra_items": ["item1"],
  "summary": "Brief operational summary",
  "confidence": "Low" or "Medium" or "High"
}`;

/**
 * Converts an image buffer to a base64 data URL for the OpenAI API.
 */
function imageToBase64DataUrl(imageBuffer, mimeType) {
  const base64 = imageBuffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * AIComparisonService – Domain Service
 * Sends both images to OpenAI Vision and returns a structured VerificationResult.
 */
async function compareLoadImages(expectedImage, actualImage) {
  const expectedDataUrl = imageToBase64DataUrl(
    expectedImage.buffer,
    expectedImage.mimetype
  );
  const actualDataUrl = imageToBase64DataUrl(
    actualImage.buffer,
    actualImage.mimetype
  );

  const client = getAIClient();
  const model = process.env.AI_MODEL || "gpt-4o";

  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Compare these two load images. The first image is the EXPECTED load. The second image is the ACTUAL load. Identify any missing or extra items.",
          },
          {
            type: "image_url",
            image_url: { url: expectedDataUrl, detail: "high" },
          },
          {
            type: "image_url",
            image_url: { url: actualDataUrl, detail: "high" },
          },
        ],
      },
    ],
  });

  const latencyMs = Date.now() - startTime;
  const usage = response.usage;

  if (usage) {
    console.log(
      JSON.stringify({
        model,
        latency_ms: latencyMs,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      })
    );
  } else {
    console.log(JSON.stringify({ model, latency_ms: latencyMs }));
  }

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No response from AI model");
  }

  // Parse the JSON response, stripping any markdown fences if present
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI returned invalid JSON: ${content}`);
  }

  // Validate structure
  const validStatuses = ["Verified", "Mismatch"];
  const validConfidences = ["Low", "Medium", "High"];

  if (!validStatuses.includes(result.status)) {
    result.status = "Mismatch";
  }
  if (!validConfidences.includes(result.confidence)) {
    result.confidence = "Medium";
  }
  if (!Array.isArray(result.missing_items)) {
    result.missing_items = [];
  }
  if (!Array.isArray(result.extra_items)) {
    result.extra_items = [];
  }
  if (typeof result.summary !== "string") {
    result.summary = "Verification completed.";
  }

  return result;
}

module.exports = { compareLoadImages };
