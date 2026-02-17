import { useState } from "react";
import axios from "axios";
import ImageUpload from "./components/ImageUpload";
import ResultPanel from "./components/ResultPanel";
import "./App.css";

function App() {
  const [expectedImage, setExpectedImage] = useState(null);
  const [actualImage, setActualImage] = useState(null);
  const [expectedPreview, setExpectedPreview] = useState(null);
  const [actualPreview, setActualPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleImageSelect = (type, file) => {
    const preview = URL.createObjectURL(file);
    if (type === "expected") {
      setExpectedImage(file);
      setExpectedPreview(preview);
    } else {
      setActualImage(file);
      setActualPreview(preview);
    }
    // Clear previous results on new image
    setResult(null);
    setError(null);
  };

  const handleVerify = async () => {
    if (!expectedImage || !actualImage) {
      setError("Please upload both images before verifying.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("expectedImage", expectedImage);
    formData.append("actualImage", actualImage);

    try {
      const response = await axios.post("/api/verify", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
      });
      setResult(response.data);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.message ||
        "Verification failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setExpectedImage(null);
    setActualImage(null);
    setExpectedPreview(null);
    setActualPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo-mark">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#2563eb" />
            <path
              d="M9 16.5L13.5 21L23 11"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <h1>ProofLoad AI</h1>
          <p className="subtitle">Visual Load Verification</p>
        </div>
      </header>

      <main>
        <section className="upload-section">
          <ImageUpload
            label="Expected Load"
            description="What should be loaded"
            preview={expectedPreview}
            onSelect={(file) => handleImageSelect("expected", file)}
          />
          <div className="vs-divider">
            <span>VS</span>
          </div>
          <ImageUpload
            label="Actual Load"
            description="What was actually loaded"
            preview={actualPreview}
            onSelect={(file) => handleImageSelect("actual", file)}
          />
        </section>

        <section className="action-section">
          <button
            className="verify-btn"
            onClick={handleVerify}
            disabled={loading || !expectedImage || !actualImage}
          >
            {loading ? (
              <span className="spinner-wrap">
                <span className="spinner" />
                Analyzing...
              </span>
            ) : (
              "Verify Load"
            )}
          </button>
          {(result || error) && (
            <button className="reset-btn" onClick={handleReset}>
              Reset
            </button>
          )}
        </section>

        {error && (
          <section className="error-section">
            <div className="error-box">
              <strong>Error:</strong> {error}
            </div>
          </section>
        )}

        {result && <ResultPanel result={result} />}
      </main>

      <footer className="app-footer">
        <p>ProofLoad AI &mdash; Hackathon MVP</p>
      </footer>
    </div>
  );
}

export default App;
