import path from "path";
import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import { app } from "./app.js";

import { getRepositories } from "./repositories/repository-provider.js";
import { isFirestoreConfigured } from "./config/firestore.config.js";
import { encryptAccessToken } from "./services/token-crypto.service.js";
import crypto from "crypto";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function seedInMemoryDb() {
  if (isFirestoreConfigured()) return;
  try {
    const repos = getRepositories();
    const connections = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
    if (connections.length === 0) {
      const encryptedToken = await encryptAccessToken("mock-shopify-access-token");
      
      // Seed glowthread-apparel
      await repos.stores.createStoreConnection({
        id: "store-glowthread",
        organizationId: "demo-org-id",
        storeUrl: "glowthread-apparel.myshopify.com",
        accessTokenEncrypted: encryptedToken,
        scopes: ["read_products", "write_products", "read_orders", "read_customers", "write_themes", "read_analytics"],
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        plan: "Shopify Plus",
        currency: "USD"
      });

      // Seed luminary-essentials
      await repos.stores.createStoreConnection({
        id: "store-luminary",
        organizationId: "demo-org-id",
        storeUrl: "luminary-essentials.myshopify.com",
        accessTokenEncrypted: encryptedToken,
        scopes: ["read_products", "write_products", "read_orders", "read_customers", "write_themes", "read_analytics"],
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        plan: "Shopify Plus",
        currency: "USD"
      });

      // Seed yambasurf-co-il
      await repos.stores.createStoreConnection({
        id: "store-yambasurf",
        organizationId: "demo-org-id",
        storeUrl: "yambasurf-co-il.myshopify.com",
        accessTokenEncrypted: encryptedToken,
        scopes: ["read_products", "write_products", "read_orders", "read_customers", "write_themes", "read_analytics"],
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        plan: "Standard Plan",
        currency: "ILS"
      });

      // Seed scope-mismatch connection (no write_products)
      await repos.stores.createStoreConnection({
        id: "store-scope-mismatch",
        organizationId: "demo-org-id",
        storeUrl: "scope-mismatch.myshopify.com",
        accessTokenEncrypted: encryptedToken,
        scopes: ["read_products", "read_orders", "read_customers", "write_themes", "read_analytics"],
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        plan: "Standard Plan",
        currency: "USD"
      });

      // Seed stuck executing approval request (stuck beyond 15 min threshold)
      await repos.approvals.createApprovalRequest({
        id: "stuck-executing-approval",
        organizationId: "demo-org-id",
        storeConnectionId: "store-luminary",
        agentInstallationId: "inst-mock",
        agentId: "agent_product_intelligence",
        toolName: "catalog.products.propose_update",
        requestedBy: "Product Intelligence Agent",
        status: "EXECUTING",
        riskLevel: "Medium",
        targetType: "PRODUCT_PROPOSAL",
        targetId: "101",
        proposedChangesSummary: "Stuck update title",
        diffSummary: "Stuck update title",
        sanitizedPayload: { title: "Stuck Update Title" },
        allowedFields: ["title", "vendor", "productType", "status", "tags"],
        executionStartedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        executionAttemptCount: 1,
        lastExecutionStatus: "EXECUTING",
        lastExecutedBy: "Shop Owner",
        lastExecutionCorrelationId: "exec-stuck-uuid"
      });

      // Seed active executing approval request (non-stuck)
      await repos.approvals.createApprovalRequest({
        id: "active-executing-approval",
        organizationId: "demo-org-id",
        storeConnectionId: "store-luminary",
        agentInstallationId: "inst-mock",
        agentId: "agent_product_intelligence",
        toolName: "catalog.products.propose_update",
        requestedBy: "Product Intelligence Agent",
        status: "EXECUTING",
        riskLevel: "Medium",
        targetType: "PRODUCT_PROPOSAL",
        targetId: "101",
        proposedChangesSummary: "Active update title",
        diffSummary: "Active update title",
        sanitizedPayload: { title: "Active Update Title" },
        allowedFields: ["title", "vendor", "productType", "status", "tags"],
        executionStartedAt: new Date().toISOString(),
        executionAttemptCount: 1,
        lastExecutionStatus: "EXECUTING",
        lastExecutedBy: "Shop Owner",
        lastExecutionCorrelationId: "exec-active-uuid"
      });


      console.log("[DATABASE SEED] Seeded mock store connections and recovery approvals in-memory.");
    }
  } catch (error) {
    console.error("[DATABASE SEED] Seeding failed:", error);
  }
}

async function startServer() {
  await seedInMemoryDb();
  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Shopify AI Agent Control Center] Listening on port ${PORT}`);
  });
}

startServer();
export default app;
