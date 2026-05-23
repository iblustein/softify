import { Router } from "express";
import { runAgentChat } from "../services/agent-runtime.service.js";
import { resolvePlatformContext } from "../services/platform-context-resolver.service.js";
import { PlatformContextError } from "../services/platform-context-error.js";

const router = Router();

/**
 * POST /api/agents/chat
 * Trigger an authenticated, tenant-safe chat turn with a designated AI Agent.
 */
router.post("/chat", async (req, res) => {
  try {
    const { shop, agentId, message } = req.body;

    if (!shop || typeof shop !== "string") {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REQUEST",
        error: "Missing required parameter: 'shop' must be a valid Shopify domain string."
      });
    }

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REQUEST",
        error: "Missing required parameter: 'agentId' must be a string."
      });
    }

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        code: "INVALID_REQUEST",
        error: "Missing required parameter: 'message' must be a non-empty string."
      });
    }

    // 1. Resolve and validate the tenant platform context
    const context = await resolvePlatformContext({ shop, agentId, request: req });

    // 2. Invoke the secure agent runtime
    const result = await runAgentChat({ shop, agentId, message, context });
    res.json(result);
  } catch (error: any) {
    // 3. Exception Gating: Safe structured error responses that never leak secrets or stack traces
    if (error instanceof PlatformContextError) {
      return res.status(error.httpStatus).json({
        ok: false,
        code: error.code,
        error: error.message
      });
    }

    console.error("Agent chat execution failed:", error);
    res.status(500).json({
      ok: false,
      code: "INTERNAL_ERROR",
      error: "An internal server error occurred while processing the agent request."
    });
  }
});

export default router;
