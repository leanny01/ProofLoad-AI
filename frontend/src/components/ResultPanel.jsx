function ResultPanel({ result }) {
  const isVerified = result.status === "Verified";

  return (
    <section className="result-section">
      <div className={`status-badge ${isVerified ? "verified" : "mismatch"}`}>
        <span className="status-icon">{isVerified ? "\u2713" : "\u2717"}</span>
        <span className="status-text">{result.status}</span>
      </div>

      <div className="confidence-row">
        <span className="confidence-label">Confidence:</span>
        <span className={`confidence-value confidence-${result.confidence?.toLowerCase()}`}>
          {result.confidence}
        </span>
      </div>

      <div className="summary-box">
        <p>{result.summary}</p>
      </div>

      <div className="items-grid">
        <div className="items-card missing">
          <h3>
            <span className="items-icon">&#9888;</span> Missing Items
          </h3>
          {result.missing_items?.length > 0 ? (
            <ul>
              {result.missing_items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="no-items">None</p>
          )}
        </div>

        <div className="items-card extra">
          <h3>
            <span className="items-icon">&#43;</span> Extra Items
          </h3>
          {result.extra_items?.length > 0 ? (
            <ul>
              {result.extra_items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="no-items">None</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default ResultPanel;
