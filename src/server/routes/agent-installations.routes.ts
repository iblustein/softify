import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { getAgentDefinition } from "../agents/agent-definitions.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";

const router = Router();

/**
 * Validate secured development bypass authorization header.
 */
function checkDevBypass(req: any, res: any): boolean {
  const bypassAllowed = process.env.SOFTIFY_ALLOW_AGENT_DEV_BYPASS === "true";
  const bypassSecret = process.env.SOFTIFY_AGENT_DEV_BYPASS_SECRET;
  const bypassHeader = req.headers["x-softify-dev-bypass"] || req.headers["X-Softify-Dev-Bypass"];

  if (!bypassAllowed || !bypassSecret || bypassHeader !== bypassSecret) {
    res.status(401).json({ ok: false, code: "UNAUTHORIZED", error: "Unauthorized access." });
    return false;
  }
  return true;
}

/**
 * POST /api/agents/install
 * Installs or enables an agent for a specific shop.
 */
router.post("/agents/install", async (req: any, res: any) => {
  try {
    if (!checkDevBypass(req, res)) return;

    const { shop, agentId, allowedTools } = req.body;

    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ ok: false, code: "INVALID_PARAMETERS", error: "Missing shop parameter." });
    }

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({ ok: false, code: "INVALID_PARAMETERS", error: "Missing agentId parameter." });
    }

    const cleanShop = normalizeShopDomain(shop);

    // Load active store connection
    const repos = getRepositories();
    const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);

    if (!storeConnection) {
      return res.status(404).json({
        ok: false,
        code: "UNKNOWN_SHOP",
        error: `Shop connection not found for domain: ${cleanShop}`
      });
    }

    if (storeConnection.status !== "CONNECTED") {
      return res.status(409).json({
        ok: false,
        code: "DISCONNECTED_SHOP",
        error: `Shop connection is not connected. Status: ${storeConnection.status}`
      });
    }

    const agentDefinition = getAgentDefinition(agentId);
    if (!agentDefinition) {
      return res.status(404).json({
        ok: false,
        code: "UNKNOWN_AGENT",
        error: `Unknown agent ID: ${agentId}`
      });
    }

    // Validate that store connection has all required scopes for the agent
    const missingScopes = agentDefinition.requiredScopes.filter(
      scope => !storeConnection.scopes.includes(scope)
    );
    if (missingScopes.length > 0) {
      return res.status(403).json({
        ok: false,
        code: "MISSING_REQUIRED_SCOPES",
        error: `Store connection is missing required agent scopes: ${missingScopes.join(", ")}`
      });
    }

    // Validate allowedTools subset
    let finalAllowedTools = agentDefinition.allowedTools;
    if (allowedTools) {
      if (!Array.isArray(allowedTools)) {
        return res.status(400).json({
          ok: false,
          code: "INVALID_PARAMETERS",
          error: "allowedTools must be an array of strings."
        });
      }
      const staticTools = new Set(agentDefinition.allowedTools);
      const invalidTools = allowedTools.filter(t => !staticTools.has(t));
      if (invalidTools.length > 0) {
        return res.status(409).json({
          ok: false,
          code: "AGENT_INSTALLATION_INVALID",
          error: `Requested tools exceed static definition limits: ${invalidTools.join(", ")}`
        });
      }
      finalAllowedTools = allowedTools;
    }

    const docId = `${storeConnection.id}_${agentDefinition.id}`;
    const now = new Date().toISOString();

    const existingInstallation = await repos.agentInstallations.getByShopAndAgent(cleanShop, agentId);

    const installationInput = {
      id: docId,
      organizationId: storeConnection.organizationId || "org_demo",
      storeConnectionId: storeConnection.id,
      shopDomain: cleanShop,
      agentId: agentDefinition.id,
      enabled: true,
      allowedTools: finalAllowedTools,
      createdAt: existingInstallation?.createdAt || now,
      updatedAt: now
    };

    const saved = await repos.agentInstallations.upsertInstallation(installationInput);

    // Strip sensitive / token fields explicitly before returning
    res.json({
      ok: true,
      installation: {
        id: saved.id,
        organizationId: saved.organizationId,
        storeConnectionId: saved.storeConnectionId,
        shopDomain: saved.shopDomain,
        agentId: saved.agentId,
        enabled: saved.enabled,
        allowedTools: saved.allowedTools,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      }
    });

  } catch (error: any) {
    res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Internal server error." });
  }
});

/**
 * GET /api/agents/installations/status
 * Retrieves installation status of an agent for a specific shop.
 */
router.get("/agents/installations/status", async (req: any, res: any) => {
  try {
    if (!checkDevBypass(req, res)) return;

    const { shop, agentId } = req.query;

    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ ok: false, code: "INVALID_PARAMETERS", error: "Missing shop parameter." });
    }

    if (!agentId || typeof agentId !== "string") {
      return res.status(400).json({ ok: false, code: "INVALID_PARAMETERS", error: "Missing agentId parameter." });
    }

    const cleanShop = normalizeShopDomain(shop);
    const repos = getRepositories();

    const inst = await repos.agentInstallations.getByShopAndAgent(cleanShop, agentId);

    if (!inst) {
      return res.json({
        ok: true,
        shop: cleanShop,
        agentId,
        installed: false,
        enabled: false,
        allowedTools: []
      });
    }

    res.json({
      ok: true,
      shop: cleanShop,
      agentId,
      installed: true,
      enabled: inst.enabled,
      allowedTools: inst.allowedTools || []
    });

  } catch (error: any) {
    res.status(500).json({ ok: false, code: "SERVER_ERROR", error: "Internal server error." });
  }
});

export default router;
