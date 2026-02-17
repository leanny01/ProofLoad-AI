function CheckpointReport({ report, checkpointType }) {
  if (!report) return null;
  const isVerified = report.status === "Verified";

  return (
    <section className="checkpoint-report">
      <div className={`status-badge ${isVerified ? "verified" : report.status === "NeedsReview" ? "needs-review" : "mismatch"}`}>
        <span className="status-icon">{isVerified ? "\u2713" : report.status === "NeedsReview" ? "?" : "\u2717"}</span>
        <span className="status-text">{report.status}</span>
        {checkpointType && <span className="checkpoint-type">{checkpointType}</span>}
      </div>

      {report.has_previous_checkpoint && (
        <div className="previous-context-tag">Compared against previous checkpoint</div>
      )}

      <div className="confidence-row">
        <span className="confidence-label">Confidence:</span>
        <span className={`confidence-value confidence-${(report.confidence || "").toLowerCase()}`}>
          {report.confidence}
        </span>
      </div>

      <div className="summary-box">
        <p>{report.summary}</p>
      </div>

      <div className="report-grid">
        <div className="items-card missing">
          <h3>Missing Items</h3>
          {report.missing?.length > 0 ? (
            <ul>
              {report.missing.map((it, i) => (
                <li key={i}>
                  {it.name} {it.expected_qty != null && `(expected: ${it.expected_qty})`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-items">None</p>
          )}
        </div>

        <div className="items-card extra">
          <h3>Extra Items (not on list)</h3>
          {report.extra?.length > 0 ? (
            <ul>
              {report.extra.map((it, i) => (
                <li key={i}>
                  <strong>{it.name}</strong> {it.observed_qty != null && `(qty: ${it.observed_qty})`} — {it.condition || "unknown"}
                  {it.condition_notes && (
                    <span className="condition-notes">{it.condition_notes}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-items">None</p>
          )}
        </div>

        <div className="items-card condition">
          <h3>Condition Issues</h3>
          {report.condition_issues?.length > 0 ? (
            <ul>
              {report.condition_issues.map((it, i) => (
                <li key={i}>
                  <strong>{it.name}</strong> — {it.condition} ({it.severity || "Medium"})
                  {it.condition_notes && (
                    <span className="condition-notes">{it.condition_notes}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-items">None</p>
          )}
        </div>
      </div>

      {report.line_items?.length > 0 && (
        <div className="line-items-table">
          <h3>Line Items</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Expected</th>
                <th>Observed</th>
                <th>Qty</th>
                <th>Condition</th>
                <th>Condition Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.line_items.map((it, i) => (
                <tr key={i} className={it.condition_changed ? "condition-changed-row" : ""}>
                  <td>{it.name}</td>
                  <td>{it.expected_qty ?? "—"}</td>
                  <td>{it.observed_qty ?? "—"}</td>
                  <td className={it.qty_result === "Match" ? "result-pass" : it.qty_result === "UnknownQty" ? "result-unknown" : "result-fail"}>
                    {it.qty_result ?? "—"}
                  </td>
                  <td className={it.condition_result === "Pass" ? "result-pass" : it.condition_result === "Fail" ? "result-fail" : "result-unknown"}>
                    {it.condition ?? "—"}
                    {it.condition_changed && (
                      <span className="changed-badge">changed</span>
                    )}
                    {it.previous_condition && (
                      <span className="previous-condition"> (was: {it.previous_condition})</span>
                    )}
                  </td>
                  <td className="notes-cell">{it.condition_notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.recommendations?.length > 0 && (
        <div className="recommendations">
          <h3>Recommendations</h3>
          <ul>
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default CheckpointReport;
