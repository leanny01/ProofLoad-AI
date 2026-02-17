/**
 * Compute delta between two checkpoint reports.
 * Compares "from" (earlier) checkpoint to "to" (later) checkpoint.
 *
 * Matching strategy:
 * 1. Primary key: item_id (stable, comes from manifest)
 * 2. Fallback: normalized name (for extras or if item_id missing)
 *
 * Semantic states:
 * - NoRisk: no missing, no damage, no critical changes
 * - MinorUpdates: minor condition notes or non-critical changes
 * - Discrepancies: missing items, added items, damage, or new extras
 *
 * @param {Object} fromReport - Inspection report from earlier checkpoint
 * @param {Object} toReport - Inspection report from later checkpoint
 * @returns {Object} Delta report
 */
const FAIL_CONDITIONS = ["broken_damaged", "crushed", "wet_contaminated", "open_partial", "label_mismatch"];

function computeDelta(fromReport, toReport) {
  const fromItems = indexLineItems(fromReport);
  const toItems = indexLineItems(toReport);
  const fromExtras = indexExtras(fromReport);
  const toExtras = indexExtras(toReport);

  const missingSince = [];
  const addedSince = [];
  const anomalyConditionChanges = []; // Real issues: condition worsened to fail
  const informationalConditionChanges = []; // Note-only or as_loaded_ok → as_loaded_ok
  const unchangedItems = [];

  // Walk all "from" items and find them in "to"
  for (const [key, fromItem] of Object.entries(fromItems)) {
    const toItem = toItems[key];
    if (!toItem) {
      missingSince.push({
        item_id: fromItem.item_id,
        name: fromItem.name,
        expected_qty: fromItem.expected_qty,
        observed_at_from: fromItem.observed_qty ?? "present",
        from_condition: fromItem.condition || "unknown",
        from_condition_notes: fromItem.condition_notes || null,
        observed_at_to: null,
        evidence_from: fromItem.evidence,
      });
    } else {
      const fromCond = fromItem.condition || "unknown";
      const toCond = toItem.condition || "unknown";
      const fromNotes = fromItem.condition_notes || "";
      const toNotes = toItem.condition_notes || "";
      const condWorsened = isConditionWorsened(fromCond, toCond);
      const noteOnlyChange = fromCond === toCond && hasNoteOnlyChange(fromNotes, toNotes);

      const entry = {
        item_id: fromItem.item_id,
        name: fromItem.name,
        from_condition: fromCond,
        to_condition: toCond,
        from_condition_notes: fromNotes || null,
        to_condition_notes: toNotes || null,
        from_condition_result: fromItem.condition_result,
        to_condition_result: toItem.condition_result,
        condition_changed: toItem.condition_changed ?? (fromCond !== toCond),
        severity: deriveSeverity(fromCond, toCond),
        evidence_from: fromItem.evidence,
        evidence_to: toItem.evidence,
      };

      if (condWorsened) {
        anomalyConditionChanges.push(entry);
      } else if (fromCond !== toCond || noteOnlyChange) {
        // Informational: same condition, or note-only diff (e.g. "unchanged" phrasing)
        informationalConditionChanges.push(entry);
      } else {
        unchangedItems.push({
          item_id: fromItem.item_id,
          name: fromItem.name,
          condition: toCond,
          condition_notes: toNotes || null,
        });
      }
    }
  }

  // Items in "to" but not in "from"
  for (const [key, toItem] of Object.entries(toItems)) {
    if (!fromItems[key]) {
      addedSince.push({
        item_id: toItem.item_id,
        name: toItem.name,
        expected_qty: toItem.expected_qty,
        observed_at_from: null,
        observed_at_to: toItem.observed_qty ?? "present",
        condition: toItem.condition || "unknown",
        condition_notes: toItem.condition_notes || null,
        evidence_to: toItem.evidence,
        is_extra: !!toReport.extra?.find((e) => matchKey(e) === key),
      });
    }
  }

  // Extra items comparison
  const resolvedExtras = [];
  const newExtras = [];
  const extraAnomalyChanges = [];
  const extraInformationalChanges = [];

  for (const [key, fromExtra] of Object.entries(fromExtras)) {
    const toExtra = toExtras[key];
    if (!toExtra) {
      resolvedExtras.push({
        name: fromExtra.name,
        observed_qty: fromExtra.observed_qty,
        condition: fromExtra.condition,
        condition_notes: fromExtra.condition_notes || null,
      });
    } else {
      const fc = fromExtra.condition || "unknown";
      const tc = toExtra.condition || "unknown";
      const worsened = isConditionWorsened(fc, tc);
      const entry = {
        name: fromExtra.name,
        from_condition: fc,
        to_condition: tc,
        from_condition_notes: fromExtra.condition_notes || null,
        to_condition_notes: toExtra.condition_notes || null,
        severity: deriveSeverity(fc, tc),
      };
      if (worsened) extraAnomalyChanges.push(entry);
      else if (fc !== tc) extraInformationalChanges.push(entry);
    }
  }

  for (const [key, toExtra] of Object.entries(toExtras)) {
    if (!fromExtras[key]) {
      newExtras.push({
        name: toExtra.name,
        observed_qty: toExtra.observed_qty,
        condition: toExtra.condition,
        condition_notes: toExtra.condition_notes || null,
        evidence: toExtra.evidence,
      });
    }
  }

  // Semantic status: only real anomalies drive "Discrepancies"
  const hasDiscrepancies =
    missingSince.length > 0 ||
    addedSince.length > 0 ||
    anomalyConditionChanges.length > 0 ||
    extraAnomalyChanges.length > 0 ||
    newExtras.length > 0;

  const hasMinorUpdates =
    !hasDiscrepancies &&
    (informationalConditionChanges.length > 0 || extraInformationalChanges.length > 0);

  let semanticStatus = "NoRisk";
  if (hasDiscrepancies) semanticStatus = "Discrepancies";
  else if (hasMinorUpdates) semanticStatus = "MinorUpdates";

  const totalReviewed =
    unchangedItems.length +
    anomalyConditionChanges.length +
    informationalConditionChanges.length;
  const damagedCount = anomalyConditionChanges.filter((c) =>
    FAIL_CONDITIONS.includes(c.to_condition)
  ).length;

  const aiSummary = buildAISummary(
    totalReviewed,
    missingSince.length,
    addedSince.length,
    damagedCount,
    newExtras.length,
    semanticStatus,
    toReport.confidence || "Medium"
  );

  return {
    from_checkpoint: fromReport.checkpoint_id ?? "from",
    to_checkpoint: toReport.checkpoint_id ?? "to",
    from_checkpoint_type: fromReport.inputs?.photos ? "checkpoint" : "from",
    to_checkpoint_type: toReport.inputs?.photos ? "checkpoint" : "to",
    semantic_status: semanticStatus,
    status: hasDiscrepancies ? "Mismatch" : "NoChange", // keep for backward compat
    summary: buildDeltaSummary(
      missingSince,
      addedSince,
      resolvedExtras,
      newExtras,
      anomalyConditionChanges,
      extraAnomalyChanges,
      informationalConditionChanges,
      extraInformationalChanges
    ),
    totals: {
      items_reviewed: totalReviewed,
      missing: missingSince.length,
      added: addedSince.length,
      damaged: damagedCount,
      new_extras: newExtras.length,
      unchanged: unchangedItems.length,
    },
    ai_summary: aiSummary,
    missing_since: missingSince,
    added_since: addedSince,
    condition_changes: anomalyConditionChanges,
    extra_condition_changes: extraAnomalyChanges,
    informational_condition_changes: informationalConditionChanges,
    extra_informational_changes: extraInformationalChanges,
    unchanged_items: unchangedItems,
    resolved_extras: resolvedExtras,
    new_extras: newExtras,
    to_report_confidence: toReport.confidence,
  };
}

