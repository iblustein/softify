import { Router } from "express";
import { runAgentChat } from "../services/agent-runtime.service.js";

const router = Router();

/**
 * POST /api/agents/chat
 * Trigger a read-only chat turn with a designated AI Agent.
 */
router.post("/chat", async (req, res) => {
  try {
    const { shop, agentId, message } = req.body;

    if (!shop || typeof shop !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing required parameter: 'shop' must be a valid Shopify domain string."
      });
    }

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing required parameter: 'agentId' must be a string."
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Missing required parameter: 'message' must be a non-empty string."
      });
    }

    const result = await runAgentChat({ shop, agentId, message });
    res.json(result);
  } catch (error: any) {
    // Secure exception handling to guarantee zero token or internal system credentials leakage
    res.status(500).json({
      ok: false,
      error: "An internal server error occurred while processing the agent request."
    });
  }
});

export default router;
