const express = require("express");
const multer = require("multer");
const { compareLoadImages } = require("../services/aiComparisonService");

const router = express.Router();

// Store uploads in memory (no disk, no DB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per image
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

const uploadFields = upload.fields([
  { name: "expectedImage", maxCount: 1 },
  { name: "actualImage", maxCount: 1 },
]);

router.post("/verify", (req, res, next) => {
  uploadFields(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        error: err.message || "File upload failed",
      });
    }

    try {
      // Validate both images present
      if (!req.files?.expectedImage?.[0] || !req.files?.actualImage?.[0]) {
        return res.status(400).json({
          error: "Both expectedImage and actualImage are required",
        });
      }

      const expectedImage = req.files.expectedImage[0];
      const actualImage = req.files.actualImage[0];

      // Call AI comparison service
      const verificationResult = await compareLoadImages(
        expectedImage,
        actualImage
      );

      return res.json(verificationResult);
    } catch (error) {
      console.error("Verification error:", error.message);
      return res.status(500).json({
        error: "Verification failed. Please try again.",
        details: error.message,
      });
    }
  });
});

module.exports = router;