/**
 * Only treat as worsened when condition moves to a FAIL state.
 * as_loaded_ok → as_loaded_ok (even with note diff) = NOT worsened.
 */
function isConditionWorsened(fromCond, toCond) {
  if (fromCond === toCond) return false;
  if (FAIL_CONDITIONS.includes(toCond) && fromCond === "as_loaded_ok") return true;
  if (FAIL_CONDITIONS.includes(toCond) && !FAIL_CONDITIONS.includes(fromCond)) return true;
  if (FAIL_CONDITIONS.includes(fromCond) && FAIL_CONDITIONS.includes(toCond)) {
    // Both fail; consider different fail types as potential worsening
    return fromCond !== toCond;
  }
  return false;
}

/**
 * Note-only change: condition taxonomy same, but note text differs.
 * Exception: if toNotes explicitly says "unchanged" or "condition unchanged",
 * treat as unchanged (not even informational).
 */
function hasNoteOnlyChange(fromNotes, toNotes) {
  if (!fromNotes && !toNotes) return false;
  const b = normalizeForCompare(toNotes);
  if (b.includes("unchanged") || b.includes("no change")) return false;
  const a = normalizeForCompare(fromNotes);
  if (a === b) return false;
  return !!(a && b && a !== b);
}

function matchKey(item) {
  if (item.item_id) return String(item.item_id).trim().toLowerCase();
  return normalizeForCompare(item.name);
}

