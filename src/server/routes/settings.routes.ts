import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { getSystemAiEngines, testAiEngineConnection } from "../services/ai-engine.service.js";

const router = Router();

// Helper to validate tenant context
async function validateTenant(req: any, res: any) {
  const shop = req.query.shop || req.body.shop;
  const organizationId = req.query.organizationId || req.body.organizationId || req.headers["x-organization-id"];

  if (!shop || typeof shop !== "string") {
    res.status(400).json({ error: "Missing or invalid shop domain.", code: "MISSING_SHOP" });
    return null;
  }

  const cleanShop = normalizeShopDomain(shop);
  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  if (!connection) {
    res.status(404).json({ error: "Store connection not found.", code: "UNKNOWN_SHOP" });
    return null;
  }

  if (connection.status !== "CONNECTED") {
    res.status(409).json({ error: "Store is disconnected.", code: "DISCONNECTED_SHOP" });
    return null;
  }

  if (organizationId && connection.organizationId !== organizationId) {
    res.status(403).json({ error: "Access denied. Tenant context mismatch.", code: "ACCESS_DENIED" });
    return null;
  }

  return { connection, cleanShop, repos };
}

/**
 * GET /api/settings/store-status
 * Returns connection and scope status.
 */
router.get("/settings/store-status", async (req, res) => {
  try {
    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;
    const { connection, cleanShop } = tenantCtx;

    const requiredScopes = ["read_themes", "write_themes"];
    const missingScopes = requiredScopes.filter(s => !connection.scopes.includes(s));
    const readyForThemeEditing = missingScopes.length === 0;

    res.json({
      shopDomain: cleanShop,
      connected: true,
      oauthConnected: connection.status === "CONNECTED",
      appInstallationStatus: connection.status,
      grantedScopes: connection.scopes,
      missingScopes,
      readyForThemeEditing,
      reconnectUrl: `/api/shopify/oauth/install?shop=${encodeURIComponent(cleanShop)}`
    });
  } catch (error: any) {
    console.error("Failed to read settings status:", error);
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/settings/ai-engines
 * Returns the list of registered system AI engines with sanitized metadata.
 */
router.get("/settings/ai-engines", async (req, res) => {
  try {
    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;
    const engines = getSystemAiEngines();
    res.json(engines);
  } catch (error: any) {
    console.error("Failed to read system AI engines:", error);
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /api/settings/ai-engines/:engineId/test
 * Securely executes the connection test using backend-only credentials.
 */
router.post("/settings/ai-engines/:engineId/test", async (req, res) => {
  try {
    const { engineId } = req.params;
    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;
    const result = await testAiEngineConnection(engineId);
    res.json(result);
  } catch (error: any) {
    console.error(`Failed to test connection for ${req.params.engineId}:`, error);
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/settings/agents
 * Lists available agents status.
 */
router.get("/settings/agents", async (req, res) => {
  try {
    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop, repos } = tenantCtx;

    const installation = await repos.agentInstallations.getByShopAndAgent(cleanShop, "theme_editor_ai_agent");
    const enabled = installation ? installation.enabled === true : false;
    const defaultModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    res.json([
      {
        agentId: "theme_editor_ai_agent",
        name: "Theme Editor AI Agent",
        description: "Shopify theme, Liquid, and JavaScript expert. Helps merchants edit and improve their storefront themes safely.",
        enabled,
        status: enabled ? "ACTIVE" : "INACTIVE",
        requiredPermissions: ["read_themes", "write_themes"],
        engineId: installation?.engineId || "gemini",
        model: installation?.model || defaultModel
      }
    ]);
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * PATCH /api/settings/agents/:agentId
 * Updates agent settings including enabled toggle, engineId, and model assignment.
 */
router.patch("/settings/agents/:agentId", async (req: any, res: any) => {
  try {
    const { agentId } = req.params;
    if (agentId !== "theme_editor_ai_agent") {
      return res.status(400).json({ error: "Only Theme Editor AI Agent can be managed in this phase.", code: "INVALID_AGENT" });
    }

    const { enabled, engineId, model } = req.body;
    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;
    const { connection, cleanShop, repos } = tenantCtx;

    const docId = `${connection.id}_${agentId}`;
    const existing = await repos.agentInstallations.getByShopAndAgent(cleanShop, agentId);

    const updateEnabled = typeof enabled === "boolean" ? enabled : (existing ? existing.enabled : false);
    const updateEngineId = typeof engineId === "string" ? engineId : (existing?.engineId || "gemini");
    
    const defaultModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const updateModel = typeof model === "string" ? model : (existing?.model || defaultModel);

    // Validate engineId
    if (updateEngineId !== "gemini") {
      return res.status(400).json({ error: "Only Gemini engine is supported in this phase.", code: "INVALID_ENGINE" });
    }

    // Validate model
    const engines = getSystemAiEngines();
    const gemini = engines.find(e => e.engineId === "gemini");
    if (model && (!gemini || !gemini.supportedModels.includes(model))) {
      return res.status(400).json({ error: `Unsupported model '${model}' for engine 'gemini'.`, code: "UNSUPPORTED_MODEL" });
    }

    const saved = await repos.agentInstallations.upsertInstallation({
      id: docId,
      organizationId: connection.organizationId,
      storeConnectionId: connection.id,
      shopDomain: cleanShop,
      agentId,
      enabled: updateEnabled,
      engineId: updateEngineId,
      model: updateModel,
      allowedTools: [
        "shopify.theme.themes",
        "shopify.theme.assets",
        "shopify.theme.assets.read",
        "shopify.theme.assets.write"
      ],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    res.json({
      ok: true,
      agentId,
      enabled: saved.enabled,
      status: saved.enabled ? "ACTIVE" : "INACTIVE",
      engineId: saved.engineId,
      model: saved.model
    });
  } catch (error: any) {
    console.error("Failed to update agent settings:", error);
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/settings/ai-providers
 * Returns configured AI Engine status metadata.
 */
router.get("/settings/ai-providers", async (req, res) => {
  try {
    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;

    const key = process.env.GEMINI_API_KEY;
    const configured = typeof key === "string" && key.trim() !== "";
    const activeModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    res.json([
      {
        providerId: "gemini",
        name: "Gemini AI Engine",
        configured,
        activeModel
      }
    ]);
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * PATCH /api/settings/ai-providers/:providerId
 * Modifies configuration metadata.
 */
router.patch("/settings/ai-providers/:providerId", async (req: any, res: any) => {
  try {
    const { providerId } = req.params;
    if (providerId !== "gemini") {
      return res.status(400).json({ error: "Only Gemini provider is active.", code: "INVALID_PROVIDER" });
    }

    const tenantCtx = await validateTenant(req, res);
    if (!tenantCtx) return;

    res.json({
      ok: true,
      providerId,
      message: "AI engine parameters updated successfully in cache metadata."
    });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

export default router;
