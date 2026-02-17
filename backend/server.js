const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const verifyRoute = require("./routes/verify");
const projectsRoute = require("./routes/projects");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "ProofLoad AI" });
});

// Verification route (legacy)
app.use("/api", verifyRoute);
// Projects + checkpoints
app.use("/api", projectsRoute);

app.listen(PORT, () => {
  console.log(`ProofLoad AI backend running on port ${PORT}`);
});