function normalizeForCompare(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function indexLineItems(report) {
  const idx = {};
  for (const item of report.line_items || []) {
    const key = matchKey(item);
    if (key) idx[key] = item;
  }
  return idx;
}

function indexExtras(report) {
  const idx = {};
  for (const e of report.extra || []) {
    const key = normalizeForCompare(e.name);
    if (key) idx[key] = e;
  }
  return idx;
}

function deriveSeverity(fromCond, toCond) {
  if (fromCond === "as_loaded_ok" && FAIL_CONDITIONS.includes(toCond)) return "High";
  if (FAIL_CONDITIONS.includes(fromCond) && FAIL_CONDITIONS.includes(toCond) && fromCond !== toCond) return "Medium";
  if (toCond === "unknown") return "Low";
  if (FAIL_CONDITIONS.includes(toCond)) return "Medium";
  return "Low";
}

function buildDeltaSummary(
  missing,
  added,
  resolved,
  newExtras,
  anomalyCond,
  extraAnomaly,
  informationalCond,
  extraInformational
) {
  const parts = [];
  if (missing.length) parts.push(`${missing.length} item(s) missing since earlier checkpoint`);
  if (added.length) parts.push(`${added.length} item(s) added since earlier checkpoint`);
  if (anomalyCond.length) parts.push(`${anomalyCond.length} item(s) with condition damage`);
  if (extraAnomaly.length) parts.push(`${extraAnomaly.length} extra item(s) with condition damage`);
  if (newExtras.length) parts.push(`${newExtras.length} new extra item(s) not on list`);
  if (resolved.length) parts.push(`${resolved.length} extra item(s) resolved (no longer present)`);
  if (informationalCond.length || extraInformational.length) {
    const n = informationalCond.length + extraInformational.length;
    parts.push(`${n} item(s) with minor/no-op condition note updates`);
  }
  if (parts.length === 0) return "No changes between checkpoints.";
  return parts.join(". ") + ".";
}

function buildAISummary(
  itemsReviewed,
  missing,
  added,
  damaged,
  newExtras,
  semanticStatus,
  confidence
) {
  const lines = [];
  if (itemsReviewed > 0) {
    lines.push(`${itemsReviewed} expected item(s) accounted for.`);
  }
  if (semanticStatus === "NoRisk" && missing === 0 && added === 0 && damaged === 0 && newExtras === 0) {
    lines.push("No condition changes detected.");
    lines.push("No discrepancies found.");
  } else if (semanticStatus === "MinorUpdates") {
    lines.push("Minor condition note updates only. No damage or discrepancies.");
  } else {
    if (missing > 0) lines.push(`${missing} item(s) missing.`);
    if (added > 0) lines.push(`${added} item(s) added.`);
    if (damaged > 0) lines.push(`${damaged} item(s) with condition damage.`);
    if (newExtras > 0) lines.push(`${newExtras} new extra item(s) not on list.`);
  }
  lines.push(`Confidence: ${confidence}`);
  return {
    text: lines.join(" "),
    confidence,
    semantic_status: semanticStatus,
  };
}

module.exports = { computeDelta };
