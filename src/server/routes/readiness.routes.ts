import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { getAgents } from "../services/agent-registry.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";

const router = Router();

router.get("/shop/readiness", async (req, res) => {
  try {
    const { shop, organizationId } = req.query;
    const shopDomain = typeof shop === "string" && shop.trim() !== "" ? shop.trim() : undefined;
    const orgId = typeof organizationId === "string" && organizationId.trim() !== "" ? organizationId.trim() : undefined;
    
    if (!shopDomain && !orgId) {
      return res.status(400).json({
        error: "Missing tenant context: either 'shop' or 'organizationId' must be provided.",
        code: "MISSING_TENANT_CONTEXT"
      });
    }

    const repos = getRepositories();
    let connection = null;

    if (shopDomain) {
      const cleanShop = normalizeShopDomain(shopDomain);
      connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

      if (!connection) {
        return res.json({
          hasReadProducts: false,
          hasWriteProducts: false,
          canRunInsights: false,
          canExecuteMutations: false,
          missingRequiredScopes: ["read_products", "write_products"],
          connectionStatus: "DISCONNECTED",
          syncFreshness: null,
          snapshotCount: 0,
          agentReadiness: "NOT_READY"
        });
      }

      if (orgId && connection.organizationId !== orgId) {
        return res.status(403).json({
          error: "Access denied. Tenant context mismatch.",
          code: "ACCESS_DENIED"
        });
      }
    } else {
      // organizationId provided without shop
      return res.status(400).json({
        error: "Missing shop context. Cannot resolve store readiness diagnostics.",
        code: "MISSING_SHOP_CONTEXT"
      });
    }

    const hasReadProducts = connection.scopes.includes("read_products");
    const hasWriteProducts = connection.scopes.includes("write_products");
    const canRunInsights = hasReadProducts;
    const canExecuteMutations = hasReadProducts && hasWriteProducts;

    const missingRequiredScopes: string[] = [];
    if (!hasReadProducts) missingRequiredScopes.push("read_products");
    if (!hasWriteProducts) missingRequiredScopes.push("write_products");

    const syncFreshness = await repos.products.getLatestProductSyncAt(connection.storeUrl);
    const snapshotCount = await repos.products.countProductSnapshotsByShop(connection.storeUrl);

    const activeAgents = getAgents();
    const hasActiveAgent = activeAgents.some(a => a.enabled);
    const agentReadiness = hasActiveAgent ? "READY" : "NOT_READY";

    // Strictly sanitised and allowlisted JSON payload
    res.json({
      shopDomain: connection.storeUrl,
      storeConnectionId: connection.id,
      hasReadProducts,
      hasWriteProducts,
      canRunInsights,
      canExecuteMutations,
      missingRequiredScopes,
      connectionStatus: connection.status,
      syncFreshness,
      snapshotCount,
      agentReadiness
    });
  } catch (error: any) {
    // Avoid returning raw error.message directly to merchant-facing clients
    res.status(500).json({
      error: "An internal server error occurred while retrieving readiness status.",
      code: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
