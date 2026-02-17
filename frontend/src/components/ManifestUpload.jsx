import { useRef, useState } from "react";

const ACCEPT =
  ".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf,image/*";

function ManifestUpload({ onUpload, loading, error }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);

  const handleChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (file) onUpload(file);
  };

  return (
    <section className="manifest-upload">
      <h2>Create Project</h2>
      <p className="section-desc">
        Upload your expected list (CSV, XLSX, PDF, or image). The system will extract items and create a verification project.
      </p>
      <form onSubmit={handleSubmit}>
        <div
          className="upload-zone"
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleChange}
            hidden
          />
          {file ? (
            <p className="file-name">{file.name}</p>
          ) : (
            <p className="upload-hint">Click or drag list file (CSV, XLSX, PDF, image)</p>
          )}
        </div>
        {error && <div className="error-box">{error}</div>}
        <button type="submit" className="verify-btn" disabled={!file || loading}>
          {loading ? (
            <span className="spinner-wrap">
              <span className="spinner" />
              Extracting…
            </span>
          ) : (
            "Create Project"
          )}
        </button>
      </form>
    </section>
  );
}

export default ManifestUpload;
