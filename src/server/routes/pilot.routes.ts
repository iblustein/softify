import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { getAgents } from "../services/agent-registry.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";

const router = Router();

// Helper to get allowed pilot shops
export function getPilotShops(): string[] {
  const envShops = process.env.SOFTIFY_PILOT_SHOPS || "";
  return envShops
    .split(",")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => normalizeShopDomain(s));
}

// Helper to check if a shop is in the allowlist
export function isPilotShopApproved(shopDomain: string): boolean {
  const cleanShop = normalizeShopDomain(shopDomain);
  const approvedShops = getPilotShops();
  return approvedShops.includes(cleanShop);
}

/**
 * GET /api/pilot/readiness
 * Summarizes pilot readiness for a shop domain under strict read-only containment.
 */
router.get("/pilot/readiness", async (req, res) => {
  try {
    const { shop } = req.query;
    if (typeof shop !== "string" || shop.trim() === "") {
      return res.status(400).json({
        error: "Missing shop parameter.",
        code: "MISSING_SHOP_PARAMETER"
      });
    }

    const rawShopDomain = shop.trim();
    const shopDomain = normalizeShopDomain(rawShopDomain);
    const pilotApproved = isPilotShopApproved(shopDomain);

    const pilotMessaging = {
      mode: "This pilot is read-only.",
      approvals: "Approvals do not execute automatically.",
      execution: "Execution is blocked unless write_products and policy allow it.",
      disclaimer: "No Shopify product changes will be made in the current read-only pilot mode."
    };

    if (!pilotApproved) {
      return res.json({
        shopDomain,
        pilotApproved: false,
        connected: false,
        readinessStatus: "NOT_READY",
        canRunInsights: false,
        canExecuteMutations: false,
        grantedScopeSummary: [],
        productSnapshotCount: 0,
        visibleProductionAgentCount: 0,
        mutationMode: "read_only_blocked",
        warnings: ["Shop is not approved for pilot participation"],
        pilotMessaging
      });
    }

    const repos = getRepositories();
    const connection = await repos.stores.getStoreConnectionByUrl(shopDomain);

    if (!connection) {
      return res.json({
        shopDomain,
        pilotApproved: true,
        connected: false,
        readinessStatus: "NOT_READY",
        canRunInsights: false,
        canExecuteMutations: false,
        grantedScopeSummary: [],
        productSnapshotCount: 0,
        visibleProductionAgentCount: 0,
        mutationMode: "read_only_blocked",
        warnings: ["Store connection does not exist"],
        pilotMessaging
      });
    }

    const hasReadProducts = connection.scopes.includes("read_products");
    const hasWriteProducts = connection.scopes.includes("write_products");
    
    const canRunInsights = hasReadProducts;
    // Always false for this pilot phase, as execution is blocked
    const canExecuteMutations = false;

    // Filter/sanitize scope list to prevent any secrets propagation
    // and actively strip any theme scopes to enforce no theme scope exposure.
    const grantedScopeSummary = connection.scopes
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== "read_themes" && s !== "write_themes");

    const productSnapshotCount = await repos.products.countProductSnapshotsByShop(shopDomain);

    // Visible production agents (excluding legacy ones)
    const productionAgents = getAgents().filter(a => !a.isLegacy);
    const visibleProductionAgentCount = productionAgents.length;

    const warnings: string[] = [];
    if (!hasWriteProducts) {
      warnings.push("write_products missing");
    }
    warnings.push("execution blocked");

    if (process.env.SOFTIFY_ALLOW_AGENT_DEV_BYPASS === "true") {
      warnings.push("dev bypass must not be merchant-facing");
    }

    res.json({
      shopDomain,
      pilotApproved: true,
      connected: true,
      readinessStatus: "READY",
      canRunInsights,
      canExecuteMutations,
      grantedScopeSummary,
      productSnapshotCount,
      visibleProductionAgentCount,
      mutationMode: "read_only_blocked",
      warnings,
      pilotMessaging
    });
  } catch (error: any) {
    res.status(500).json({
      error: "An internal server error occurred while retrieving pilot readiness.",
      code: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
