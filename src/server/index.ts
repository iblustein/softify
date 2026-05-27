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

      // Seed invalid proposed action for SEO (contains forbidden vendor changes)
      await repos.proposedActions.createProposedAction({
        id: "test-invalid-seo-action",
        organizationId: "demo-org-id",
        storeConnectionId: "store-yambasurf",
        agentRunId: "RUN-SEED-INVALID",
        agentId: "agent_product_seo",
        recommendationId: "REC-SEED-INVALID-SEO",
        targetType: "PRODUCT",
        targetId: "101",
        title: "Test SEO Proposed Action with Invalid Fields",
        description: "Simulated invalid proposed action containing forbidden vendor fields for SEO",
        actionType: "simulated_action",
        riskLevel: "LOW",
        executionMode: "APPROVAL_REQUIRED",
        changes: { vendor: "SEO Proposed Vendor" },
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Seed invalid proposed action for Cleanup (contains forbidden title changes)
      await repos.proposedActions.createProposedAction({
        id: "test-invalid-cleanup-action",
        organizationId: "demo-org-id",
        storeConnectionId: "store-yambasurf",
        agentRunId: "RUN-SEED-INVALID",
        agentId: "agent_catalog_cleanup",
        recommendationId: "REC-SEED-INVALID-CLEANUP",
        targetType: "PRODUCT",
        targetId: "101",
        title: "Test Cleanup Proposed Action with Invalid Fields",
        description: "Simulated invalid proposed action containing forbidden title fields for Cleanup",
        actionType: "simulated_action",
        riskLevel: "LOW",
        executionMode: "APPROVAL_REQUIRED",
        changes: { title: "Cleanup Proposed Title" },
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Seed invalid proposed action for Merchandising Insights (read-only agent has no proposal permissions)
      await repos.proposedActions.createProposedAction({
        id: "test-invalid-readonly-action",
        organizationId: "demo-org-id",
        storeConnectionId: "store-yambasurf",
        agentRunId: "RUN-SEED-INVALID",
        agentId: "agent_merchandising_insights",
        recommendationId: "REC-SEED-INVALID-READONLY",
        targetType: "PRODUCT",
        targetId: "101",
        title: "Test Readonly Proposed Action",
        description: "Simulated invalid proposed action for read-only Merchandising Insights agent",
        actionType: "simulated_action",
        riskLevel: "LOW",
        executionMode: "APPROVAL_REQUIRED",
        changes: { title: "Readonly Proposed Title" },
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
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
