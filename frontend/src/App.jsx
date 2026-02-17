import { useState, useEffect } from "react";
import axios from "axios";
import ManifestUpload from "./components/ManifestUpload";
import CheckpointForm from "./components/CheckpointForm";
import CheckpointReport from "./components/CheckpointReport";
import DeltaReport from "./components/DeltaReport";
import "./App.css";

function App() {
  const [view, setView] = useState("home");
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [delta, setDelta] = useState(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [deltaFrom, setDeltaFrom] = useState("");
  const [deltaTo, setDeltaTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadProjects = async () => {
    try {
      const res = await axios.get("/api/projects");
      setProjects(res.data.projects || []);
    } catch {
      setProjects([]);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Auto-trigger compare when both checkpoints are selected
  useEffect(() => {
    if (!project?.id || !deltaFrom || !deltaTo || deltaFrom === deltaTo) return;
    const run = async () => {
      try {
        const res = await axios.get(`/api/projects/${project.id}/delta`, {
          params: { from: deltaFrom, to: deltaTo },
        });
        setDelta(res.data.delta);
        setSelectedCheckpoint(null);
      } catch (err) {
        setError(err.response?.data?.error || err.message || "Failed to fetch delta");
      }
    };
    run();
  }, [project?.id, deltaFrom, deltaTo]);

  const handleCreateProject = async (file) => {
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("manifest", file);
    try {
      const res = await axios.post("/api/projects", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      setProject(res.data.project);
      setView("project");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async (id) => {
    try {
      const res = await axios.get(`/api/projects/${id}`);
      const proj = res.data.project;
      setProject(proj);
      setView("project");
      setSelectedCheckpoint(null);
      setDelta(null);
      // Auto-select first and last checkpoint for comparison when 2+ exist
      const cps = proj.checkpoints || [];
      if (cps.length >= 2) {
        setDeltaFrom(cps[0].id);
        setDeltaTo(cps[cps.length - 1].id);
      } else {
        setDeltaFrom("");
        setDeltaTo("");
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load project");
    }
  };

  const handleCheckpointAdded = (checkpoint) => {
    if (project) {
      const updatedCheckpoints = [...(project.checkpoints || []), checkpoint];
      setProject({ ...project, checkpoints: updatedCheckpoints });
      setSelectedCheckpoint(checkpoint);
      setDelta(null);
      // When adding second+ checkpoint, set "to" to the new one for comparison
      if (updatedCheckpoints.length >= 2) {
        setDeltaFrom(updatedCheckpoints[0].id);
        setDeltaTo(checkpoint.id);
      }
    }
  };

  const handleFetchDelta = async () => {
    if (!project?.id || !deltaFrom || !deltaTo) return;
    try {
      const res = await axios.get(`/api/projects/${project.id}/delta`, {
        params: { from: deltaFrom, to: deltaTo },
      });
      setDelta(res.data.delta);
      setSelectedCheckpoint(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to fetch delta");
    }
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
          <p className="subtitle">Load Verification with Checkpoints</p>
        </div>
      </header>

      <main>
        {view === "home" && (
          <>
            <section className="home-actions">
              <button className="verify-btn" onClick={() => { setView("create"); setError(null); }}>
                + New Project
              </button>
            </section>
            <section className="projects-list">
              <h2>Projects</h2>
              {projects.length === 0 ? (
                <p className="empty-state">No projects yet. Create one to get started.</p>
              ) : (
                <ul className="project-cards">
                  {projects.map((p) => (
                    <li key={p.id} className="project-card" onClick={() => handleOpenProject(p.id)}>
                      <span className="project-filename">{p.expected_list_filename}</span>
                      <span className="project-meta">
                        {p.expected_items_count} items · {p.checkpoints_count} checkpoint(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {view === "create" && (
          <>
            <button className="back-btn" onClick={() => { setView("home"); setError(null); }}>
              ← Back
            </button>
            <ManifestUpload
              onUpload={handleCreateProject}
              loading={loading}
              error={error}
            />
          </>
        )}

        {view === "project" && project && (
          <>
            <button className="back-btn" onClick={() => { setView("home"); setProject(null); setDelta(null); setSelectedCheckpoint(null); setError(null); }}>
              ← Back to projects
            </button>

            <section className="project-header">
              <h2>{project.expected_list_filename}</h2>
              <p className="project-meta">
                {project.expected_items?.length ?? 0} expected items ·{" "}
                {project.extraction_confidence} extraction confidence
              </p>
              {project.extraction_warnings?.length > 0 && (
                <div className="warnings">
                  {project.extraction_warnings.slice(0, 3).map((w, i) => (
                    <span key={i} className="warning-tag">{w}</span>
                  ))}
                </div>
              )}
            </section>

            <section className="expected-items">
              <h3>Expected Items</h3>
              <ul className="expected-list">
                {project.expected_items?.slice(0, 15).map((it, i) => (
                  <li key={i}>
                    {it.name} {it.description && `— ${it.description}`}{" "}
                    {it.expected_qty != null && `(qty: ${it.expected_qty})`}
                  </li>
                ))}
                {project.expected_items?.length > 15 && (
                  <li className="more">+{project.expected_items.length - 15} more</li>
                )}
              </ul>
            </section>

            <section className="checkpoints-section">
              <h3>Checkpoints</h3>
              <div className="checkpoints-row">
                <div className="checkpoints-tabs">
                  {(project.checkpoints || []).map((cp) => (
                    <button
                      key={cp.id}
                      className={`checkpoint-tab ${selectedCheckpoint?.id === cp.id ? "active" : ""}`}
                      onClick={() => { setSelectedCheckpoint(cp); setDelta(null); }}
                    >
                      {cp.type} ({cp.photo_filenames?.length ?? 0} photos)
                    </button>
                  ))}
                </div>
                <details className="add-checkpoint-details">
                  <summary>+ Add Checkpoint</summary>
                  <CheckpointForm
                    projectId={project.id}
                    onSuccess={(cp) => { handleCheckpointAdded(cp); document.querySelector(".add-checkpoint-details")?.removeAttribute("open"); }}
                    onCancel={() => document.querySelector(".add-checkpoint-details")?.removeAttribute("open")}
                  />
                </details>
              </div>
            </section>

            {selectedCheckpoint?.report && (
              <CheckpointReport
                report={selectedCheckpoint.report}
                checkpointType={selectedCheckpoint.type}
              />
            )}

            {(project.checkpoints || []).length >= 2 && (
              <section className="delta-section">
                <div className="delta-controls-sticky">
                  <h3>Compare Checkpoints</h3>
                  <div className="delta-controls">
                    <select value={deltaFrom} onChange={(e) => setDeltaFrom(e.target.value)}>
                      <option value="">From</option>
                      {(project.checkpoints || []).map((cp) => (
                        <option key={cp.id} value={cp.id}>{cp.type}</option>
                      ))}
                    </select>
                    <span className="arrow">→</span>
                    <select value={deltaTo} onChange={(e) => setDeltaTo(e.target.value)}>
                      <option value="">To</option>
                      {(project.checkpoints || []).map((cp) => (
                        <option key={cp.id} value={cp.id}>{cp.type}</option>
                      ))}
                    </select>
                    <button
                      className="verify-btn small"
                      onClick={() => {
                        if (deltaFrom && deltaTo) handleFetchDelta();
                      }}
                      disabled={!deltaFrom || !deltaTo}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                {delta && (
                  <DeltaReport
                    delta={delta}
                    projectId={project.id}
                    toCheckpointId={deltaTo}
                    onAction={async () => {
                      const res = await axios.get(`/api/projects/${project.id}`);
                      setProject(res.data.project);
                    }}
                  />
                )}
              </section>
            )}

            {error && (
              <div className="error-box">{error}</div>
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>ProofLoad AI — Load Verification with Checkpoints</p>
      </footer>
    </div>
  );
}

export default App;
