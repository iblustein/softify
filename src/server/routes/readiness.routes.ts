import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { getAgents } from "../services/agent-registry.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";

const router = Router();

router.get("/shop/readiness", async (req, res) => {
  try {
    const { shop } = req.query;
    const shopDomain = typeof shop === "string" ? shop : undefined;
    
    const repos = getRepositories();
    let connection = null;

    if (shopDomain) {
      const cleanShop = normalizeShopDomain(shopDomain);
      connection = await repos.stores.getStoreConnectionByUrl(cleanShop);
    }

    if (!connection) {
      // Fallback similar to shop.service.ts
      const connections = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
      connection = connections.find(c => c.status === "CONNECTED") || 
                   connections.find(c => c.status === "REAUTH_REQUIRED") ||
                   connections.find(c => c.status === "DISCONNECTED") ||
                   connections[0] || null;
    }

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
    res.status(500).json({ error: error.message });
  }
});

export default router;
