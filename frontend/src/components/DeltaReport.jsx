import { useState } from "react";
import axios from "axios";

function DeltaReport({ delta, projectId, toCheckpointId, onAction }) {
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  if (!delta) return null;

  const fromLabel = delta.from_label || delta.from_checkpoint;
  const toLabel = delta.to_label || delta.to_checkpoint;
  const totals = delta.totals || {};
  const semanticStatus = delta.semantic_status || (delta.status === "NoChange" ? "NoRisk" : "Discrepancies");
  const aiSummary = delta.ai_summary || {};

  const hasDiscrepancies =
    (delta.missing_since?.length || 0) > 0 ||
    (delta.added_since?.length || 0) > 0 ||
    (delta.condition_changes?.length || 0) > 0 ||
    (delta.new_extras?.length || 0) > 0;

  const allConditionItems = [
    ...(delta.condition_changes || []).map((c) => ({ ...c, isExtra: false })),
    ...(delta.extra_condition_changes || []).map((c) => ({ ...c, isExtra: true })),
    ...(delta.informational_condition_changes || []).map((c) => ({ ...c, isExtra: false, informational: true })),
    ...(delta.extra_informational_changes || []).map((c) => ({ ...c, isExtra: true, informational: true })),
  ];

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleExport = () => {
    try {
      const blob = new Blob([JSON.stringify(delta, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `delta-report-${delta.from_checkpoint}-to-${delta.to_checkpoint}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Report exported", "success");
    } catch (e) {
      showToast("Export failed", "error");
    }
  };

  const handleFlag = async () => {
    if (!projectId || !toCheckpointId) {
      showToast("Cannot flag: missing context", "error");
      return;
    }
    setActionLoading("flag");
    try {
      await axios.patch(`/api/projects/${projectId}/checkpoints/${toCheckpointId}`, { flagged: true });
      showToast("Checkpoint flagged for manual review", "success");
      onAction?.();
    } catch (e) {
      showToast(e.response?.data?.error || "Failed to flag", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async () => {
    if (!projectId || !toCheckpointId) {
      showToast("Cannot approve: missing context", "error");
      return;
    }
    setActionLoading("approve");
    try {
      await axios.patch(`/api/projects/${projectId}/checkpoints/${toCheckpointId}`, { approved: true });
      showToast("Checkpoint approved", "success");
      onAction?.();
    } catch (e) {
      showToast(e.response?.data?.error || "Failed to approve", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleExpand = (key) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const parseNotesToBullets = (notes) => {
    if (!notes || !notes.trim()) return [];
    const text = notes.trim();
    if (text.toLowerCase().includes("unchanged") || text.toLowerCase().includes("no visible damage")) {
      return [text];
    }
    return text.split(/[.;]\s*/).filter(Boolean).map((s) => s.trim());
  };

  return (
    <section className="delta-report-v2">
      {/* Top Summary Bar */}
      <div className="delta-summary-bar">
        <div className="delta-summary-header">
          <span className="delta-compare-label">
            Checkpoint Comparison: {fromLabel} → {toLabel}
          </span>
        </div>
        <div className="delta-summary-totals">
          <span>{totals.items_reviewed ?? 0} items reviewed</span>
          <span className="divider">|</span>
          <span>{totals.missing ?? 0} missing</span>
          <span className="divider">|</span>
          <span>{totals.added ?? 0} added</span>
          <span className="divider">|</span>
          <span>{totals.damaged ?? 0} damaged</span>
        </div>
      </div>

      {/* Semantic Status Banner */}
      <div className={`semantic-banner semantic-${semanticStatus}`}>
        {semanticStatus === "NoRisk" && (
          <>
            <span className="semantic-icon">✓</span>
            <span className="semantic-text">No Risk Changes</span>
          </>
        )}
        {semanticStatus === "MinorUpdates" && (
          <>
            <span className="semantic-icon">⚠</span>
            <span className="semantic-text">Minor Condition Updates</span>
          </>
        )}
        {semanticStatus === "Discrepancies" && (
          <>
            <span className="semantic-icon">!</span>
            <span className="semantic-text">Discrepancies Found</span>
          </>
        )}
      </div>

      {/* AI Summary Card */}
      <div className="ai-summary-card">
        <h4>AI Summary</h4>
        <p className="ai-summary-text">{aiSummary.text || delta.summary}</p>
        <span className={`ai-confidence confidence-${(aiSummary.confidence || "").toLowerCase()}`}>
          {aiSummary.confidence || "Medium"}
        </span>
      </div>

      {/* Accordion: Discrepancies */}
      <details className="accordion-section discrepancies" open={hasDiscrepancies}>
        <summary>
          Discrepancies
          <span className="accordion-count">
            {(delta.missing_since?.length || 0) +
              (delta.added_since?.length || 0) +
              (delta.new_extras?.length || 0)}
          </span>
        </summary>
        <div className="accordion-content">
          {(delta.missing_since?.length || 0) > 0 && (
            <div className="discrepancy-group">
              <h5>Missing Items</h5>
              <ul>
                {delta.missing_since.map((it, i) => (
                  <li key={i}>
                    <strong>{it.name}</strong> — was present at {fromLabel}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(delta.added_since?.length || 0) > 0 && (
            <div className="discrepancy-group">
              <h5>Added Items</h5>
              <ul>
                {delta.added_since.map((it, i) => (
                  <li key={i}>
                    <strong>{it.name}</strong>
                    {it.is_extra && <span className="extra-chip">extra</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(delta.new_extras?.length || 0) > 0 && (
            <div className="discrepancy-group">
              <h5>New Extras</h5>
              <ul>
                {delta.new_extras.map((it, i) => (
                  <li key={i}>
                    <strong>{it.name}</strong> — {it.condition || "unknown"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasDiscrepancies && <p className="no-items">None</p>}
        </div>
      </details>

      {/* Accordion: Condition Review — compact cards */}
      <details className="accordion-section condition-review" open={allConditionItems.length > 0}>
        <summary>
          Condition Review
          <span className="accordion-count">{allConditionItems.length}</span>
        </summary>
        <div className="accordion-content">
          {allConditionItems.length > 0 ? (
            <div className="condition-cards">
              {allConditionItems.map((it, i) => {
                const key = `${it.name}-${i}`;
                const expanded = expandedItems.has(key);
                const isUnchanged =
                  it.from_condition === it.to_condition &&
                  (it.informational || it.severity === "Low");
                const beforeBullets = parseNotesToBullets(it.from_condition_notes);
                const nowBullets = parseNotesToBullets(it.to_condition_notes);

                return (
                  <div
                    key={key}
                    className={`condition-card ${it.informational ? "informational" : ""} severity-${(it.severity || "low").toLowerCase()}`}
                  >
                    <div className="condition-card-header" onClick={() => toggleExpand(key)}>
                      <span className="condition-item-name">{it.name}</span>
                      {it.isExtra && <span className="extra-chip">extra</span>}
                      <span className={`condition-status-chip ${isUnchanged ? "no-change" : "changed"}`}>
                        {isUnchanged ? "✔ No Change" : "⚠ Changed"}
                      </span>
                      <span className={`risk-chip risk-${(it.severity || "low").toLowerCase()}`}>
                        {it.severity || "Low"}
                      </span>
                      <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
                    </div>
                    {expanded && (
                      <div className="condition-card-detail">
                        <div className="before-now-row">
                          {isUnchanged ? (
                            <p className="unchanged-message">✔ Condition unchanged</p>
                          ) : (
                            <>
                              <div className="before-now-col">
                                <strong>Before:</strong>
                                <ul>
                                  {beforeBullets.map((b, j) => (
                                    <li key={j}>{b}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="before-now-col">
                                <strong>Now:</strong>
                                <ul>
                                  {nowBullets.map((b, j) => (
                                    <li key={j}>{b}</li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}
                        </div>
                        {!isUnchanged && (
                          <div className="condition-transition">
                            {it.from_condition} → {it.to_condition}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="no-items">No condition changes</p>
          )}
        </div>
      </details>

      {/* Unchanged items — collapsed by default */}
      {(delta.unchanged_items?.length || 0) > 0 && (
        <details className="accordion-section unchanged">
          <summary>{delta.unchanged_items.length} item(s) unchanged</summary>
          <ul className="unchanged-list">
            {delta.unchanged_items.map((it, i) => (
              <li key={i}>
                {it.name} — {it.condition}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Action Bar */}
      <div className="delta-action-bar">
        <button
          className="action-btn primary"
          onClick={handleExport}
          disabled={actionLoading != null}
        >
          {actionLoading === "export" ? "Exporting…" : "Export Delta Report"}
        </button>
        <button
          className="action-btn"
          onClick={handleFlag}
          disabled={actionLoading != null}
        >
          {actionLoading === "flag" ? "Flagging…" : "Flag for Manual Review"}
        </button>
        <button
          className="action-btn approve"
          onClick={handleApprove}
          disabled={actionLoading != null}
        >
          {actionLoading === "approve" ? "Approving…" : "Approve Checkpoint"}
        </button>
      </div>

      {toast && (
        <div className={`delta-toast delta-toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </section>
  );
}

export default DeltaReport;
