import { Router } from "express";
import { orchestrate, resetAllData } from "../services/orchestrator.service.js";

const router = Router();

router.post("/orchestrate", async (req, res) => {
  const { prompt, selectedAgentId } = req.body;
  
  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Instruction prompt cannot be empty" });
  }

  try {
    const messages = await orchestrate(prompt, selectedAgentId);
    res.json({ messages });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/reset-data", (req, res) => {
  try {
    resetAllData();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
