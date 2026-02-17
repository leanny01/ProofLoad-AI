import { useRef, useState } from "react";
import axios from "axios";

function CheckpointForm({ projectId, onSuccess, onCancel }) {
  const inputRef = useRef(null);
  const [type, setType] = useState("start");
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const list = Array.from(e.target.files || []);
    setFiles(list);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      setError("Select at least one photo");
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("type", type);
    files.forEach((f) => formData.append("photos", f));
    try {
      const res = await axios.post(`/api/projects/${projectId}/checkpoints`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 90000,
      });
      onSuccess?.(res.data.checkpoint);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="checkpoint-form">
      <h3>Add Checkpoint</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label>Checkpoint type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="start">Start</option>
            <option value="checkpoint">Checkpoint</option>
            <option value="end">End</option>
          </select>
        </div>
        <div className="form-row">
          <label>Photos</label>
          <div
            className="upload-zone small"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleChange}
              hidden
            />
            {files.length > 0 ? (
              <p className="file-name">{files.length} photo(s) selected</p>
            ) : (
              <p className="upload-hint">Click to select photos</p>
            )}
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="form-actions">
          <button type="button" className="reset-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="verify-btn" disabled={loading || files.length === 0}>
            {loading ? (
              <span className="spinner-wrap">
                <span className="spinner" />
                Verifying…
              </span>
            ) : (
              "Verify & Add"
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

export default CheckpointForm;
