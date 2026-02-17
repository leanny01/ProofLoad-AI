/**
 * In-memory project store for MVP.
 * Projects hold expected items + checkpoints with inspection reports.
 */
const { randomUUID } = require("crypto");

const projects = new Map();

function createProject(payload) {
  const id = randomUUID();
  const project = {
    id,
    created_at: new Date().toISOString(),
    expected_list_filename: payload.expected_list_filename || "manifest",
    expected_items: payload.expected_items || [],
    extraction_warnings: payload.extraction_warnings || [],
    extraction_confidence: payload.extraction_confidence || "Medium",
    checkpoints: [],
  };
  projects.set(id, project);
  return project;
}

function getProject(id) {
  return projects.get(id) ?? null;
}

function addCheckpoint(projectId, payload) {
  const project = projects.get(projectId);
  if (!project) return null;

  const checkpointId = randomUUID();
  const checkpoint = {
    id: checkpointId,
    type: payload.type || "checkpoint",
    created_at: new Date().toISOString(),
    photo_filenames: payload.photo_filenames || [],
    report: payload.report || null,
  };
  project.checkpoints.push(checkpoint);
  return checkpoint;
}

function setCheckpointReport(projectId, checkpointId, report) {
  const project = projects.get(projectId);
  if (!project) return null;
  const cp = project.checkpoints.find((c) => c.id === checkpointId);
  if (!cp) return null;
  cp.report = { ...report, checkpoint_id: checkpointId };
  return cp;
}

function updateCheckpointMetadata(projectId, checkpointId, updates) {
  const project = projects.get(projectId);
  if (!project) return null;
  const cp = project.checkpoints.find((c) => c.id === checkpointId);
  if (!cp) return null;
  if (updates.flagged !== undefined) {
    cp.flagged = updates.flagged;
    cp.flagged_at = updates.flagged ? (updates.flagged_at || new Date().toISOString()) : null;
  }
  if (updates.approved !== undefined) {
    cp.approved = updates.approved;
    cp.approved_at = updates.approved ? (updates.approved_at || new Date().toISOString()) : null;
  }
  return cp;
}

function listProjects() {
  return Array.from(projects.values()).map((p) => ({
    id: p.id,
    created_at: p.created_at,
    expected_list_filename: p.expected_list_filename,
    expected_items_count: p.expected_items?.length ?? 0,
    checkpoints_count: p.checkpoints?.length ?? 0,
  }));
}

module.exports = {
  createProject,
  getProject,
  addCheckpoint,
  setCheckpointReport,
  updateCheckpointMetadata,
  listProjects,
};
