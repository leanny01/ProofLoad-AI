const express = require("express");
const multer = require("multer");
const { extractList, isListTypeSupported } = require("../services/listExtractionService");
const { verifyCheckpoint } = require("../services/checkpointVerificationService");
const { computeDelta } = require("../services/deltaReportService");
const {
  createProject,
  getProject,
  addCheckpoint,
  setCheckpointReport,
  updateCheckpointMetadata,
  listProjects,
} = require("../store/projectStore");

const router = express.Router();

const listUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isListTypeSupported(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported list format. Use CSV, XLSX, PDF, or image."), false);
    }
  },
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files allowed for photos"), false);
    }
  },
});

// ----- List projects -----
router.get("/projects", (_req, res) => {
  try {
    const list = listProjects();
    res.json({ projects: list });
  } catch (err) {
    console.error("List projects error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ----- Create project (upload manifest) -----
router.post("/projects", listUpload.single("manifest"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "manifest file is required" });
    }

    const extracted = await extractList(req.file);
    const project = createProject({
      expected_list_filename: req.file.originalname || "manifest",
      expected_items: extracted.expected_items,
      extraction_warnings: extracted.extraction_warnings,
      extraction_confidence: extracted.extraction_confidence,
    });

    res.status(201).json({
      project: {
        id: project.id,
        created_at: project.created_at,
        expected_list_filename: project.expected_list_filename,
        expected_items: project.expected_items,
        extraction_warnings: project.extraction_warnings,
        extraction_confidence: project.extraction_confidence,
        checkpoints: [],
      },
    });
  } catch (err) {
    console.error("Create project error:", err);
    res.status(500).json({
      error: err.message || "Failed to create project",
    });
  }
});

// ----- Get project -----
router.get("/projects/:id", (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json({ project });
});

// ----- Add checkpoint (upload photos) -----
router.post(
  "/projects/:id/checkpoints",
  photoUpload.array("photos", 20),
  async (req, res) => {
    try {
      const project = getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const photos = req.files || [];
      if (photos.length === 0) {
        return res.status(400).json({ error: "At least one photo is required" });
      }

      const type = req.body?.type || "checkpoint";
      if (!["start", "checkpoint", "end"].includes(type)) {
        return res.status(400).json({
          error: "Invalid checkpoint type. Use start, checkpoint, or end.",
        });
      }

      // Find the most recent checkpoint with a report to pass as context
      const previousCheckpoint = [...(project.checkpoints || [])]
        .reverse()
        .find((c) => c.report);
      const previousReport = previousCheckpoint?.report ?? null;

      const report = await verifyCheckpoint(
        project.expected_items,
        photos,
        project.expected_list_filename,
        previousReport
      );

      const checkpoint = addCheckpoint(project.id, {
        type,
        photo_filenames: photos.map((p) => p.originalname || "photo"),
        report,
      });
      setCheckpointReport(project.id, checkpoint.id, report);

      res.status(201).json({
        checkpoint: {
          id: checkpoint.id,
          type: checkpoint.type,
          created_at: checkpoint.created_at,
          photo_filenames: checkpoint.photo_filenames,
          report: checkpoint.report,
        },
      });
    } catch (err) {
      console.error("Add checkpoint error:", err);
      res.status(500).json({
        error: err.message || "Failed to verify checkpoint",
      });
    }
  }
);

// ----- Delta report (compare two checkpoints) -----
router.get("/projects/:id/delta", (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const fromId = req.query.from;
  const toId = req.query.to;

  if (!fromId || !toId) {
    return res.status(400).json({
      error: "Query parameters 'from' and 'to' (checkpoint ids) are required",
    });
  }

  const fromCp = project.checkpoints.find((c) => c.id === fromId);
  const toCp = project.checkpoints.find((c) => c.id === toId);

  if (!fromCp?.report || !toCp?.report) {
    return res.status(404).json({
      error: "One or both checkpoints not found or have no report",
    });
  }

  const delta = computeDelta(fromCp.report, toCp.report);
  delta.from_label = fromCp.type || "from";
  delta.to_label = toCp.type || "to";
  res.json({ delta });
});

// ----- PATCH checkpoint (flag / approve) -----
router.patch("/projects/:id/checkpoints/:checkpointId", (req, res) => {
  const project = getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const { checkpointId } = req.params;
  const cp = project.checkpoints.find((c) => c.id === checkpointId);
  if (!cp) {
    return res.status(404).json({ error: "Checkpoint not found" });
  }

  const { flagged, approved } = req.body || {};
  const updates = {};
  if (typeof flagged === "boolean") updates.flagged = flagged;
  if (typeof approved === "boolean") updates.approved = approved;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Provide flagged and/or approved" });
  }

  const updated = updateCheckpointMetadata(project.id, checkpointId, updates);
  res.json({ checkpoint: updated });
});

module.exports = router;
