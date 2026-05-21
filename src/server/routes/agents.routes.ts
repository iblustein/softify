import { Router } from "express";
import * as agentService from "../services/agent-registry.service.js";

const router = Router();

router.get("/agents", (req, res) => {
  try {
    const agents = agentService.getAgents();
    res.json(agents);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/agents/:id", (req, res) => {
  const { id } = req.params;
  const { enabled, systemInstruction, allowedTools } = req.body;
  try {
    const updatedAgent = agentService.updateAgent(id, { enabled, systemInstruction, allowedTools });
    res.json(updatedAgent);
  } catch (error: any) {
    res.status(error.message === "Agent not found" ? 404 : 400).json({ error: error.message });
  }
});

export default router;
