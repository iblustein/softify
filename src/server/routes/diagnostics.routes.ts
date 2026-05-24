import { Router } from "express";
import { isShopifyOAuthConfigured } from "../config/shopify.config.js";
import { isFirestoreConfigured } from "../config/firestore.config.js";

const router = Router();

/**
 * GET /api/diagnostics
 * Confirms critical runtime integrations and environment variables are healthy
 * without exposing raw secret values or credentials.
 */
router.get("/diagnostics", (req, res) => {
  try {
    const oauthConfigured = isShopifyOAuthConfigured();
    const repositoryBackend = process.env.REPOSITORY_BACKEND || "memory";
    const firestoreConfigured = isFirestoreConfigured() && Boolean(process.env.GOOGLE_CLOUD_PROJECT);
    const devBypassAllowed = process.env.SOFTIFY_ALLOW_AGENT_DEV_BYPASS === "true";
    const devBypassSecretConfigured = Boolean(process.env.SOFTIFY_AGENT_DEV_BYPASS_SECRET);

    res.json({
      ok: true,
      diagnostics: {
        shopifyOAuthConfigured: oauthConfigured,
        repositoryBackend: repositoryBackend,
        firestoreDatabaseConfigured: firestoreConfigured,
        agentDevBypassAllowed: devBypassAllowed,
        agentDevBypassSecretConfigured: devBypassSecretConfigured
      }
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
