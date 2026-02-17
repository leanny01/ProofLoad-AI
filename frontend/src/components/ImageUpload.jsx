import { useRef } from "react";

function ImageUpload({ label, description, preview, onSelect }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelect(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="upload-card"
      onClick={() => inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        hidden
      />
      {preview ? (
        <div className="preview-container">
          <img src={preview} alt={label} className="preview-img" />
          <div className="preview-overlay">
            <span>Click to replace</span>
          </div>
        </div>
      ) : (
        <div className="upload-placeholder">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            className="upload-icon"
          >
            <rect
              x="4"
              y="8"
              width="40"
              height="32"
              rx="4"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M4 32L14 22L22 30L30 20L44 34"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="16" cy="18" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p className="upload-label">{label}</p>
          <p className="upload-desc">{description}</p>
          <p className="upload-hint">Click or drag image here</p>
        </div>
      )}
      {preview && <p className="card-label">{label}</p>}
    </div>
  );
}

export default ImageUpload;
