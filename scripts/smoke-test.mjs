import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import process from "process";

// 1. Re-spawn self under tsx loader if not already active to enable direct TS imports
if (!process.env.TSX_ACTIVE && !process.argv.includes("--child")) {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = spawnSync("node", ["--import", "tsx", scriptPath, "--child", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, TSX_ACTIVE: "1" }
  });
  process.exit(result.status ?? 1);
}

import dotenv from "dotenv";
dotenv.config();

import { URL } from "url";

let baseUrl = process.env.SOFTIFY_BASE_URL || "https://softify-595151907767.europe-west1.run.app";
const shop = process.env.SOFTIFY_TEST_SHOP || "yambasurf-co-il.myshopify.com";
const defaultLimit = process.env.SMOKE_PRODUCTS_LIMIT ? parseInt(process.env.SMOKE_PRODUCTS_LIMIT, 10) : 5;

// Centralized Test Fixtures (Strictly restricted to test environment context)
const TEST_ORGANIZATION_ID = "demo-org-id";
const TEST_SHOP = shop;
const TEST_STORE_CONNECTION_ID = "store-luminary";
const TEST_AGENT_INSTALLATION_ID = "inst-mock";

let isInMemory = false;
let localServerInstance = null;
let hasSeededFirestoreFixtures = false;
let uniqueSeoActionId = "test-invalid-seo-action";
let uniqueCleanupActionId = "test-invalid-cleanup-action";
let uniqueReadonlyActionId = "test-invalid-readonly-action";

const isLocalBaseUrl =
  baseUrl.includes("localhost") ||
  baseUrl.includes("127.0.0.1");

const bypassSecretEnv = process.env.SOFTIFY_AGENT_DEV_BYPASS_SECRET;


if (!bypassSecretEnv && !isLocalBaseUrl) {
  throw new Error("SOFTIFY_AGENT_DEV_BYPASS_SECRET is required for non-local agent chat smoke tests.");
}

const effectiveBypassSecret = bypassSecretEnv || "dev-bypass-secret";
const bypassSecret = effectiveBypassSecret;

console.log(`\n\x1b[1m\x1b[36m=== SOFTIFY SAAS RELEASE SMOKE TEST SUITE ===\x1b[0m`);
console.log(`\x1b[33mTarget base URL :\x1b[0m ${baseUrl}`);
console.log(`\x1b[33mTarget test shop:\x1b[0m ${shop}`);
console.log(`\x1b[33mDefault limit   :\x1b[0m ${defaultLimit}\n`);

const tests = [];
let passCount = 0;
let failCount = 0;

async function check(name, asyncFn) {
  console.log(`\x1b[36mRunning:\x1b[0m ${name}...`);
  try {
    await asyncFn();
    console.log(`\x1b[32m✓ PASS\x1b[0m\n`);
    tests.push({ name, status: "PASS" });
    passCount++;
  } catch (err) {
    console.error(`\x1b[31m✗ FAIL:\x1b[0m ${err.message}\n`);
    tests.push({ name, status: "FAIL", error: err.message });
    failCount++;
  }
}

function scanForForbiddenKeys(obj, path = "") {
  if (obj === null || obj === undefined) return;
  const forbidden = ["accessToken", "access_token", "accessTokenEncrypted", "authorization", "Authorization"];
  
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (forbidden.includes(key)) {
        throw new Error(`Security Violation: Forbidden key "${key}" found at path "${path ? path + "." + key : key}"`);
      }
      scanForForbiddenKeys(obj[key], path ? `${path}.${key}` : key);
    }
  }
}

async function checkResponse(res) {
  if (!res.ok) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch (_) {}
    throw new Error(`HTTP Error status ${res.status}. Body: ${bodyText}`);
  }
  return res;
}

async function seedInProcessDb() {
  const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
  const { encryptAccessToken } = await import("../src/server/services/token-crypto.service.ts");
  const repos = getRepositories();
  
  const encryptedToken = await encryptAccessToken("mock-shopify-access-token");
  
  // Seed store-glowthread
  await repos.stores.createStoreConnection({
    id: "store-glowthread",
    organizationId: "demo-org-id",
    storeUrl: "glowthread-apparel.myshopify.com",
    accessTokenEncrypted: encryptedToken,
    scopes: ["read_products", "write_products", "read_orders", "read_customers", "read_themes", "write_themes", "read_analytics"],
    status: "CONNECTED",
    connectedAt: new Date().toISOString(),
    plan: "Shopify Plus",
    currency: "USD"
  });

  // Seed store-luminary
  await repos.stores.createStoreConnection({
    id: "store-luminary",
    organizationId: "demo-org-id",
    storeUrl: "luminary-essentials.myshopify.com",
    accessTokenEncrypted: encryptedToken,
    scopes: ["read_products", "write_products", "read_orders", "read_customers", "read_themes", "write_themes", "read_analytics"],
    status: "CONNECTED",
    connectedAt: new Date().toISOString(),
    plan: "Shopify Plus",
    currency: "USD"
  });

  // Seed store-yambasurf
  await repos.stores.createStoreConnection({
    id: "store-yambasurf",
    organizationId: "demo-org-id",
    storeUrl: "yambasurf-co-il.myshopify.com",
    accessTokenEncrypted: encryptedToken,
    scopes: ["read_products", "write_products", "read_orders", "read_customers", "read_themes", "write_themes", "read_analytics"],
    status: "CONNECTED",
    connectedAt: new Date().toISOString(),
    plan: "Standard Plan",
    currency: "ILS"
  });

  // Seed store-scope-mismatch
  await repos.stores.createStoreConnection({
    id: "store-scope-mismatch",
    organizationId: "demo-org-id",
    storeUrl: "scope-mismatch.myshopify.com",
    accessTokenEncrypted: encryptedToken,
    scopes: ["read_products", "read_orders", "read_customers", "read_themes", "write_themes", "read_analytics"],
    status: "CONNECTED",
    connectedAt: new Date().toISOString(),
    plan: "Standard Plan",
    currency: "USD"
  });

  // Seed stuck-executing-approval
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

  // Seed active-executing-approval
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
  
  console.log("   [SMOKE-TEST] Seeded in-process memory database successfully with invalid proposed actions and mock connections.");
}

async function runSuite() {
  try {
    // 0. Pre-smoke runtime diagnostics check
    await check("0. Pre-smoke runtime diagnostics check", async () => {
      const timestamp = Date.now();
      const url = `${baseUrl}/api/diagnostics?t=${timestamp}`;
      const res = await fetch(url);
      await checkResponse(res);
      const data = await res.json();
      scanForForbiddenKeys(data);

      if (data.ok !== true || !data.diagnostics) {
        throw new Error(`Diagnostics returned failure status: ${JSON.stringify(data)}`);
      }

      const {
        shopifyOAuthConfigured,
        repositoryBackend,
        firestoreDatabaseConfigured,
        agentDevBypassAllowed,
        agentDevBypassSecretConfigured
      } = data.diagnostics;

      isInMemory = (repositoryBackend === "memory");

      console.log(`   [DIAGNOSTICS] shopifyOAuthConfigured         : ${shopifyOAuthConfigured}`);
      console.log(`   [DIAGNOSTICS] repositoryBackend              : ${repositoryBackend}`);
      console.log(`   [DIAGNOSTICS] firestoreDatabaseConfigured    : ${firestoreDatabaseConfigured}`);
      console.log(`   [DIAGNOSTICS] agentDevBypassAllowed          : ${agentDevBypassAllowed}`);
      console.log(`   [DIAGNOSTICS] agentDevBypassSecretConfigured : ${agentDevBypassSecretConfigured}`);

      // Deploy/Release Guard: fail if Shopify OAuth is not configured
      if (shopifyOAuthConfigured !== true) {
        throw new Error("Release Guard Failure: Deployed service Shopify OAuth is not configured!");
      }

      // Deploy/Release Guard: fail if firestore backend is requested but database is not configured
      if (repositoryBackend === "firestore" && firestoreDatabaseConfigured !== true) {
        throw new Error("Release Guard Failure: Repository backend is set to firestore, but Firestore database is not configured!");
      }

      // Dev bypass validations for smoke testing
      if (agentDevBypassAllowed !== true) {
        throw new Error("Release Guard Failure: Agent Dev Bypass is not allowed on the server!");
      }

      if (agentDevBypassSecretConfigured !== true) {
        throw new Error("Release Guard Failure: Agent Dev Bypass Secret is missing/unconfigured on the server!");
      }
    });

    // Dynamically start ephemeral local in-process server or configure Firestore seeding based on diagnosed backend
    if (isInMemory && isLocalBaseUrl) {
      console.log("   [SMOKE-TEST] Diagnosed local in-memory backend. Initializing in-process local server on ephemeral port...");
      const { app } = await import("../src/server/app.ts");
      await new Promise((resolve) => {
        localServerInstance = app.listen(0, "127.0.0.1", () => {
          const assignedPort = localServerInstance.address().port;
          console.log(`   [SMOKE-TEST] Ephemeral local server listening at http://127.0.0.1:${assignedPort}`);
          baseUrl = `http://127.0.0.1:${assignedPort}`;
          resolve();
        });
      });
      await seedInProcessDb();
      hasSeededFirestoreFixtures = true;
    } else if (!isInMemory) {
      const allowFirestoreSmokeFixtures = process.env.SOFTIFY_ALLOW_FIRESTORE_SMOKE_FIXTURES === "true";
      const isTestSandbox = shop.includes("yambasurf") || shop.includes("test") || shop.includes("sandbox") || process.env.NODE_ENV === "test";

      if (allowFirestoreSmokeFixtures && isTestSandbox) {
        console.log("   [SMOKE-TEST] Firestore environment diagnosed and guardrails passed. Seeding unique invalid proposed actions...");
        const uniqueSuffix = `-${Date.now()}`;
        uniqueSeoActionId = `test-invalid-seo-action${uniqueSuffix}`;
        uniqueCleanupActionId = `test-invalid-cleanup-action${uniqueSuffix}`;
        uniqueReadonlyActionId = `test-invalid-readonly-action${uniqueSuffix}`;

        const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
        const repos = getRepositories();

        await repos.proposedActions.createProposedAction({
          id: uniqueSeoActionId,
          organizationId: "demo-org-id",
          storeConnectionId: "store-yambasurf",
          agentRunId: "RUN-SEED-INVALID",
          agentId: "agent_product_seo",
          recommendationId: `REC-INVALID-SEO${uniqueSuffix}`,
          targetType: "PRODUCT",
          targetId: "101",
          title: "Test SEO Proposed Action with Invalid Fields",
          description: "Simulated invalid proposed action containing forbidden vendor fields for SEO",
          actionType: "simulated_action",
          riskLevel: "LOW",
          changes: { vendor: "SEO Proposed Vendor" },
          status: "DRAFT",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await repos.proposedActions.createProposedAction({
          id: uniqueCleanupActionId,
          organizationId: "demo-org-id",
          storeConnectionId: "store-yambasurf",
          agentRunId: "RUN-SEED-INVALID",
          agentId: "agent_catalog_cleanup",
          recommendationId: `REC-INVALID-CLEANUP${uniqueSuffix}`,
          targetType: "PRODUCT",
          targetId: "101",
          title: "Test Cleanup Proposed Action with Invalid Fields",
          description: "Simulated invalid proposed action containing forbidden title fields for Cleanup",
          actionType: "simulated_action",
          riskLevel: "LOW",
          changes: { title: "Cleanup Proposed Title" },
          status: "DRAFT",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        await repos.proposedActions.createProposedAction({
          id: uniqueReadonlyActionId,
          organizationId: "demo-org-id",
          storeConnectionId: "store-yambasurf",
          agentRunId: "RUN-SEED-INVALID",
          agentId: "agent_merchandising_insights",
          recommendationId: `REC-INVALID-READONLY${uniqueSuffix}`,
          targetType: "PRODUCT",
          targetId: "101",
          title: "Test Readonly Proposed Action",
          description: "Simulated invalid proposed action for read-only Merchandising Insights agent",
          actionType: "simulated_action",
          riskLevel: "LOW",
          changes: { title: "Readonly Proposed Title" },
          status: "DRAFT",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        hasSeededFirestoreFixtures = true;
      } else {
        console.warn("   [SMOKE-TEST] [WARNING] Deployed/Firestore environment detected, but SOFTIFY_ALLOW_FIRESTORE_SMOKE_FIXTURES is not true or shop is not a sandbox. Skipping invalid policy-violation bridge validations.");
      }
    }

  // Test A: OAuth Status validation
  await check("A. OAuth Status endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/shopify/oauth/status?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.configured !== true) {
      throw new Error(`Expected configured to be true, got: ${data.configured}`);
    }
    if (data.status === "REAUTH_REQUIRED") {
      throw new Error(`Smoke test failed: Connection status is REAUTH_REQUIRED. Re-authentication is required.`);
    }
    if (data.status === "MISSING_SCOPES") {
      throw new Error(`Smoke test failed: Connection status is MISSING_SCOPES. Missing scopes: ${JSON.stringify(data.missingScopes)}`);
    }
    if (data.connected !== true) {
      throw new Error(`Expected connected to be true, got: ${data.connected}`);
    }
    if (data.shop !== shop) {
      throw new Error(`Expected shop to be "${shop}", got: "${data.shop}"`);
    }
    if (!Array.isArray(data.scopes) || !data.scopes.includes("read_products")) {
      throw new Error(`Expected scopes to contain "read_products", got: ${JSON.stringify(data.scopes)}`);
    }
  });

  // Test B: Admin Shop Read validation
  await check("B. Admin Shop Read endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/shopify/admin/shop?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.shopDomain !== shop) {
      throw new Error(`Expected shopDomain to be "${shop}", got: "${data.shopDomain}"`);
    }
    if (!data.name) {
      throw new Error(`Expected shop name to exist, got: ${data.name}`);
    }
    if (!data.myshopifyDomain) {
      throw new Error(`Expected myshopifyDomain to exist, got: ${data.myshopifyDomain}`);
    }
    if (!data.currencyCode) {
      throw new Error(`Expected currencyCode to exist, got: ${data.currencyCode}`);
    }
    if (!Array.isArray(data.grantedScopes) || !data.grantedScopes.includes("read_products")) {
      throw new Error(`Expected grantedScopes to contain "read_products", got: ${JSON.stringify(data.grantedScopes)}`);
    }
  });

  // Test C: Products Read validation
  await check("C. Products Read endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/shopify/admin/products?shop=${encodeURIComponent(shop)}&limit=${defaultLimit}&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (!Array.isArray(data.products)) {
      throw new Error(`Expected products to be an array, got: ${typeof data.products}`);
    }
    if (!data.pageInfo) {
      throw new Error("Expected pageInfo to exist");
    }
    if (data.limit !== defaultLimit) {
      throw new Error(`Expected limit to be ${defaultLimit}, got: ${data.limit}`);
    }
    if (!Array.isArray(data.grantedScopes) || !data.grantedScopes.includes("read_products")) {
      throw new Error(`Expected grantedScopes to contain "read_products", got: ${JSON.stringify(data.grantedScopes)}`);
    }
  });

  // Test D: Products limit cap validation
  await check("D. Products limit cap validation (limit=500 -> 50)", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/shopify/admin/products?shop=${encodeURIComponent(shop)}&limit=500&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.limit !== 50) {
      throw new Error(`Expected limit to be capped at 50, got: ${data.limit}`);
    }
  });

  // Test E: Products invalid limit fallback validation
  await check("E. Products invalid limit fallback validation (limit=abc -> 20)", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/shopify/admin/products?shop=${encodeURIComponent(shop)}&limit=abc&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.limit !== 20) {
      throw new Error(`Expected limit to fallback to 20, got: ${data.limit}`);
    }
  });

  // Test F: Catalog product sync endpoint validation
  await check("F. Catalog product sync endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/catalog/products/sync?shop=${encodeURIComponent(shop)}&limit=5&t=${timestamp}`;
    const res = await fetch(url, { method: "POST" });
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (typeof data.count !== "number") {
      throw new Error(`Expected count to be a number, got: ${typeof data.count}`);
    }
    if (typeof data.latestSyncAt !== "string") {
      throw new Error(`Expected latestSyncAt to be a string, got: ${typeof data.latestSyncAt}`);
    }
  });

  // Test G: Catalog product status endpoint validation
  await check("G. Catalog product status endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/catalog/products/status?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (typeof data.count !== "number") {
      throw new Error(`Expected count to be a number, got: ${typeof data.count}`);
    }
    if (data.latestSyncAt !== null && typeof data.latestSyncAt !== "string") {
      throw new Error(`Expected latestSyncAt to be string or null, got: ${typeof data.latestSyncAt}`);
    }
  });

  // Test H: Catalog products read endpoint validation
  await check("H. Catalog products read endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/catalog/products?shop=${encodeURIComponent(shop)}&limit=5&t=${timestamp}`;
    const res = await fetch(url);
    await checkResponse(res);
    const list = await res.json();
    scanForForbiddenKeys(list);

    if (!Array.isArray(list)) {
      throw new Error(`Expected catalog products to be an array, got: ${typeof list}`);
    }

    for (const p of list) {
      if (typeof p.id !== "string") throw new Error("Expected product id to be a string");
      if (typeof p.shopDomain !== "string") throw new Error("Expected product shopDomain to be a string");
      if (typeof p.shopifyProductId !== "string") throw new Error("Expected product shopifyProductId to be a string");
      if (typeof p.title !== "string") throw new Error("Expected product title to be a string");
      if (typeof p.handle !== "string") throw new Error("Expected product handle to be a string");
      if (typeof p.status !== "string") throw new Error("Expected product status to be a string");
      if (!Array.isArray(p.tags)) throw new Error("Expected product tags to be an array");
      if (typeof p.variantsCount !== "number") throw new Error("Expected product variantsCount to be a number");
      if (typeof p.imagesCount !== "number") throw new Error("Expected product imagesCount to be a number");
      if (typeof p.createdAt !== "string") throw new Error("Expected product createdAt to be a string");
      if (typeof p.updatedAt !== "string") throw new Error("Expected product updatedAt to be a string");
      if (typeof p.syncedAt !== "string") throw new Error("Expected product syncedAt to be a string");
    }
  });

  // Test H.1: POST /api/agents/install
  await check("H.1. Agent Installation creation", async () => {
    const url = `${baseUrl}/api/agents/install`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health"
      })
    });
    
    await checkResponse(res);
    const data = await res.json();
    
    if (data.ok !== true || !data.installation) {
      throw new Error(`Failed to install agent: ${JSON.stringify(data)}`);
    }
    
    const inst = data.installation;
    if (inst.enabled !== true) {
      throw new Error(`Expected installation.enabled to be true, got: ${inst.enabled}`);
    }
    if (inst.shopDomain !== shop) {
      throw new Error(`Expected installation.shopDomain to be "${shop}", got: "${inst.shopDomain}"`);
    }
    if (inst.agentId !== "agent_catalog_health") {
      throw new Error(`Expected installation.agentId to be "agent_catalog_health", got: "${inst.agentId}"`);
    }
    
    // Verify allowedTools contains catalog.products.* and catalog.insights.* tools, and catalog.insights.health is present
    if (!Array.isArray(inst.allowedTools) || inst.allowedTools.length === 0) {
      throw new Error("Allowed tools list should not be empty");
    }
    if (!inst.allowedTools.includes("catalog.insights.health")) {
      throw new Error("Expected allowedTools to include 'catalog.insights.health'");
    }
    for (const tool of inst.allowedTools) {
      if (!tool.startsWith("catalog.products.") && !tool.startsWith("catalog.insights.") && tool !== "shopify.products.read") {
        throw new Error(`Agent allowedTools expanded beyond static limits: '${tool}'`);
      }
    }
    
    // Verify no token/secret fields are returned
    const forbidden = ["accessTokenEncrypted", "accessToken", "refreshToken", "apiKey", "secret", "password", "credentials", "authorization", "bearer"];
    for (const key of forbidden) {
      if (key in inst || key in data) {
        throw new Error(`Security Violation: Sensitive field '${key}' was exposed in the installation response.`);
      }
    }
  });

  // Test H.2: GET /api/agents/installations/status
  await check("H.2. Agent Installation status validation", async () => {
    const url = `${baseUrl}/api/agents/installations/status?shop=${encodeURIComponent(shop)}&agentId=agent_catalog_health`;
    const res = await fetch(url, {
      headers: {
        "X-Softify-Dev-Bypass": bypassSecret
      }
    });
    
    await checkResponse(res);
    const data = await res.json();
    
    if (data.ok !== true || data.installed !== true || data.enabled !== true) {
      throw new Error(`Expected installation status to be installed and enabled, got: ${JSON.stringify(data)}`);
    }
    
    if (!data.allowedTools.includes("catalog.insights.health")) {
      throw new Error("Expected allowedTools in status response to include 'catalog.insights.health'");
    }
    for (const tool of data.allowedTools) {
      if (!tool.startsWith("catalog.products.") && !tool.startsWith("catalog.insights.") && tool !== "shopify.products.read") {
        throw new Error(`Agent allowedTools expanded beyond static limits: '${tool}'`);
      }
    }
    
    const forbidden = ["accessTokenEncrypted", "accessToken", "refreshToken", "apiKey", "secret", "password", "credentials", "authorization", "bearer"];
    for (const key of forbidden) {
      if (key in data) {
        throw new Error(`Security Violation: Sensitive field '${key}' was exposed in the installation status response.`);
      }
    }
  });

  // Test H.5: Agent chat missing bypass header negative validation
  await check("H.5. Agent chat missing bypass header negative validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health",
        message: "How many products are synced?"
      })
    });

    if (res.status !== 401) {
      throw new Error(`Expected HTTP status 401, got: ${res.status}`);
    }
    const data = await res.json();
    if (data.ok !== false || data.code !== "UNAUTHORIZED") {
      throw new Error(`Expected ok === false and code === "UNAUTHORIZED", got: ${JSON.stringify(data)}`);
    }
    scanForForbiddenKeys(data);
  });

  // Test I: Agent chat product summary validation
  await check("I. Agent chat product summary validation", async () => {
    const timestamp = Date.now();

    // Pre-install agent_product_intelligence so it doesn't fail with AGENT_NOT_INSTALLED
    const installRes = await fetch(`${baseUrl}/api/agents/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_product_intelligence"
      })
    });
    await checkResponse(installRes);

    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_product_intelligence",
        message: "How many products are synced?"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    if (data.provider !== "mock") {
      throw new Error(`Expected provider to be "mock", got: ${data.provider}`);
    }
    if (!data.message || typeof data.message !== "string") {
      throw new Error("Expected final message string to exist.");
    }
    if (!Array.isArray(data.toolCalls) || data.toolCalls.length === 0) {
      throw new Error("Expected toolCalls list to contain catalog tool execution.");
    }
    
    const summaryCall = data.toolCalls.find(t => t.toolName === "catalog.products.summary");
    if (!summaryCall) {
      throw new Error(`Expected catalog.products.summary tool call, got: ${JSON.stringify(data.toolCalls)}`);
    }
  });

  // Test I.1: Agent chat catalog health validation
  await check("I.1. Agent chat catalog health validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health",
        message: "What is the health of my catalog?"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    if (data.provider !== "mock") {
      throw new Error(`Expected provider to be "mock", got: ${data.provider}`);
    }
    if (!data.message || typeof data.message !== "string") {
      throw new Error("Expected final message string to exist.");
    }
    if (!Array.isArray(data.toolCalls) || data.toolCalls.length === 0) {
      throw new Error("Expected toolCalls list to contain catalog tool execution.");
    }
    
    const healthCall = data.toolCalls.find(t => t.toolName === "catalog.insights.health");
    if (!healthCall) {
      throw new Error(`Expected catalog.insights.health tool call, got: ${JSON.stringify(data.toolCalls)}`);
    }
    if (!data.message.toLowerCase().includes("health score")) {
      throw new Error(`Expected health score details in response message, got: "${data.message}"`);
    }
  });

  // Test I.2: Agent chat products missing images validation
  await check("I.2. Agent chat products missing images validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health",
        message: "Which products are missing images?"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    if (data.provider !== "mock") {
      throw new Error(`Expected provider to be "mock", got: ${data.provider}`);
    }
    if (!data.message || typeof data.message !== "string") {
      throw new Error("Expected final message string to exist.");
    }
    if (!Array.isArray(data.toolCalls) || data.toolCalls.length === 0) {
      throw new Error("Expected toolCalls list to contain catalog tool execution.");
    }
    
    const missingCall = data.toolCalls.find(t => t.toolName === "catalog.insights.missing_images");
    if (!missingCall) {
      throw new Error(`Expected catalog.insights.missing_images tool call, got: ${JSON.stringify(data.toolCalls)}`);
    }
    if (!data.message.toLowerCase().includes("missing images")) {
      throw new Error(`Expected missing images details in response message, got: "${data.message}"`);
    }
  });

  // Test I.3: Agent chat top vendors summary validation
  await check("I.3. Agent chat top vendors summary validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_product_intelligence",
        message: "Show me the top vendors"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    if (data.provider !== "mock") {
      throw new Error(`Expected provider to be "mock", got: ${data.provider}`);
    }
    if (!data.message || typeof data.message !== "string") {
      throw new Error("Expected final message string to exist.");
    }
    if (!Array.isArray(data.toolCalls) || data.toolCalls.length === 0) {
      throw new Error("Expected toolCalls list to contain catalog tool execution.");
    }
    
    const vendorCall = data.toolCalls.find(t => t.toolName === "catalog.insights.vendor_summary");
    if (!vendorCall) {
      throw new Error(`Expected catalog.insights.vendor_summary tool call, got: ${JSON.stringify(data.toolCalls)}`);
    }
    if (!data.message.toLowerCase().includes("top vendors")) {
      throw new Error(`Expected top vendors details in response message, got: "${data.message}"`);
    }
  });

  // Test J: Agent chat missing write access validation
  await check("J. Agent chat missing write access validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health",
        message: "Update all product titles"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    if (data.provider !== "mock") {
      throw new Error(`Expected provider to be "mock", got: ${data.provider}`);
    }
    const lowerMsg = data.message.toLowerCase();
    if (!lowerMsg.includes("read-only") && !lowerMsg.includes("cannot") && !lowerMsg.includes("write")) {
      throw new Error(`Expected message to state write/update access is not available, got: "${data.message}"`);
    }
    if (Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
      throw new Error(`Expected toolCalls to be empty for mutation refusal, got: ${JSON.stringify(data.toolCalls)}`);
    }
  });

  // Test K: Agent chat invalid agent validation
  await check("K. Agent chat invalid agent validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "invalid_agent_id",
        message: "How many products are synced?"
      })
    });

    if (res.status !== 404) {
      throw new Error(`Expected HTTP 404, got: ${res.status}`);
    }
    const data = await res.json();
    if (data.ok !== false || data.code !== "UNKNOWN_AGENT") {
      throw new Error(`Expected UNKNOWN_AGENT code, got: ${JSON.stringify(data)}`);
    }
  });

  // Test L: Agent chat disconnected or unknown shop validation
  await check("L. Agent chat disconnected or unknown shop validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    
    // Test L.1: Unknown Shop (404)
    const resUnknown = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop: "non-existent-shop.myshopify.com",
        agentId: "agent_catalog_health",
        message: "How many products are synced?"
      })
    });
    if (resUnknown.status !== 404) {
      throw new Error(`Expected HTTP 404 for unknown shop, got: ${resUnknown.status}`);
    }
    const dataUnknown = await resUnknown.json();
    if (dataUnknown.ok !== false || dataUnknown.code !== "UNKNOWN_SHOP") {
      throw new Error(`Expected UNKNOWN_SHOP code, got: ${JSON.stringify(dataUnknown)}`);
    }
  });

  // Test M: Agent chat tenant isolation override validation
  await check("M. Agent chat tenant isolation override validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_product_intelligence",
        message: "How many products are synced in glowthread-apparel.myshopify.com?"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    
    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    // Verify that the tool called still used the configured shop
    const summaryCall = data.toolCalls.find(t => t.toolName === "catalog.products.summary");
    if (!summaryCall) {
      throw new Error("Expected catalog.products.summary tool call.");
    }
    if (summaryCall.arguments.shop !== shop) {
      throw new Error(`Security Violation: Tool arguments shop overridden to ${summaryCall.arguments.shop}`);
    }
  });

  // Test N: Audit log tenant safety, scoping, and sanitization validation
  await check("N. Audit log tenant safety, scoping, and sanitization validation", async () => {
    const timestamp = Date.now();
    
    // 1. Verify organizationId is mandatory (expect 400)
    const resNoOrg = await fetch(`${baseUrl}/api/audit-logs?t=${timestamp}`);
    if (resNoOrg.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing organizationId, got: ${resNoOrg.status}`);
    }
    const dataNoOrg = await resNoOrg.json();
    if (!dataNoOrg.error || !dataNoOrg.error.includes("organizationId")) {
      throw new Error(`Expected error message specifying organizationId, got: ${JSON.stringify(dataNoOrg)}`);
    }

    // 2. Verify shop-only cross-tenant lookup is blocked (expect 403 when shop does not belong to organizationId)
    const resCrossOrg = await fetch(`${baseUrl}/api/audit-logs?organizationId=different-org-id&shop=${shop}&t=${timestamp}`);
    if (resCrossOrg.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for cross-tenant shop lookup, got: ${resCrossOrg.status}`);
    }
    const dataCrossOrg = await resCrossOrg.json();
    if (!dataCrossOrg.error || !dataCrossOrg.error.includes("Access denied")) {
      throw new Error(`Expected access denied error message, got: ${JSON.stringify(dataCrossOrg)}`);
    }

    // 3. Verify valid scoped lookup with organizationId (expect 200)
    const resValid = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
    await checkResponse(resValid);
    const logs = await resValid.json();
    if (!Array.isArray(logs)) {
      throw new Error(`Expected audit logs to be an array, got: ${typeof logs}`);
    }

    // 4. Verify sanitization and security of returned logs (no raw credentials, bypass secrets, or raw tool inputs)
    for (const log of logs) {
      scanForForbiddenKeys(log);

      // Verify that metadata is sanitized if it contains tool invocation data
      if (log.metadata) {
        if (log.metadata.message) {
          throw new Error("Security Violation: Raw message text leaked in audit log metadata.");
        }
        if (log.metadata.args) {
          throw new Error("Security Violation: Raw tool arguments leaked in audit log metadata.");
        }
        if (log.metadata.result) {
          throw new Error("Security Violation: Raw tool results leaked in audit log metadata.");
        }
      }

      // Check critical event constraints (organizationId must be mandatory)
      if (log.event === "AGENT_CHAT_REQUEST" || log.event === "GATEWAY_TOOL_EXECUTION") {
        if (!log.organizationId) {
          throw new Error("Violation: organizationId must be mandatory in critical events.");
        }
        if (log.metadata && log.metadata.decision && !["allowed", "blocked", "completed", "failed"].includes(log.metadata.decision)) {
          throw new Error(`Violation: decision must use the typed AuditDecision enum, got: ${log.metadata.decision}`);
        }
      }
    }

    console.log(`   [AUDIT TESTS] Retrieved ${logs.length} sanitized audit events successfully.`);
  });

  // Test O: Merchant Approvals & Mutation Tools Foundation validation
  await check("O. Merchant Approvals & Mutation Tools Foundation validation", async () => {
    const timestamp = Date.now();
    const chatUrl = `${baseUrl}/api/agents/chat?t=${timestamp}`;

    // 1. Trigger the mutation tool by posting a simulated chat query
    const resChat = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health",
        message: "simulate tool catalog.products.propose_update"
      })
    });

    await checkResponse(resChat);
    const chatData = await resChat.json();
    if (chatData.ok !== true) {
      throw new Error(`Expected chat query to succeed, got: ${JSON.stringify(chatData)}`);
    }

    // 2. Fetch the approvals list strictly for our organization (expect 200)
    const approvalsUrl = `${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`;
    const resApprovals = await fetch(approvalsUrl);
    await checkResponse(resApprovals);
    const approvals = await resApprovals.json();

    if (!Array.isArray(approvals)) {
      throw new Error(`Expected approvals to be an array, got: ${typeof approvals}`);
    }

    // Find the newly created PENDING approval request for catalog.products.propose_update
    const pendingApproval = approvals.find(
      a => a.status === "PENDING" && a.toolName === "catalog.products.propose_update"
    );
    if (!pendingApproval) {
      throw new Error("Expected to find a PENDING approval request for catalog.products.propose_update.");
    }

    if (pendingApproval.riskLevel !== "Medium") {
      throw new Error(`Expected riskLevel to be Medium, got: ${pendingApproval.riskLevel}`);
    }

    const approvalId = pendingApproval.id;

    // 3. Verify approvals list tenant scoping and rejections
    // GET without organizationId (expect 400)
    const resNoOrg = await fetch(`${baseUrl}/api/approvals?t=${timestamp}`);
    if (resNoOrg.status !== 400) {
      throw new Error(`Expected HTTP 400 for GET approvals without organizationId, got: ${resNoOrg.status}`);
    }

    // GET with mismatched store connection cross-tenant check (expect 403)
    const resCrossOrg = await fetch(`${baseUrl}/api/approvals?organizationId=different-org-id&shop=${shop}&t=${timestamp}`);
    if (resCrossOrg.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for cross-tenant GET approvals, got: ${resCrossOrg.status}`);
    }

    // 4. Verify decision tenant isolation (POST decide with wrong organizationId expect 403)
    const decideUrl = `${baseUrl}/api/approvals/${approvalId}/decide?t=${timestamp}`;
    const resDecideWrong = await fetch(decideUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVE",
        organizationId: "different-org-id"
      })
    });
    if (resDecideWrong.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for cross-tenant POST decide, got: ${resDecideWrong.status}`);
    }

    // 5. Approve the request (expect 200 and state APPROVED only, execution deferred)
    const resDecideRight = await fetch(decideUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVE",
        organizationId: "demo-org-id"
      })
    });
    await checkResponse(resDecideRight);
    const decideResult = await resDecideRight.json();
    if (decideResult.status !== "APPROVED") {
      throw new Error(`Expected decision status to be APPROVED, got: ${decideResult.status}`);
    }
    if (decideResult.executionDeferred !== true) {
      throw new Error("Expected executionDeferred flag to be true in Phase 10.6.");
    }

    // 6. Verify that no mock catalog changes were committed (mutation containment)
    const resProducts = await fetch(`${baseUrl}/api/catalog/products?shop=${shop}&t=${timestamp}`);
    await checkResponse(resProducts);
    const products = await resProducts.json();
    const targetProduct = products.find(p => String(p.shopifyProductId || p.id) === "101");
    if (!targetProduct) {
      throw new Error("Expected to find product 101 in catalog.");
    }
    if (targetProduct.title === "Super Polished Tee") {
      throw new Error("Security Violation: catalog mutation must not execute or change state in Phase 10.6.");
    }

    // 7. Verify audit logs trail for APPROVAL_CREATED and APPROVAL_APPROVED
    const resAudits = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
    await checkResponse(resAudits);
    const audits = await resAudits.json();

    const createdEvent = audits.find(a => a.event === "APPROVAL_CREATED" && a.metadata?.approvalId === approvalId);
    const approvedEvent = audits.find(a => a.event === "APPROVAL_APPROVED" && a.metadata?.approvalId === approvalId);
    const appliedEvent = audits.find(a => a.event === "APPROVAL_APPLIED" && a.metadata?.approvalId === approvalId);

    if (!createdEvent) throw new Error("Missing APPROVAL_CREATED audit log event.");
    if (!approvedEvent) throw new Error("Missing APPROVAL_APPROVED audit log event.");

    // Check zero-PII/security constraints on approvals
    scanForForbiddenKeys(pendingApproval);

    console.log(`   [APPROVAL TESTS] Successfully intercepted proposal tool catalog.products.propose_update, validated sanitized containment shapes, verified zero mutation execution, and confirmed deferred execution approvals.`);
  });

  // Test P: Safe Approved Product Mutation Execution validation
  await check("P. Safe Approved Product Mutation Execution validation", async () => {
    const timestamp = Date.now();
    const enableLiveWriteSmoke = process.env.SOFTIFY_ENABLE_LIVE_WRITE_SMOKE === "true";
    const expectAppliedSuccess = isInMemory || enableLiveWriteSmoke;
    
    // 1. Fetch approvals list
    const approvalsUrl = `${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`;
    const resApprovals = await fetch(approvalsUrl);
    await checkResponse(resApprovals);
    const approvals = await resApprovals.json();
    
    // Find the APPROVED approval request we created and approved in Test O
    const approvedApproval = approvals.find(
      a => a.status === "APPROVED" && a.toolName === "catalog.products.propose_update"
    );
    if (!approvedApproval) {
      throw new Error("Expected to find an APPROVED approval request for catalog.products.propose_update.");
    }
    
    const approvalId = approvedApproval.id;
    const execUrl = `${baseUrl}/api/approvals/${approvalId}/execute?t=${timestamp}`;

    // 2. Tenant isolation rejections (execute with wrong organizationId expect 403)
    const resExecWrongOrg = await fetch(execUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "different-org-id"
      })
    });
    if (resExecWrongOrg.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for cross-tenant execution, got: ${resExecWrongOrg.status}`);
    }

    // 3. Mandatory store parameter mismatch validations (provided wrong shop expect 400)
    const resExecWrongShop = await fetch(execUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "demo-org-id",
        shop: "different-shop.myshopify.com"
      })
    });
    if (resExecWrongShop.status !== 400) {
      throw new Error(`Expected HTTP 400 Bad Request for mismatched shop execution, got: ${resExecWrongShop.status}`);
    }

    if (expectAppliedSuccess) {
      // 4. Successful execution (expect 200 and status APPLIED)
      const resExecRight = await fetch(execUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "demo-org-id",
          shop
        })
      });
      await checkResponse(resExecRight);
      const execResult = await resExecRight.json();
      if (execResult.ok !== true || execResult.approval?.status !== "APPLIED") {
        throw new Error(`Expected execution success with APPLIED status, got: ${JSON.stringify(execResult)}`);
      }

      // 5. Concurrency/Idempotency validation (attempt to re-execute already APPLIED approval expect 400)
      const resExecDouble = await fetch(execUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "demo-org-id",
          shop
        })
      });
      if (resExecDouble.status !== 400) {
        throw new Error(`Expected HTTP 400 for duplicate execution attempt, got: ${resExecDouble.status}`);
      }
      const doubleResult = await resExecDouble.json();
      if (!doubleResult.error || !doubleResult.error.includes("finalized") && !doubleResult.error.includes("state")) {
        throw new Error(`Expected state/finalized error for duplicate execution, got: ${JSON.stringify(doubleResult)}`);
      }

      // 6. Verify mutation changes did update catalog and audit logs
      const resAudits = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resAudits);
      const audits = await resAudits.json();

      const startedEvent = audits.find(a => a.event === "APPROVAL_EXECUTION_STARTED" && a.metadata?.approvalId === approvalId);
      const appliedEvent = audits.find(a => a.event === "APPROVAL_APPLIED" && a.metadata?.approvalId === approvalId);

      if (!startedEvent) throw new Error("Missing APPROVAL_EXECUTION_STARTED audit log event.");
      if (!appliedEvent) throw new Error("Missing APPROVAL_APPLIED audit log event.");
      
      console.log("   [EXECUTION TESTS] Verified successful execution, tenant rejections, claim locks, and audit events.");
    } else {
      // Deployed default: safe read-only behavior (the store connection is missing write_products)
      // 4. Call execute and expect HTTP 400 (safe block due to missing write_products)
      const resExecRight = await fetch(execUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "demo-org-id",
          shop
        })
      });
      if (resExecRight.status !== 400) {
        throw new Error(`Expected HTTP 400 Bad Request for execution with missing write scope in deployed env, got: ${resExecRight.status}`);
      }
      const execResult = await resExecRight.json();
      if (!execResult.error || !execResult.error.toLowerCase().includes("write_products")) {
        throw new Error(`Expected write_products scope rejection error, got: ${JSON.stringify(execResult)}`);
      }

      // 5. Verify approval request remains APPROVED (non-destructive status preservation)
      const resApprovalsAfter = await fetch(`${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resApprovalsAfter);
      const approvalsAfter = await resApprovalsAfter.json();
      const checkedApproval = approvalsAfter.find(a => a.id === approvalId);
      if (!checkedApproval || checkedApproval.status !== "APPROVED") {
        throw new Error(`Expected approval status to remain APPROVED in read-only environment, got: ${checkedApproval?.status}`);
      }

      // 6. Verify APPROVAL_EXECUTION_BLOCKED audit event exists and no APPLIED state is reached
      const resAudits = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resAudits);
      const audits = await resAudits.json();

      const blockedEvent = audits.find(
        a => a.event === "APPROVAL_EXECUTION_BLOCKED" && a.metadata?.approvalId === approvalId && a.metadata?.reason === "missing_write_products_scope"
      );
      const appliedEvent = audits.find(
        a => a.event === "APPROVAL_APPLIED" && a.metadata?.approvalId === approvalId
      );

      if (!blockedEvent) {
        throw new Error("Missing APPROVAL_EXECUTION_BLOCKED audit log event.");
      }
      if (appliedEvent) {
        throw new Error("Security Violation: APPROVAL_APPLIED audit event exists for write-blocked connection.");
      }

      console.log("   [EXECUTION TESTS] Verified safe read-only execution block, non-destructive APPROVED status preservation, and audit logging in deployed env.");
    }

    // 7. Verify missing write_products hardening checks dynamically inside local/in-memory environment
    if (isInMemory) {
      const mismatchShop = "scope-mismatch.myshopify.com";
      
      // Install agent on scope-mismatch connection
      const resInstallMismatch = await fetch(`${baseUrl}/api/agents/install`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Softify-Dev-Bypass": bypassSecret
        },
        body: JSON.stringify({
          shop: mismatchShop,
          agentId: "agent_catalog_health"
        })
      });
      await checkResponse(resInstallMismatch);

      // Trigger proposal creation on scope-mismatch
      const resChatMismatch = await fetch(`${baseUrl}/api/agents/chat?t=${timestamp}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Softify-Dev-Bypass": bypassSecret
        },
        body: JSON.stringify({
          shop: mismatchShop,
          agentId: "agent_catalog_health",
          message: "simulate tool catalog.products.propose_update"
        })
      });
      await checkResponse(resChatMismatch);

      // Fetch approvals and find mismatch approval
      const resApprovalsMismatch = await fetch(`${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resApprovalsMismatch);
      const approvalsMismatch = await resApprovalsMismatch.json();
      const pendingMismatch = approvalsMismatch.find(
        a => a.status === "PENDING" && a.toolName === "catalog.products.propose_update" && a.storeConnectionId === "store-scope-mismatch"
      );
      if (!pendingMismatch) {
        throw new Error("Expected to find a PENDING approval request for scope-mismatch connection.");
      }
      const mismatchApprovalId = pendingMismatch.id;

      // Approve the request
      const resDecideMismatch = await fetch(`${baseUrl}/api/approvals/${mismatchApprovalId}/decide?t=${timestamp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          organizationId: "demo-org-id"
        })
      });
      await checkResponse(resDecideMismatch);

      // Attempt execution (expect failure due to missing write_products scope)
      const resExecMismatch = await fetch(`${baseUrl}/api/approvals/${mismatchApprovalId}/execute?t=${timestamp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "demo-org-id",
          shop: mismatchShop
        })
      });
      if (resExecMismatch.status !== 400) {
        throw new Error(`Expected HTTP 400 Bad Request for missing write scope execution, got: ${resExecMismatch.status}`);
      }
      const mismatchExecData = await resExecMismatch.json();
      if (!mismatchExecData.error || !mismatchExecData.error.toLowerCase().includes("write_products")) {
        throw new Error(`Expected write_products error message, got: ${JSON.stringify(mismatchExecData)}`);
      }

      // Verify approval request remains APPROVED
      const resApprovalsMismatchAfter = await fetch(`${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resApprovalsMismatchAfter);
      const approvalsMismatchAfter = await resApprovalsMismatchAfter.json();
      const checkedMismatch = approvalsMismatchAfter.find(a => a.id === mismatchApprovalId);
      if (!checkedMismatch || checkedMismatch.status !== "APPROVED") {
        throw new Error(`Expected approval status to remain APPROVED, got: ${checkedMismatch?.status}`);
      }

      // Verify APPROVAL_EXECUTION_BLOCKED audit event exists
      const resAuditsMismatch = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resAuditsMismatch);
      const auditsMismatch = await resAuditsMismatch.json();
      const blockedEvent = auditsMismatch.find(
        a => a.event === "APPROVAL_EXECUTION_BLOCKED" && a.metadata?.approvalId === mismatchApprovalId && a.metadata?.reason === "missing_write_products_scope"
      );
      if (!blockedEvent) {
        throw new Error("Expected to find APPROVAL_EXECUTION_BLOCKED audit log event with reason missing_write_products_scope.");
      }

      // Verify no APPLIED state is reached for this request
      const appliedEventMismatch = auditsMismatch.find(
        a => a.event === "APPROVAL_APPLIED" && a.metadata?.approvalId === mismatchApprovalId
      );
      if (appliedEventMismatch) {
        throw new Error("Security Violation: APPROVAL_APPLIED audit event exists for scope-mismatch connection.");
      }

      console.log("   [EXECUTION TESTS] Verified local scope-mismatch rejections and safe APPROVED preservation.");
    }
  });

  // Test Q: Approval Execution Operations & Recovery validation
  await check("Q. Approval Execution Operations & Recovery validation", async () => {
    const timestamp = Date.now();

    // 1. Filter approvals list by status (expect PENDING only or APPROVED only)
    const listPendingUrl = `${baseUrl}/api/approvals?organizationId=demo-org-id&status=PENDING&t=${timestamp}`;
    const resListPending = await fetch(listPendingUrl);
    await checkResponse(resListPending);
    const pendingList = await resListPending.json();
    for (const a of pendingList) {
      if (a.status !== "PENDING") {
        throw new Error(`Expected only PENDING approvals, got status: ${a.status}`);
      }
    }

    // Negative filter check (invalid status parameter returns HTTP 400)
    const listInvalidUrl = `${baseUrl}/api/approvals?organizationId=demo-org-id&status=INVALID_STATUS&t=${timestamp}`;
    const resListInvalid = await fetch(listInvalidUrl);
    if (resListInvalid.status !== 400) {
      throw new Error(`Expected HTTP 400 for invalid status filter, got: ${resListInvalid.status}`);
    }

    // 2. Fetch specific approval detail via GET /api/approvals/:id
    // First, let's find the APPROVED approval request we have
    const approvalsUrl = `${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`;
    const resApprovals = await fetch(approvalsUrl);
    await checkResponse(resApprovals);
    const approvals = await resApprovals.json();
    const approvedApproval = approvals.find(a => a.status === "APPROVED");
    if (!approvedApproval) {
      throw new Error("Expected to find an APPROVED approval request for testing detail endpoint.");
    }
    const approvalId = approvedApproval.id;

    const detailUrl = `${baseUrl}/api/approvals/${approvalId}?organizationId=demo-org-id&t=${timestamp}`;
    const resDetail = await fetch(detailUrl);
    await checkResponse(resDetail);
    const detail = await resDetail.json();
    
    if (detail.ok !== true || !detail.approval) {
      throw new Error(`Expected detailed operational response format, got: ${JSON.stringify(detail)}`);
    }
    
    // Check that legacy fields are NOT returned
    const legacyKeys = ["actionType", "beforeState", "afterState", "diff", "details"];
    for (const key of legacyKeys) {
      if (key in detail.approval) {
        throw new Error(`Security/Legacy Violation: Found forbidden legacy key "${key}" in operational details.`);
      }
    }

    // Check tenant boundary for details (wrong organizationId expect 403)
    const detailWrongOrgUrl = `${baseUrl}/api/approvals/${approvalId}?organizationId=different-org-id&t=${timestamp}`;
    const resDetailWrong = await fetch(detailWrongOrgUrl);
    if (resDetailWrong.status !== 403) {
      throw new Error(`Expected HTTP 403 for cross-tenant details, got: ${resDetailWrong.status}`);
    }

    // 3. GET /api/approvals/:id/audit (verify audit log filtering and logging)
    const auditUrl = `${baseUrl}/api/approvals/${approvalId}/audit?organizationId=demo-org-id&t=${timestamp}`;
    const resAudit = await fetch(auditUrl);
    await checkResponse(resAudit);
    const auditEvents = await resAudit.json();
    if (!Array.isArray(auditEvents)) {
      throw new Error("Expected audit events to be an array.");
    }
    for (const event of auditEvents) {
      if (event.metadata?.approvalId !== approvalId) {
        throw new Error(`Audit correlation failure: event does not belong to approval ${approvalId}. Metadata: ${JSON.stringify(event.metadata)}`);
      }
    }

    // Check tenant boundary for audit (wrong organizationId expect 403)
    const auditWrongOrgUrl = `${baseUrl}/api/approvals/${approvalId}/audit?organizationId=different-org-id&t=${timestamp}`;
    const resAuditWrong = await fetch(auditWrongOrgUrl);
    if (resAuditWrong.status !== 403) {
      throw new Error(`Expected HTTP 403 for cross-tenant audit, got: ${resAuditWrong.status}`);
    }

    // 4. POST /api/approvals/:id/reset-failed
    // First, let's create a FAILED approval to test resetting.
    // When isInMemory is true, we can test stuck timeout and recovery reset.
    if (isInMemory) {
      // stuck-executing-approval is pre-seeded with status "EXECUTING" and 30m old executionStartedAt
      const stuckId = "stuck-executing-approval";

      // Rejects recovery if performedBy/actor is missing
      const resStuckNoActor = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id" })
      });
      if (resStuckNoActor.status !== 400) {
        throw new Error(`Expected HTTP 400 for missing recovery performer, got: ${resStuckNoActor.status}`);
      }

      // Rejects recovery if actor is empty after trim
      const resStuckEmptyActor = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "   " })
      });
      if (resStuckEmptyActor.status !== 400) {
        throw new Error(`Expected HTTP 400 for empty actor, got: ${resStuckEmptyActor.status}`);
      }

      // Rejects recovery if actor is too long (> 100 chars)
      const resStuckTooLongActor = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "a".repeat(101) })
      });
      if (resStuckTooLongActor.status !== 400) {
        throw new Error(`Expected HTTP 400 for actor > 100 chars, got: ${resStuckTooLongActor.status}`);
      }

      // Rejects recovery if actor is "system" (case-insensitive)
      const resStuckSystemActor = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "sYsTeM" })
      });
      if (resStuckSystemActor.status !== 400) {
        throw new Error(`Expected HTTP 400 for system performer, got: ${resStuckSystemActor.status}`);
      }

      // Rejects recovery if reason is invalid (non-string)
      const resStuckNonStringReason = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner", reason: 12345 })
      });
      if (resStuckNonStringReason.status !== 400) {
        throw new Error(`Expected HTTP 400 for non-string reason, got: ${resStuckNonStringReason.status}`);
      }

      // Rejects recovery if reason is not allowlisted
      const resStuckInvalidReason = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner", reason: "arbitrary_reason" })
      });
      if (resStuckInvalidReason.status !== 400) {
        throw new Error(`Expected HTTP 400 for non-allowlisted reason, got: ${resStuckInvalidReason.status}`);
      }

      // Rejects stuck recovery on non-stuck approval
      const activeId = "active-executing-approval";
      const resActiveStuck = await fetch(`${baseUrl}/api/approvals/${activeId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner" })
      });
      if (resActiveStuck.status !== 400) {
        throw new Error(`Expected HTTP 400 for non-stuck execution marking, got: ${resActiveStuck.status}`);
      }

      // Rejects stuck recovery on cross-tenant storeConnectionId mismatch
      const resStuckMismatch = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner", storeConnectionId: "store-mismatch" })
      });
      if (resStuckMismatch.status !== 400) {
        throw new Error(`Expected HTTP 400 for storeConnectionId mismatch, got: ${resStuckMismatch.status}`);
      }

      // Recovers stuck execution to FAILED status
      const resStuckSuccess = await fetch(`${baseUrl}/api/approvals/${stuckId}/mark-execution-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner", reason: "execution_timeout" })
      });
      await checkResponse(resStuckSuccess);
      const stuckRes = await resStuckSuccess.json();
      if (stuckRes.approval?.status !== "FAILED" || stuckRes.approval?.lastFailureCode !== "EXECUTION_TIMEOUT") {
        throw new Error(`Expected transition to FAILED due to timeout, got: ${JSON.stringify(stuckRes)}`);
      }

      // Verify that the mark-execution-failed response does not contain legacy keys
      const legacyKeys = ["actionType", "beforeState", "afterState", "diff", "details"];
      for (const key of legacyKeys) {
        if (key in stuckRes.approval) {
          throw new Error(`Security/Legacy Violation: Found forbidden legacy key "${key}" in mark execution failed response.`);
        }
      }

      // Verify APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED audit exists
      const resStuckAudit = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resStuckAudit);
      const stuckAudits = await resStuckAudit.json();
      const timeoutEvent = stuckAudits.find(
        a => a.event === "APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED" && a.metadata?.approvalId === stuckId
      );
      if (!timeoutEvent) {
        console.log("DEBUG stuckAudits length:", stuckAudits.length);
        console.log("DEBUG MATCHED EVENTS:", JSON.stringify(stuckAudits.filter(a => a.event === "APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED"), null, 2));
        throw new Error("Missing APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED audit log event.");
      }

      // Rejects reset-failed on non-FAILED approval (e.g. APPROVED request)
      const resResetApproved = await fetch(`${baseUrl}/api/approvals/${approvalId}/reset-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner" })
      });
      if (resResetApproved.status !== 400) {
        throw new Error(`Expected HTTP 400 for resetting non-failed request, got: ${resResetApproved.status}`);
      }

      // Resets FAILED approval to APPROVED
      const resResetSuccess = await fetch(`${baseUrl}/api/approvals/${stuckId}/reset-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "demo-org-id", performedBy: "Shop Owner" })
      });
      await checkResponse(resResetSuccess);
      const resetRes = await resResetSuccess.json();
      if (resetRes.approval?.status !== "APPROVED" || resetRes.approval?.lastExecutionStatus !== "FAILED") {
        throw new Error(`Expected transition to APPROVED state, got: ${JSON.stringify(resetRes)}`);
      }

      // Verify that the reset failed response does not contain legacy keys
      for (const key of legacyKeys) {
        if (key in resetRes.approval) {
          throw new Error(`Security/Legacy Violation: Found forbidden legacy key "${key}" in reset failed response.`);
        }
      }

      // Verify APPROVAL_RECOVERY_RESET audit exists
      const resResetAudit = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resResetAudit);
      const resetAudits = await resResetAudit.json();
      const resetEvent = resetAudits.find(
        a => a.event === "APPROVAL_RECOVERY_RESET" && a.metadata?.approvalId === stuckId
      );
      if (!resetEvent) {
        throw new Error("Missing APPROVAL_RECOVERY_RESET audit log event.");
      }

      console.log("   [RECOVERY TESTS] Successfully verified status filters, details/audit tenant scoping, performer constraints, timeout recoveries, and state reset bounds.");
    }
  });

  // Test R: Embedded Admin Tenant Context Regression Fix validation
  await check("R. Embedded Admin Tenant Context Regression Fix validation", async () => {
    const timestamp = Date.now();

    // 1. GET /api/approvals?shop=... should return 200
    const approvalsShopUrl = `${baseUrl}/api/approvals?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resApprovalsShop = await fetch(approvalsShopUrl);
    await checkResponse(resApprovalsShop);
    const approvalsList = await resApprovalsShop.json();
    if (!Array.isArray(approvalsList)) {
      throw new Error("Expected approvals list to be an array.");
    }

    // 2. GET /api/audit-logs?shop=... should return 200
    const auditShopUrl = `${baseUrl}/api/audit-logs?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resAuditShop = await fetch(auditShopUrl);
    await checkResponse(resAuditShop);
    const auditList = await resAuditShop.json();
    if (!Array.isArray(auditList)) {
      throw new Error("Expected audit-logs list to be an array.");
    }

    // 3. GET /api/approvals without organizationId and without shop should return 400
    const resApprovalsEmpty = await fetch(`${baseUrl}/api/approvals?t=${timestamp}`);
    if (resApprovalsEmpty.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing context, got: ${resApprovalsEmpty.status}`);
    }

    // 4. GET /api/audit-logs without organizationId and without shop should return 400
    const resAuditEmpty = await fetch(`${baseUrl}/api/audit-logs?t=${timestamp}`);
    if (resAuditEmpty.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing context, got: ${resAuditEmpty.status}`);
    }

    // 5. GET /api/approvals with mismatched organizationId and shop should return 403
    const approvalsMismatchUrl = `${baseUrl}/api/approvals?shop=${encodeURIComponent(shop)}&organizationId=mismatch-org-999&t=${timestamp}`;
    const resApprovalsMismatch = await fetch(approvalsMismatchUrl);
    if (resApprovalsMismatch.status !== 403) {
      throw new Error(`Expected HTTP 403 for mismatched tenant context, got: ${resApprovalsMismatch.status}`);
    }

    // 6. GET /api/audit-logs with mismatched organizationId and shop should return 403
    const auditMismatchUrl = `${baseUrl}/api/audit-logs?shop=${encodeURIComponent(shop)}&organizationId=mismatch-org-999&t=${timestamp}`;
    const resAuditMismatch = await fetch(auditMismatchUrl);
    if (resAuditMismatch.status !== 403) {
      throw new Error(`Expected HTTP 403 for mismatched tenant context, got: ${resAuditMismatch.status}`);
    }

    // 7. Decide an approval with shop context parameter
    // Let's find a PENDING approval first
    const pendingItem = approvalsList.find(a => a.status === "PENDING");
    if (pendingItem) {
      const decideUrl = `${baseUrl}/api/approvals/${pendingItem.id}/decide?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resDecide = await fetch(decideUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "REJECT" })
      });
      await checkResponse(resDecide);
      const decideRes = await resDecide.json();
      const finalStatus = decideRes.status || decideRes.approval?.status;
      if (finalStatus !== "REJECTED") {
        throw new Error(`Expected status to be REJECTED, got: ${finalStatus}`);
      }
    } else {
      console.log("   [INFO] No PENDING approvals found to test shop-based decision.");
    }
  });

  // Test S: Phase 10.9 Multi-Agent Product Workspace integration
  await check("S. Multi-Agent Product Workspace integration validation", async () => {
    const timestamp = Date.now();

    // 1. GET /api/agents/catalog returns 200
    const catUrl = `${baseUrl}/api/agents/catalog?t=${timestamp}`;
    const resCat = await fetch(catUrl);
    await checkResponse(resCat);
    const catalog = await resCat.json();
    if (!Array.isArray(catalog) || catalog.length !== 6) {
      throw new Error(`Expected catalog to be an array of 6 agents, got: ${JSON.stringify(catalog)}`);
    }

    // 2. Trigger run for seo_aeo_agent in RECOMMEND mode
    const runUrl = `${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resRun = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_catalog_health",
        mode: "RECOMMEND",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resRun);
    const runResult = await resRun.json();
    if (runResult.agentId !== "agent_catalog_health" || runResult.status !== "COMPLETED") {
      throw new Error(`Expected completed run for agent_catalog_health, got: ${JSON.stringify(runResult)}`);
    }

    // 3. Trigger run for agent_catalog_cleanup in DRAFT mode to produce proposed actions
    const resRunDraft = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_catalog_cleanup",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resRunDraft);
    const runDraftResult = await resRunDraft.json();
    if (runDraftResult.agentId !== "agent_catalog_cleanup" || runDraftResult.status !== "COMPLETED") {
      throw new Error(`Expected completed run for agent_catalog_cleanup, got: ${JSON.stringify(runDraftResult)}`);
    }

    // 4. GET /api/agent-runs?shop=... should list runs
    const getRunsUrl = `${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resGetRuns = await fetch(getRunsUrl);
    await checkResponse(resGetRuns);
    const runsList = await resGetRuns.json();
    if (!Array.isArray(runsList) || runsList.length < 2) {
      throw new Error("Expected at least 2 runs in list.");
    }

    // 5. GET /api/agent-runs/:id?shop=... should get single run
    const getRunDetailUrl = `${baseUrl}/api/agent-runs/${runResult.id}?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resGetRunDetail = await fetch(getRunDetailUrl);
    await checkResponse(resGetRunDetail);
    const runDetail = await resGetRunDetail.json();
    if (runDetail.id !== runResult.id) {
      throw new Error("Expected correct agent run detail ID.");
    }

    // 6. GET /api/recommendations?shop=... should return recommendations
    const getRecsUrl = `${baseUrl}/api/recommendations?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resGetRecs = await fetch(getRecsUrl);
    await checkResponse(resGetRecs);
    const recsList = await resGetRecs.json();
    if (!Array.isArray(recsList)) {
      throw new Error("Expected recommendations list to be an array.");
    }

    // 7. GET /api/recommendations/:id?shop=... and dismiss
    const openRec = recsList.find(r => r.status === "OPEN");
    if (openRec) {
      const getRecDetailUrl = `${baseUrl}/api/recommendations/${openRec.id}?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resGetRecDetail = await fetch(getRecDetailUrl);
      await checkResponse(resGetRecDetail);
      
      const dismissUrl = `${baseUrl}/api/recommendations/${openRec.id}/dismiss?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resDismiss = await fetch(dismissUrl, { method: "POST" });
      await checkResponse(resDismiss);
      const dismissedRec = await resDismiss.json();
      if (dismissedRec.status !== "DISMISSED") {
        throw new Error(`Expected dismissed recommendation, got: ${dismissedRec.status}`);
      }
    }

    // 8. GET /api/proposed-actions?shop=... should return actions
    const getActsUrl = `${baseUrl}/api/proposed-actions?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resGetActs = await fetch(getActsUrl);
    await checkResponse(resGetActs);
    const actsList = await resGetActs.json();
    if (!Array.isArray(actsList)) {
      throw new Error("Expected proposed actions list to be an array.");
    }

    // 9. GET /api/proposed-actions/:id?shop=... and request approval
    const draftAct = actsList.find(a => a.status === "DRAFT" && a.executionMode === "APPROVAL_REQUIRED");
    if (draftAct) {
      const getActDetailUrl = `${baseUrl}/api/proposed-actions/${draftAct.id}?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resGetActDetail = await fetch(getActDetailUrl);
      await checkResponse(resGetActDetail);

      const requestApprovalUrl = `${baseUrl}/api/proposed-actions/${draftAct.id}/request-approval?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resRequest = await fetch(requestApprovalUrl, { method: "POST" });
      await checkResponse(resRequest);
      const requestedAct = await resRequest.json();
      if (requestedAct.status !== "APPROVAL_REQUESTED" || !requestedAct.approvalRequestId) {
        throw new Error(`Expected action to change status to APPROVAL_REQUESTED, got: ${JSON.stringify(requestedAct)}`);
      }

      // Check bridged PENDING approval request exists in queue
      const approvalsListUrl = `${baseUrl}/api/approvals?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resApprovals = await fetch(approvalsListUrl);
      await checkResponse(resApprovals);
      const queueList = await resApprovals.json();
      const bridgedItem = queueList.find(a => a.id === requestedAct.approvalRequestId);
      if (!bridgedItem || bridgedItem.status !== "PENDING") {
        throw new Error("Bridged PENDING approval item was not found in approvals queue.");
      }
    }

    // 10. Negative tests: missing shop or wrong organizationId
    const resRunEmpty = await fetch(`${baseUrl}/api/agent-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "seo_aeo_agent",
        mode: "RECOMMEND",
        scope: { type: "SHOP" }
      })
    });
    if (resRunEmpty.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing context, got: ${resRunEmpty.status}`);
    }

    const runMismatchUrl = `${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&organizationId=mismatch-org-999&t=${timestamp}`;
    const resRunMismatch = await fetch(runMismatchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "seo_aeo_agent",
        mode: "RECOMMEND",
        scope: { type: "SHOP" }
      })
    });
    if (resRunMismatch.status !== 403) {
      throw new Error(`Expected HTTP 403 for mismatched tenant connection, got: ${resRunMismatch.status}`);
    }
  });

  // Test T: Workspace Analytics & Operational Visibility validation
  await check("T. Workspace Analytics & Operational Visibility validation", async () => {
    const timestamp = Date.now();

    // 1. Fetch workspace summary (expect 200)
    const summaryUrl = `${baseUrl}/api/workspace/analytics/summary?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resSummary = await fetch(summaryUrl);
    await checkResponse(resSummary);
    const summaryData = await resSummary.json();
    scanForForbiddenKeys(summaryData);

    if (summaryData.ok !== true || !summaryData.summary) {
      throw new Error(`Expected valid summary block, got: ${JSON.stringify(summaryData)}`);
    }

    const { totalAgentRuns, totalRecommendations, totalProposedActions, approvalConversionRate } = summaryData.summary;
    if (typeof totalAgentRuns !== "number" || typeof totalRecommendations !== "number" || typeof totalProposedActions !== "number" || typeof approvalConversionRate !== "number") {
      throw new Error(`Invalid summary metrics types: ${JSON.stringify(summaryData.summary)}`);
    }

    // 2. Fetch agent runs breakdown
    const runsUrl = `${baseUrl}/api/workspace/analytics/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resRuns = await fetch(runsUrl);
    await checkResponse(resRuns);
    const runsData = await resRuns.json();
    scanForForbiddenKeys(runsData);
    if (runsData.ok !== true || !Array.isArray(runsData.runs) || !Array.isArray(runsData.trends)) {
      throw new Error(`Invalid runs breakdown: ${JSON.stringify(runsData)}`);
    }

    // 3. Fetch recommendations breakdown
    const recsUrl = `${baseUrl}/api/workspace/analytics/recommendations?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resRecs = await fetch(recsUrl);
    await checkResponse(resRecs);
    const recsData = await resRecs.json();
    scanForForbiddenKeys(recsData);
    if (recsData.ok !== true || !recsData.breakdown) {
      throw new Error(`Invalid recs breakdown: ${JSON.stringify(recsData)}`);
    }

    // 4. Fetch proposed actions breakdown
    const actionsUrl = `${baseUrl}/api/workspace/analytics/proposed-actions?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resActions = await fetch(actionsUrl);
    await checkResponse(resActions);
    const actionsData = await resActions.json();
    scanForForbiddenKeys(actionsData);
    if (actionsData.ok !== true || !actionsData.breakdown) {
      throw new Error(`Invalid proposed actions breakdown: ${JSON.stringify(actionsData)}`);
    }

    // 5. Fetch timeline operational trace stepper
    const timelineUrl = `${baseUrl}/api/workspace/analytics/timeline?shop=${encodeURIComponent(shop)}&limit=10&t=${timestamp}`;
    const resTimeline = await fetch(timelineUrl);
    await checkResponse(resTimeline);
    const timelineData = await resTimeline.json();
    scanForForbiddenKeys(timelineData);

    if (timelineData.ok !== true || !Array.isArray(timelineData.timeline)) {
      throw new Error(`Invalid timeline trace response: ${JSON.stringify(timelineData)}`);
    }

    // Assert strict allowlist formatting for timeline payload
    for (const e of timelineData.timeline) {
      if (typeof e.id !== "string") throw new Error("Timeline event is missing clean safe 'id' string.");
      if (typeof e.timestamp !== "string") throw new Error("Timeline event is missing clean 'timestamp' string.");
      if (typeof e.eventType !== "string") throw new Error("Timeline event is missing clean 'eventType' string.");
      if (typeof e.safeSummary !== "string") throw new Error("Timeline event is missing clean 'safeSummary' string.");
      
      // Strict allowlist checks (no raw metadata details may exist)
      const allowedKeys = ["id", "timestamp", "eventType", "agentId", "resourceType", "resourceId", "status", "safeSummary", "counts", "riskLevel", "impactLevel", "correlationId"];
      for (const key of Object.keys(e)) {
        if (!allowedKeys.includes(key)) {
          throw new Error(`Security Violation: Unallowlisted property '${key}' returned in timeline trace object.`);
        }
      }
    }

    // 6. Tenant Context Negative Validation (missing parameter -> 400)
    const resNoParams = await fetch(`${baseUrl}/api/workspace/analytics/summary?t=${timestamp}`);
    if (resNoParams.status !== 400) {
      throw new Error(`Expected HTTP 400 for missing context parameter, got: ${resNoParams.status}`);
    }

    // Tenant Context Mismatch Validation (mismatched store -> 403)
    const resMismatch = await fetch(`${baseUrl}/api/workspace/analytics/summary?shop=${encodeURIComponent(shop)}&organizationId=mismatch-org-999&t=${timestamp}`);
    if (resMismatch.status !== 403) {
      throw new Error(`Expected HTTP 403 for mismatched tenant connection, got: ${resMismatch.status}`);
    }

    // 7. GET-only Enforcement (POST request -> 405 Method Not Allowed)
    const resPost = await fetch(summaryUrl, { method: "POST" });
    if (resPost.status !== 405) {
      throw new Error(`Security Violation: Expected HTTP 405 for non-GET analytics route call, got: ${resPost.status}`);
    }

    // 8. Assert no database mutations or approvals were generated by analytics calls
    const resApprovals = await fetch(`${baseUrl}/api/approvals?shop=${encodeURIComponent(shop)}&t=${timestamp}`);
    await checkResponse(resApprovals);
    const approvals = await resApprovals.json();
    const mockCreatedApprovals = approvals.filter(a => a.id.startsWith("APV-") && a.requestedAt && new Date(a.requestedAt).getTime() > timestamp);
    if (mockCreatedApprovals.length > 0) {
      throw new Error("Security Violation: Calling workspace analytics routes triggered approval creation or execution mutations.");
    }
  });

  // Test U: Phase 10.11 MVP Merchant Workflow Normalization and Explicit Execution safety validation
  await check("U. Phase 10.11 MVP Merchant Workflow Normalization and Explicit Execution safety validation", async () => {
    const timestamp = Date.now();

    // 1. Create a PENDING approval request using agent chat
    const chatUrl = `${baseUrl}/api/agents/chat?t=${timestamp}`;
    const resChat = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_catalog_health",
        message: "simulate tool catalog.products.propose_update"
      })
    });
    await checkResponse(resChat);
    const chatData = await resChat.json();
    if (chatData.ok !== true) {
      throw new Error(`Expected chat query to succeed, got: ${JSON.stringify(chatData)}`);
    }

    // 2. Fetch approvals strictly for our organization
    const approvalsUrl = `${baseUrl}/api/approvals?organizationId=${TEST_ORGANIZATION_ID}&t=${timestamp}`;
    const resApprovals = await fetch(approvalsUrl);
    await checkResponse(resApprovals);
    const approvals = await resApprovals.json();

    const pendingApproval = approvals.find(
      a => a.status === "PENDING" && a.toolName === "catalog.products.propose_update"
    );
    if (!pendingApproval) {
      throw new Error("Expected to find a PENDING approval request.");
    }
    const approvalId = pendingApproval.id;

    // 3. Approve the request and test the normalization shape
    const decideUrl = `${baseUrl}/api/approvals/${approvalId}/decide?t=${timestamp}`;
    const resDecide = await fetch(decideUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "APPROVE",
        organizationId: TEST_ORGANIZATION_ID
      })
    });
    await checkResponse(resDecide);
    const decideRes = await resDecide.json();

    // Verify: APPROVE response contains wrapper object { ok, status, executionDeferred, approval }
    if (decideRes.ok !== true || decideRes.status !== "APPROVED" || decideRes.executionDeferred !== true || !decideRes.approval) {
      throw new Error(`Approve response wrapper mismatch, got: ${JSON.stringify(decideRes)}`);
    }

    // Normalize the response shape mimicking App.tsx: `const updatedItem = data.approval || data;`
    const updatedItem = decideRes.approval || decideRes;

    // Verify: Approved item remains a valid ApprovalItem
    if (!updatedItem.id || updatedItem.status !== "APPROVED" || !updatedItem.details || !updatedItem.details.title) {
      throw new Error(`Normalized item is not a valid ApprovalItem: ${JSON.stringify(updatedItem)}`);
    }

    // Verify: Response explicitly includes organizationId and storeConnectionId
    if (!updatedItem.organizationId || updatedItem.organizationId !== TEST_ORGANIZATION_ID) {
      throw new Error(`Normalized approval item missing organizationId: ${JSON.stringify(updatedItem)}`);
    }
    if (!updatedItem.storeConnectionId) {
      throw new Error(`Normalized approval item missing storeConnectionId: ${JSON.stringify(updatedItem)}`);
    }

    // 4. Verify that approval does NOT auto-execute (must remain APPROVED in db)
    const checkRes = await fetch(`${baseUrl}/api/approvals?organizationId=${TEST_ORGANIZATION_ID}&t=${timestamp}`);
    await checkResponse(checkRes);
    const updatedApprovalsList = await checkRes.json();
    const dbItem = updatedApprovalsList.find(a => a.id === approvalId);
    if (!dbItem || dbItem.status !== "APPROVED") {
      throw new Error(`Expected item status in DB to remain APPROVED (no auto-execution), got: ${dbItem?.status}`);
    }

    // Verify that catalog product is not changed
    const resProducts = await fetch(`${baseUrl}/api/catalog/products?shop=${shop}&t=${timestamp}`);
    await checkResponse(resProducts);
    const products = await resProducts.json();
    const targetProduct = products.find(p => String(p.shopifyProductId || p.id) === "101");
    if (targetProduct && targetProduct.title === "Super Polished Tee") {
      throw new Error("Security Violation: mutation committed to catalog upon approval decision (auto-executed).");
    }

    // 5. Verify execute and reset-failed reject hardcoded or incorrect organizationId
    const execUrl = `${baseUrl}/api/approvals/${approvalId}/execute?t=${timestamp}`;
    const resExecMismatched = await fetch(execUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "mismatched-org-id",
        shop
      })
    });
    if (resExecMismatched.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for mismatched execution tenant organizationId, got: ${resExecMismatched.status}`);
    }

    const resetUrl = `${baseUrl}/api/approvals/${approvalId}/reset-failed?t=${timestamp}`;
    const resResetMismatched = await fetch(resetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "mismatched-org-id",
        shop,
        performedBy: "Shop Owner"
      })
    });
    if (resResetMismatched.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for mismatched recovery tenant organizationId, got: ${resResetMismatched.status}`);
    }

    console.log("   [TEST U] Successfully verified APPROVE response normalization, valid ApprovalItem fields (organizationId & storeConnectionId), safe no-auto-execute status, and dynamic tenant-safe execute/reset validation.");
  });

  // Test V: Phase 10.12 Production Bulk Operations Foundation
  await check("V. Production Bulk Operations Foundation (batch request, decide, execute, and tenant isolation)", async () => {
    const timestamp = Date.now();

    // 1. Fetch draft proposed actions dynamically (trigger a run to ensure enough drafts exist)
    const runUrl = `${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const resRunDraft = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_catalog_cleanup",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resRunDraft);

    const resGetActs = await fetch(`${baseUrl}/api/proposed-actions?shop=${encodeURIComponent(shop)}&t=${timestamp}`);
    await checkResponse(resGetActs);
    const actsList = await resGetActs.json();
    const draftActions = actsList.filter(a => a.status === "DRAFT" || a.status === "APPROVAL_ELIGIBLE");
    if (draftActions.length < 3) {
      throw new Error(`Smoke Test Prep Error: Expected at least 3 draft proposed actions, got ${draftActions.length}.`);
    }

    const testAction1 = draftActions[0].id;
    const testAction2 = draftActions[1].id;
    const testAction3 = draftActions[2].id;

    // A. Two-Phase Preflight Safety Gating Test:
    // Dismiss testAction3 first to make it ineligible for bridging (invalid status: DISMISSED)
    const resDismissItem3 = await fetch(`${baseUrl}/api/proposed-actions/${testAction3}/dismiss?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
      method: "POST"
    });
    await checkResponse(resDismissItem3);

    // Now try batch-request-approval where item 1 is valid (testAction1) but item 2 is invalid (testAction3 is DISMISSED)
    const resInvalidBatchRequest = await fetch(`${baseUrl}/api/proposed-actions/batch-request-approval?t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [testAction1, testAction3],
        organizationId: TEST_ORGANIZATION_ID,
        shop
      })
    });
    // The entire batch request must fail with 400 Bad Request
    if (resInvalidBatchRequest.status !== 400) {
      throw new Error(`Expected HTTP 400 Bad Request for ineligible status in batch-request-approval preflight, got: ${resInvalidBatchRequest.status}`);
    }
    const dataInvalid = await resInvalidBatchRequest.json();
    if (dataInvalid.ok === true) {
      throw new Error(`Expected ok to be false for ineligible preflight request, got: ${JSON.stringify(dataInvalid)}`);
    }

    // Verify no partial state changes occurred: testAction1's status MUST still be strictly DRAFT in database
    const resCheckAction1 = await fetch(`${baseUrl}/api/proposed-actions/${testAction1}?shop=${encodeURIComponent(shop)}&t=${timestamp}`);
    await checkResponse(resCheckAction1);
    const action1Details = await resCheckAction1.json();
    if (action1Details.status !== "DRAFT" || action1Details.approvalRequestId) {
      throw new Error(`Security/Two-Phase Violation: Valid item was partially bridged despite preflight failure. Details: ${JSON.stringify(action1Details)}`);
    }

    // 2. Tenant Isolation validation: verify that passing a mismatched claimed organizationId returns 403 Forbidden
    const resDismissMismatched = await fetch(`${baseUrl}/api/proposed-actions/batch-dismiss?t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [testAction1, testAction2],
        organizationId: "mismatched-org-id",
        shop
      })
    });
    if (resDismissMismatched.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for mismatched batch dismiss organizationId, got: ${resDismissMismatched.status}`);
    }

    const resRequestMismatched = await fetch(`${baseUrl}/api/proposed-actions/batch-request-approval?t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [testAction1, testAction2],
        organizationId: "mismatched-org-id",
        shop
      })
    });
    if (resRequestMismatched.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for mismatched batch request approval organizationId, got: ${resRequestMismatched.status}`);
    }

    // 3. Batch request approvals: bridge the 2 mock actions
    const resRequest = await fetch(`${baseUrl}/api/proposed-actions/batch-request-approval?t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [testAction1, testAction2],
        organizationId: TEST_ORGANIZATION_ID,
        shop
      })
    });
    await checkResponse(resRequest);
    const dataRequest = await resRequest.json();
    scanForForbiddenKeys(dataRequest);

    if (dataRequest.ok !== true || typeof dataRequest.bridgedCount !== "number") {
      throw new Error(`Expected batch request approval to succeed, got: ${JSON.stringify(dataRequest)}`);
    }

    const bridgedIds = (dataRequest.results || []).map(r => r.approvalId).filter(Boolean);
    if (bridgedIds.length === 0) {
      throw new Error("No approvals were bridged during batch request approvals.");
    }

    // 4. Batch decide: bulk approve the bridged items
    const resDecide = await fetch(`${baseUrl}/api/approvals/batch-decide?t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: bridgedIds,
        decision: "APPROVE",
        organizationId: TEST_ORGANIZATION_ID,
        shop
      })
    });
    await checkResponse(resDecide);
    const dataDecide = await resDecide.json();
    scanForForbiddenKeys(dataDecide);

    if (dataDecide.ok !== true || dataDecide.decision !== "APPROVE" || dataDecide.executionDeferred !== true) {
      throw new Error(`Expected batch decide to succeed in deferred mode, got: ${JSON.stringify(dataDecide)}`);
    }

    // 5. Batch execute: sequentially dispatch live storefront commits
    const resExecute = await fetch(`${baseUrl}/api/approvals/batch-execute?t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: bridgedIds,
        organizationId: TEST_ORGANIZATION_ID,
        shop,
        performer: "Shop Owner"
      })
    });
    await checkResponse(resExecute);
    const dataExecute = await resExecute.json();
    scanForForbiddenKeys(dataExecute);

    if (dataExecute.ok !== true || !Array.isArray(dataExecute.results)) {
      throw new Error(`Expected batch execute to succeed with per-item results, got: ${JSON.stringify(dataExecute)}`);
    }

    // Verify all processed items successfully applied (APPLIED, ALREADY_APPLIED, or safely BLOCKED due to scope limitations)
    for (const resItem of dataExecute.results) {
      if (resItem.status === "APPLIED" || resItem.status === "ALREADY_APPLIED") {
        continue;
      }

      if (resItem.status === "BLOCKED") {
        const errorMsg = resItem.error || "";
        const isSafeBlock = errorMsg.includes("missing write_products scope") ||
                            errorMsg.includes("Store connection is missing write_products scope");
        if (isSafeBlock) {
          console.log(`   [INFO] Item ${resItem.id} was safely BLOCKED as expected: "${errorMsg}". This is a successful safe guardrail outcome for smoke-test environments without write_products scope.`);
          continue;
        }
      }

      throw new Error(`Item execution failed in batch execute: ${JSON.stringify(resItem)}`);
    }

    console.log("   [TEST V] Successfully verified sequential batch request, batch decide deferred approvals, sequential batch execute, and strict preflight tenant isolation checks.");
  });

  // Test W: Phase 10.13 Real-Store Product Readiness integration check
  await check("W. Phase 10.13 Real-Store Product Readiness integration check", async () => {
    const timestamp = Date.now();

    // 1. Verify readiness endpoint loads correct schema and fields for primary shop
    const resReadiness = await fetch(`${baseUrl}/api/shop/readiness?shop=${encodeURIComponent(shop)}&t=${timestamp}`);
    await checkResponse(resReadiness);
    const dataReadiness = await resReadiness.json();
    scanForForbiddenKeys(dataReadiness);

    const requiredFields = [
      "hasReadProducts",
      "hasWriteProducts",
      "canRunInsights",
      "canExecuteMutations",
      "missingRequiredScopes",
      "connectionStatus",
      "syncFreshness",
      "snapshotCount",
      "agentReadiness"
    ];

    for (const f of requiredFields) {
      if (dataReadiness[f] === undefined) {
        throw new Error(`Readiness check failed: field "${f}" is missing in the readiness endpoint response.`);
      }
    }

    if (dataReadiness.connectionStatus !== "CONNECTED") {
      throw new Error(`Expected connectionStatus to be CONNECTED, got: ${dataReadiness.connectionStatus}`);
    }

    // 1.1 Verify GET /api/shop/readiness with shop + mismatched organizationId returns 403
    const resReadinessMismatch = await fetch(`${baseUrl}/api/shop/readiness?shop=${encodeURIComponent(shop)}&organizationId=wrong-org-id&t=${timestamp}`);
    if (resReadinessMismatch.status !== 403) {
      throw new Error(`Expected HTTP 403 for mismatched tenant context on readiness route, got: ${resReadinessMismatch.status}`);
    }
    const readinessMismatchData = await resReadinessMismatch.json();
    if (readinessMismatchData.code !== "ACCESS_DENIED") {
      throw new Error(`Expected code ACCESS_DENIED on mismatched tenant, got: ${readinessMismatchData.code}`);
    }

    // 1.2 Verify GET /api/shop/readiness without shop and without organizationId returns 400
    const resReadinessEmpty = await fetch(`${baseUrl}/api/shop/readiness?t=${timestamp}`);
    if (resReadinessEmpty.status !== 400) {
      throw new Error(`Expected HTTP 400 for empty request on readiness route, got: ${resReadinessEmpty.status}`);
    }
    const readinessEmptyData = await resReadinessEmpty.json();
    if (readinessEmptyData.code !== "MISSING_TENANT_CONTEXT") {
      throw new Error(`Expected code MISSING_TENANT_CONTEXT, got: ${readinessEmptyData.code}`);
    }

    // 2. Verify readiness endpoint for scope-mismatch connection specifically
    if (isInMemory) {
      const mismatchShop = "scope-mismatch.myshopify.com";
      const resMismatchReadiness = await fetch(`${baseUrl}/api/shop/readiness?shop=${encodeURIComponent(mismatchShop)}&t=${timestamp}`);
      await checkResponse(resMismatchReadiness);
      const dataMismatchReadiness = await resMismatchReadiness.json();
      scanForForbiddenKeys(dataMismatchReadiness);

      // Verify missing write_products is represented as safe readiness state (not crashing)
      if (dataMismatchReadiness.hasWriteProducts !== false) {
        throw new Error("Expected hasWriteProducts to be false for scope-mismatch connection.");
      }
      if (dataMismatchReadiness.canExecuteMutations !== false) {
        throw new Error("Expected canExecuteMutations to be false for scope-mismatch connection.");
      }
      if (!dataMismatchReadiness.missingRequiredScopes.includes("write_products")) {
        throw new Error("Expected missingRequiredScopes to contain 'write_products'.");
      }
      
      // Verify read-only insights remain allowed when read_products exists
      if (dataMismatchReadiness.canRunInsights !== true) {
        throw new Error("Expected canRunInsights to be true for scope-mismatch connection (since read_products scope exists).");
      }

      // 3. Verify safe execution block response mapping when missing write scope
      // Install agent on scope-mismatch connection
      const resInstallMismatch = await fetch(`${baseUrl}/api/agents/install`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Softify-Dev-Bypass": bypassSecret
        },
        body: JSON.stringify({
          shop: mismatchShop,
          agentId: "agent_catalog_health"
        })
      });
      await checkResponse(resInstallMismatch);

      // Trigger proposal creation on scope-mismatch
      const resChatMismatch = await fetch(`${baseUrl}/api/agents/chat?t=${timestamp}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Softify-Dev-Bypass": bypassSecret
        },
        body: JSON.stringify({
          shop: mismatchShop,
          agentId: "agent_catalog_health",
          message: "simulate tool catalog.products.propose_update"
        })
      });
      await checkResponse(resChatMismatch);

      // Fetch approvals and find mismatch approval
      const resApprovalsMismatch = await fetch(`${baseUrl}/api/approvals?organizationId=demo-org-id&t=${timestamp}`);
      await checkResponse(resApprovalsMismatch);
      const approvalsMismatch = await resApprovalsMismatch.json();
      
      const pendingMismatch = approvalsMismatch.find(
        a => a.status === "PENDING" && a.toolName === "catalog.products.propose_update" && a.storeConnectionId === "store-scope-mismatch"
      );
      if (!pendingMismatch) {
        throw new Error("Expected to find a PENDING approval request for scope-mismatch connection in Test W.");
      }
      const mismatchApprovalId = pendingMismatch.id;

      // Approve the request (state-only)
      const resDecideMismatch = await fetch(`${baseUrl}/api/approvals/${mismatchApprovalId}/decide?t=${timestamp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "APPROVE",
          organizationId: "demo-org-id",
          shop: mismatchShop
        })
      });
      await checkResponse(resDecideMismatch);

      // Attempt execution (expect the improved custom response payload mapping)
      const resExecMismatch = await fetch(`${baseUrl}/api/approvals/${mismatchApprovalId}/execute?t=${timestamp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "demo-org-id",
          shop: mismatchShop,
          performer: "Readiness Auditor"
        })
      });

      if (resExecMismatch.status !== 400) {
        throw new Error(`Expected HTTP 400 Bad Request for execution with missing write scope in Test W, got: ${resExecMismatch.status}`);
      }
      const mismatchExecData = await resExecMismatch.json();
      scanForForbiddenKeys(mismatchExecData);

      if (mismatchExecData.ok !== false || mismatchExecData.code !== "EXECUTION_BLOCKED" || mismatchExecData.status !== "BLOCKED") {
        throw new Error(`Expected customized EXECUTION_BLOCKED response payload mapping, got: ${JSON.stringify(mismatchExecData)}`);
      }
      if (mismatchExecData.error !== "Store connection is missing write_products scope. Mutations are disabled for this connection.") {
        throw new Error(`Expected exact customized block error message, got: "${mismatchExecData.error}"`);
      }

      // 4. Verify tenant isolation in execution route (mismatched orgId returns 403)
      const resMismatched = await fetch(`${baseUrl}/api/approvals/${mismatchApprovalId}/execute?t=${timestamp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "wrong-org-id",
          shop: mismatchShop,
          performer: "Intruder"
        })
      });
      if (resMismatched.status !== 403) {
        throw new Error(`Expected HTTP 403 Forbidden for mismatched tenant execute, got: ${resMismatched.status}`);
      }
    }

    console.log("   [TEST W] Successfully verified readiness diagnostics GET endpoint schema, state-only decision execution immunity, blocked execute gating response mapping, and tenant isolation locks.");
  });

  // Test X: Phase 10.14 Initial Agent Set & Merchant Workflows integration check
  await check("X. Phase 10.14 Initial Agent Set & Merchant Workflows integration check", async () => {
    const timestamp = Date.now();

    // Pre-install all production agents on the test store connection so they don't fail with AGENT_NOT_INSTALLED
    for (const installAgentId of ["agent_catalog_health", "agent_product_seo", "agent_catalog_cleanup", "agent_merchandising_insights", "agent_approval_operations"]) {
      const installRes = await fetch(`${baseUrl}/api/agents/install`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Softify-Dev-Bypass": bypassSecret
        },
        body: JSON.stringify({
          shop,
          agentId: installAgentId
        })
      });
      await checkResponse(installRes);
    }

    // 1. Fetch GET /api/agents/catalog and verify active agents list (legacy omitted, five active present)
    const resCatalog = await fetch(`${baseUrl}/api/agents/catalog?t=${timestamp}`);
    await checkResponse(resCatalog);
    const catalog = await resCatalog.json();

    const expectedActive = [
      "agent_catalog_health",
      "agent_product_seo",
      "agent_catalog_cleanup",
      "agent_merchandising_insights",
      "agent_approval_operations"
    ];

    for (const id of expectedActive) {
      const match = catalog.find(a => a.agentId === id);
      if (!match) {
        throw new Error(`Expected agent '${id}' to be active and visible in the production catalog response.`);
      }
      if (match.isLegacy === true) {
        throw new Error(`Expected active agent '${id}' to not be marked as legacy in the response.`);
      }
    }

    const legacyAgents = [
      "agent_store_setup", "agent_content", "agent_analytics", "agent_theme_dev", "agent_design", "agent_customer_support", "agent_media_digital", "product_intelligence_agent", "seo_aeo_agent", "content_agent", "design_review_agent"
    ];
    for (const legacy of legacyAgents) {
      if (catalog.some(a => a.agentId === legacy)) {
        throw new Error(`Security Violation: Legacy agent '${legacy}' is visible in production catalog response.`);
      }
    }

    // 2. Trigger dynamic simulation runs for mutating agents and check per-agent field policies
    // A. Product SEO Agent: allowedFields: title, productType, tags only (no vendor/status)
    const resSeoRun = await fetch(`${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_product_seo",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resSeoRun);
    const seoRun = await resSeoRun.json();

    const resSeoActs = await fetch(`${baseUrl}/api/proposed-actions?shop=${encodeURIComponent(shop)}&agentId=agent_product_seo&t=${timestamp}`);
    await checkResponse(resSeoActs);
    const seoActs = await resSeoActs.json();
    const activeSeoActs = seoActs.filter(a => a.agentRunId === seoRun.id);

    for (const act of activeSeoActs) {
      const changes = act.changes || {};
      if (changes.vendor !== undefined || changes.status !== undefined) {
        throw new Error(`Per-Agent Field Policy Violation: Product SEO Agent proposed vendor or status fields: ${JSON.stringify(changes)}`);
      }
      if (changes.title === undefined && changes.productType === undefined && changes.tags === undefined) {
        throw new Error("Expected Product SEO Agent proposed changes to contain title, productType or tags.");
      }
    }

    // B. Catalog Cleanup Agent: allowedFields: vendor, productType, status, tags only (no title)
    const resCleanupRun = await fetch(`${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_catalog_cleanup",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resCleanupRun);
    const cleanupRun = await resCleanupRun.json();

    const resCleanupActs = await fetch(`${baseUrl}/api/proposed-actions?shop=${encodeURIComponent(shop)}&agentId=agent_catalog_cleanup&t=${timestamp}`);
    await checkResponse(resCleanupActs);
    const cleanupActs = await resCleanupActs.json();
    const activeCleanupActs = cleanupActs.filter(a => a.agentRunId === cleanupRun.id);

    for (const act of activeCleanupActs) {
      const changes = act.changes || {};
      if (changes.title !== undefined) {
        throw new Error(`Per-Agent Field Policy Violation: Catalog Cleanup Agent proposed title field: ${JSON.stringify(changes)}`);
      }
      if (changes.vendor === undefined && changes.productType === undefined && changes.status === undefined && changes.tags === undefined) {
        throw new Error("Expected Catalog Cleanup Agent proposed changes to contain vendor, productType, status, or tags.");
      }
    }

    // C. Merchandising Insights & Approval Operations: Read-only, no proposals
    const resInsightsRun = await fetch(`${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_merchandising_insights",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resInsightsRun);
    const insightsRun = await resInsightsRun.json();
    if (insightsRun.proposedActionCount !== 0) {
      throw new Error(`Security Violation: Read-only Merchandising Insights Agent generated proposed actions: ${insightsRun.proposedActionCount}`);
    }

    const resOpsRun = await fetch(`${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_approval_operations",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    await checkResponse(resOpsRun);
    const opsRun = await resOpsRun.json();
    if (opsRun.proposedActionCount !== 0) {
      throw new Error(`Security Violation: Read-only Approval Operations Agent generated proposed actions: ${opsRun.proposedActionCount}`);
    }

    // 3. Mismatched tenant contexts on agent runs post request returns 403 Forbidden
    const resMismatchRun = await fetch(`${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&organizationId=mismatch-org-999&t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_product_seo",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    if (resMismatchRun.status !== 403) {
      throw new Error(`Expected HTTP 403 for mismatched org connection in agent run, got: ${resMismatchRun.status}`);
    }

    // 4. Hardening: POST /api/agent-runs with product_intelligence_agent (legacy) must be rejected
    const resLegacyAgentRun = await fetch(`${baseUrl}/api/agent-runs?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "product_intelligence_agent",
        mode: "DRAFT",
        scope: { type: "SHOP" }
      })
    });
    if (resLegacyAgentRun.status !== 403) {
      throw new Error(`Expected HTTP 403 for legacy agent run execution, got: ${resLegacyAgentRun.status}`);
    }
    const legacyAgentRunData = await resLegacyAgentRun.json();
    if (legacyAgentRunData.error !== "Agent is not available for production execution.") {
      throw new Error(`Expected 'Agent is not available for production execution.' error message, got: '${legacyAgentRunData.error}'`);
    }
    console.log("   [TEST X Hardening] Successfully verified legacy agent runs are blocked with 403.");

    if (hasSeededFirestoreFixtures) {
      // 5. Hardening: Product SEO proposed action with vendor or status must fail bridge
      const resBridgeSeo = await fetch(`${baseUrl}/api/proposed-actions/${uniqueSeoActionId}/request-approval?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
        method: "POST"
      });
      if (resBridgeSeo.status !== 500 && resBridgeSeo.status !== 400) {
        throw new Error(`Expected bridge request to fail with 500 or 400 for invalid SEO changes, got: ${resBridgeSeo.status}`);
      }
      const bridgeSeoData = await resBridgeSeo.json();
      if (!bridgeSeoData.error || (!bridgeSeoData.error.includes("forbidden fields") && !bridgeSeoData.error.includes("permissions"))) {
        throw new Error(`Expected forbidden fields bridge rejection error message, got: '${bridgeSeoData.error}'`);
      }
      console.log("   [TEST X Hardening] Successfully verified invalid SEO proposed action fails bridge.");

      // 6. Hardening: Catalog Cleanup proposed action with title must fail bridge
      const resBridgeCleanup = await fetch(`${baseUrl}/api/proposed-actions/${uniqueCleanupActionId}/request-approval?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
        method: "POST"
      });
      if (resBridgeCleanup.status !== 500 && resBridgeCleanup.status !== 400) {
        throw new Error(`Expected bridge request to fail with 500 or 400 for invalid Cleanup changes, got: ${resBridgeCleanup.status}`);
      }
      const bridgeCleanupData = await resBridgeCleanup.json();
      if (!bridgeCleanupData.error || (!bridgeCleanupData.error.includes("forbidden fields") && !bridgeCleanupData.error.includes("permissions"))) {
        throw new Error(`Expected forbidden fields bridge rejection error message, got: '${bridgeCleanupData.error}'`);
      }
      console.log("   [TEST X Hardening] Successfully verified invalid Cleanup proposed action fails bridge.");

      // 7. Hardening: Read-only agent proposed action must fail bridge
      const resBridgeReadonly = await fetch(`${baseUrl}/api/proposed-actions/${uniqueReadonlyActionId}/request-approval?shop=${encodeURIComponent(shop)}&t=${timestamp}`, {
        method: "POST"
      });
      if (resBridgeReadonly.status !== 500 && resBridgeReadonly.status !== 400) {
        throw new Error(`Expected bridge request to fail with 500 or 400 for read-only agent changes, got: ${resBridgeReadonly.status}`);
      }
      const bridgeReadonlyData = await resBridgeReadonly.json();
      if (!bridgeReadonlyData.error || !bridgeReadonlyData.error.includes("permissions")) {
        throw new Error(`Expected proposal permissions bridge rejection error message, got: '${bridgeReadonlyData.error}'`);
      }
      console.log("   [TEST X Hardening] Successfully verified read-only agent proposed action fails bridge.");
    } else {
      console.log("   [TEST X Hardening] Skipping invalid proposed actions bridge checks (no seeded fixtures available).");
    }

    // 8. Hardening: Verify Tool Gateway proposal field restrictions via direct agent chat simulation
    const resChatInvalidFields = await fetch(`${baseUrl}/api/agents/chat?t=${timestamp}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Softify-Dev-Bypass": bypassSecret
      },
      body: JSON.stringify({
        shop,
        agentId: "agent_product_seo",
        message: "simulate tool catalog.products.propose_update fields:{\"vendor\":\"BlockedVendor\"}"
      })
    });
    await checkResponse(resChatInvalidFields);
    const chatInvalidFieldsData = await resChatInvalidFields.json();
    
    const failedCall = chatInvalidFieldsData.toolCalls?.find(t => t.toolName === "catalog.products.propose_update");
    if (failedCall) {
      throw new Error("Expected Tool Gateway to block invalid fields proposal, but tool call was dispatched.");
    }
    if (!chatInvalidFieldsData.message.toLowerCase().includes("cannot") && !chatInvalidFieldsData.message.toLowerCase().includes("only") && !chatInvalidFieldsData.message.toLowerCase().includes("read-only")) {
      throw new Error(`Expected chat response to explain access block or tool execution failure, got: "${chatInvalidFieldsData.message}"`);
    }
    console.log("   [TEST X Hardening] Successfully verified Tool Gateway rejects forbidden fields dynamically.");

    console.log("   [TEST X] Successfully verified dynamic GET /api/agents/catalog exclusions, per-agent allowed field schemas, read-only agent mutation immunity, and strict tenant security isolation.");
  });

  // Test Y: Controlled Merchant Pilot Access & Readiness Endpoint validation
  await check("Y. Controlled Merchant Pilot Access & Readiness Endpoint validation", async () => {
    const timestamp = Date.now();

    // Configure the pilot allowlist environment variable for this test
    const oldPilotShops = process.env.SOFTIFY_PILOT_SHOPS;
    process.env.SOFTIFY_PILOT_SHOPS = `${shop},another-pilot-shop.myshopify.com`;

    try {
      // 1. Approved pilot shop readiness
      const urlApproved = `${baseUrl}/api/pilot/readiness?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
      const resApproved = await fetch(urlApproved);
      await checkResponse(resApproved);
      const dataApproved = await resApproved.json();
      
      scanForForbiddenKeys(dataApproved);

      if (dataApproved.shopDomain !== shop) {
        throw new Error(`Expected shopDomain to be "${shop}", got: "${dataApproved.shopDomain}"`);
      }
      if (dataApproved.pilotApproved !== true) {
        throw new Error(`Expected pilotApproved to be true for allowlisted shop, got: ${dataApproved.pilotApproved}`);
      }
      if (dataApproved.connected !== true) {
        throw new Error(`Expected connected to be true for synced test shop, got: ${dataApproved.connected}`);
      }
      if (dataApproved.readinessStatus !== "READY") {
        throw new Error(`Expected readinessStatus to be "READY", got: "${dataApproved.readinessStatus}"`);
      }
      if (dataApproved.canExecuteMutations !== false) {
        throw new Error(`Expected canExecuteMutations to be false, got: ${dataApproved.canExecuteMutations}`);
      }
      if (dataApproved.mutationMode !== "read_only_blocked") {
        throw new Error(`Expected mutationMode to be "read_only_blocked", got: "${dataApproved.mutationMode}"`);
      }
      if (!Array.isArray(dataApproved.grantedScopeSummary)) {
        throw new Error(`Expected grantedScopeSummary to be an array, got: ${typeof dataApproved.grantedScopeSummary}`);
      }
      // Ensure no theme scopes/tools are present in scopes or details
      if (dataApproved.grantedScopeSummary.includes("read_themes") || dataApproved.grantedScopeSummary.includes("write_themes")) {
        throw new Error("Security Violation: Theme scopes should not be returned or allowed.");
      }
      if (typeof dataApproved.productSnapshotCount !== "number") {
        throw new Error(`Expected productSnapshotCount to be a number, got: ${typeof dataApproved.productSnapshotCount}`);
      }
      if (dataApproved.visibleProductionAgentCount !== 6) {
        throw new Error(`Expected visibleProductionAgentCount to be 6, got: ${dataApproved.visibleProductionAgentCount}`);
      }

      // Assert warnings
      if (!Array.isArray(dataApproved.warnings)) {
        throw new Error("Expected warnings to be an array");
      }
      if (!dataApproved.warnings.includes("execution blocked")) {
        throw new Error("Expected warnings to contain 'execution blocked'");
      }
      
      // Let's test unallowlisted shop
      const unallowlistedShop = "unallowlisted-shop.myshopify.com";
      const urlRejected = `${baseUrl}/api/pilot/readiness?shop=${encodeURIComponent(unallowlistedShop)}&t=${timestamp}`;
      const resRejected = await fetch(urlRejected);
      await checkResponse(resRejected);
      const dataRejected = await resRejected.json();

      scanForForbiddenKeys(dataRejected);

      if (dataRejected.pilotApproved !== false) {
        throw new Error(`Expected pilotApproved to be false for unallowlisted shop, got: ${dataRejected.pilotApproved}`);
      }
      if (dataRejected.readinessStatus !== "NOT_READY") {
        throw new Error(`Expected readinessStatus to be "NOT_READY" for unallowlisted shop, got: "${dataRejected.readinessStatus}"`);
      }
      if (dataRejected.connected !== false) {
        throw new Error(`Expected connected to be false for unallowlisted shop, got: ${dataRejected.connected}`);
      }

      // Let's test an allowlisted shop that has no store connection registered
      const unregisteredShop = "unregistered-pilot-shop.myshopify.com";
      process.env.SOFTIFY_PILOT_SHOPS = `${shop},${unregisteredShop}`;
      
      const urlUnregistered = `${baseUrl}/api/pilot/readiness?shop=${encodeURIComponent(unregisteredShop)}&t=${timestamp}`;
      const resUnregistered = await fetch(urlUnregistered);
      await checkResponse(resUnregistered);
      const dataUnregistered = await resUnregistered.json();

      scanForForbiddenKeys(dataUnregistered);

      if (dataUnregistered.pilotApproved !== true) {
        throw new Error(`Expected pilotApproved to be true for unregistered allowlisted shop, got: ${dataUnregistered.pilotApproved}`);
      }
      if (dataUnregistered.connected !== false) {
        throw new Error(`Expected connected to be false for unregistered allowlisted shop, got: ${dataUnregistered.connected}`);
      }
      if (dataUnregistered.readinessStatus !== "NOT_READY") {
        throw new Error(`Expected readinessStatus to be "NOT_READY" for unregistered allowlisted shop, got: "${dataUnregistered.readinessStatus}"`);
      }

      // Let's test an allowlisted shop with a connection but missing write_products scope.
      // In seedInProcessDb, "scope-mismatch.myshopify.com" has only ["read_products", "read_orders", "read_customers", "write_themes", "read_analytics"]. It lacks "write_products".
      const mismatchShop = "scope-mismatch.myshopify.com";
      process.env.SOFTIFY_PILOT_SHOPS = `${shop},${mismatchShop}`;

      const urlMismatch = `${baseUrl}/api/pilot/readiness?shop=${encodeURIComponent(mismatchShop)}&t=${timestamp}`;
      const resMismatch = await fetch(urlMismatch);
      await checkResponse(resMismatch);
      const dataMismatch = await resMismatch.json();

      scanForForbiddenKeys(dataMismatch);

      if (dataMismatch.pilotApproved !== true) {
        throw new Error("Expected pilotApproved to be true for scope-mismatch shop");
      }
      if (dataMismatch.connected !== true) {
        throw new Error("Expected connected to be true for scope-mismatch shop");
      }
      if (dataMismatch.canExecuteMutations !== false) {
        throw new Error("Expected canExecuteMutations to be false for scope-mismatch shop");
      }
      if (!dataMismatch.warnings.includes("write_products missing")) {
        throw new Error(`Expected warnings to contain "write_products missing" for scope-mismatch shop, got: ${JSON.stringify(dataMismatch.warnings)}`);
      }

      console.log("   [TEST Y] Dynamic allowlist validation, readiness mapping, safety disclaimers, and scope scans passed successfully.");
    } finally {
      // Restore previous environment setting
      if (oldPilotShops === undefined) {
        delete process.env.SOFTIFY_PILOT_SHOPS;
      } else {
        process.env.SOFTIFY_PILOT_SHOPS = oldPilotShops;
      }
    }
  });

  // Test Z: Phase 11.0 Simplified Merchant UI & Theme Editor AI Agent MVP validation
  await check("Z. Phase 11.0 Simplified Merchant UI & Theme Editor AI Agent MVP validation", async () => {
    const timestamp = Date.now();
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const { getMockBackups, clearMockBackups } = await import("../src/server/services/shopify-theme.service.ts");
    const repos = getRepositories();

    // 1. Setup mock credentials and environment variables
    const oldGeminiModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_MODEL = "gemini-test-custom-model";

    try {
      // Install theme_editor_ai_agent as enabled for glowthread
      await repos.agentInstallations.upsertInstallation({
        id: "store-glowthread_theme_editor_ai_agent",
        organizationId: "demo-org-id",
        storeConnectionId: "store-glowthread",
        shopDomain: "glowthread-apparel.myshopify.com",
        agentId: "theme_editor_ai_agent",
        enabled: true,
        allowedTools: [
          "shopify.theme.themes",
          "shopify.theme.assets",
          "shopify.theme.assets.read",
          "shopify.theme.assets.write"
        ]
      });

      // 2. Validate Settings provider exposes configurable Gemini model name
      const resAiProviders = await fetch(`${baseUrl}/api/settings/ai-providers?shop=glowthread-apparel.myshopify.com&t=${timestamp}`);
      await checkResponse(resAiProviders);
      const aiProviders = await resAiProviders.json();
      const geminiProvider = aiProviders.find(p => p.providerId === "gemini");
      if (!geminiProvider) throw new Error("Missing Gemini provider in Settings.");
      if (geminiProvider.activeModel !== "gemini-test-custom-model") {
        throw new Error(`Expected Settings to display GEMINI_MODEL 'gemini-test-custom-model', got: ${geminiProvider.activeModel}`);
      }

      // 3. Test Agent Enablement Toggling: Disable agent
      const resDisableAgent = await fetch(`${baseUrl}/api/settings/agents/theme_editor_ai_agent?shop=glowthread-apparel.myshopify.com`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false })
      });
      await checkResponse(resDisableAgent);
      
      // Verification: Any Theme Editor route should now return 403 AGENT_DISABLED
      const resDisabledChatList = await fetch(`${baseUrl}/api/agents/theme-editor/conversations?shop=glowthread-apparel.myshopify.com&t=${timestamp}`);
      if (resDisabledChatList.status !== 403) {
        throw new Error(`Expected disabled agent route to reject with 403, got: ${resDisabledChatList.status}`);
      }
      const disabledChatJson = await resDisabledChatList.json();
      if (disabledChatJson.code !== "AGENT_DISABLED") {
        throw new Error(`Expected AGENT_DISABLED code, got: ${JSON.stringify(disabledChatJson)}`);
      }

      // Re-enable agent
      const resEnableAgent = await fetch(`${baseUrl}/api/settings/agents/theme_editor_ai_agent?shop=glowthread-apparel.myshopify.com`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true })
      });
      await checkResponse(resEnableAgent);

      // 4. Test Chat validation for missing shop domain
      const resNoShop = await fetch(`${baseUrl}/api/agents/theme-editor/conversations?t=${timestamp}`);
      if (resNoShop.status !== 400) {
        throw new Error(`Expected missing shop domain to reject with 400, got: ${resNoShop.status}`);
      }
      const noShopJson = await resNoShop.json();
      if (noShopJson.code !== "MISSING_SHOP") {
        throw new Error(`Expected MISSING_SHOP code, got: ${JSON.stringify(noShopJson)}`);
      }

      // 5. Test missing scopes: create theme-scope-mismatch connection
      const mockToken = "mock-token";
      await repos.stores.createStoreConnection({
        id: "store-scope-theme-mismatch",
        organizationId: "demo-org-id",
        storeUrl: "theme-scope-mismatch.myshopify.com",
        accessTokenEncrypted: mockToken,
        scopes: ["read_products"], // missing read_themes and write_themes
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        plan: "Standard Plan",
        currency: "USD"
      });

      await repos.agentInstallations.upsertInstallation({
        id: "store-scope-theme-mismatch_theme_editor_ai_agent",
        organizationId: "demo-org-id",
        storeConnectionId: "store-scope-theme-mismatch",
        shopDomain: "theme-scope-mismatch.myshopify.com",
        agentId: "theme_editor_ai_agent",
        enabled: true,
        allowedTools: []
      });

      const resMissingScopes = await fetch(`${baseUrl}/api/agents/theme-editor/conversations?shop=theme-scope-mismatch.myshopify.com&t=${timestamp}`);
      if (resMissingScopes.status !== 403) {
        throw new Error(`Expected missing scopes to reject with 403, got: ${resMissingScopes.status}`);
      }
      const missingScopesJson = await resMissingScopes.json();
      if (missingScopesJson.code !== "MISSING_READ_THEMES_SCOPE") {
        throw new Error(`Expected MISSING_READ_THEMES_SCOPE code, got: ${JSON.stringify(missingScopesJson)}`);
      }

      // 6. Test Unsafe Asset Paths are rejected early
      // POST Apply path traversal check
      const resUnsafePath = await fetch(`${baseUrl}/api/agents/theme-editor/conversations/conv-test/apply?shop=glowthread-apparel.myshopify.com`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: "mock-theme-dev",
          assetKey: "../templates/secret.json",
          value: "{}"
        })
      });
      if (resUnsafePath.status !== 403) {
        throw new Error(`Expected unsafe path to reject with 403, got: ${resUnsafePath.status}`);
      }
      const unsafeJson = await resUnsafePath.json();
      if (unsafeJson.code !== "UNSAFE_PATH") {
        throw new Error(`Expected UNSAFE_PATH code, got: ${JSON.stringify(unsafeJson)}`);
      }

      // 7. Direct Write Endpoint is disabled / gated
      const resDirectWrite = await fetch(`${baseUrl}/api/theme/assets/update?shop=glowthread-apparel.myshopify.com`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: "mock-theme-dev",
          assetKey: "layout/theme.liquid",
          value: "test"
        })
      });
      if (resDirectWrite.status !== 403) {
        throw new Error(`Expected direct write endpoint to be disabled and return 403, got: ${resDirectWrite.status}`);
      }
      const directWriteJson = await resDirectWrite.json();
      if (directWriteJson.code !== "DIRECT_WRITE_DISABLED") {
        throw new Error(`Expected DIRECT_WRITE_DISABLED, got: ${JSON.stringify(directWriteJson)}`);
      }

      // 8. yambasurf-co-il is NOT treated as mock domain (tries to call Shopify API and fails on bad token)
      const resRealYambaThemes = await fetch(`${baseUrl}/api/theme/themes?shop=yambasurf-co-il.myshopify.com&t=${timestamp}`);
      if (resRealYambaThemes.status !== 500) {
        throw new Error(`Expected real API call with mock token to fail with 500, got: ${resRealYambaThemes.status}`);
      }
      const realYambaJson = await resRealYambaThemes.json();
      if (!realYambaJson.error.includes("Shopify Admin REST API") && !realYambaJson.error.includes("fetch failed")) {
        throw new Error(`Expected REST API fail error, got: ${JSON.stringify(realYambaJson)}`);
      }

      // 9. Apply requires live confirmation for live theme
      const resLiveThemeBlocked = await fetch(`${baseUrl}/api/agents/theme-editor/conversations/conv-test/apply?shop=glowthread-apparel.myshopify.com`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: "mock-theme-active",
          assetKey: "layout/theme.liquid",
          value: "test content",
          isLiveTheme: true,
          liveConfirmation: false
        })
      });
      if (resLiveThemeBlocked.status !== 400) {
        throw new Error(`Expected live theme without confirmation to reject with 400, got: ${resLiveThemeBlocked.status}`);
      }
      const liveBlockedJson = await resLiveThemeBlocked.json();
      if (liveBlockedJson.code !== "LIVE_THEME_CONFIRMATION_REQUIRED") {
        throw new Error(`Expected LIVE_THEME_CONFIRMATION_REQUIRED, got: ${JSON.stringify(liveBlockedJson)}`);
      }

      // 10. Backup is created before write (Glowthread apparel staging apply)
      clearMockBackups();
      
      // Start a real conversation first
      const resStartConv = await fetch(`${baseUrl}/api/agents/theme-editor/conversations?shop=glowthread-apparel.myshopify.com`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      await checkResponse(resStartConv);
      const convData = await resStartConv.json();

      const resApplyMock = await fetch(`${baseUrl}/api/agents/theme-editor/conversations/${convData.id}/apply?shop=glowthread-apparel.myshopify.com`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: "mock-theme-dev",
          assetKey: "layout/theme.liquid",
          value: "new character content value updated by merchant",
          isLiveTheme: false
        })
      });
      await checkResponse(resApplyMock);

      const mockBackups = getMockBackups();
      if (mockBackups.length === 0) {
        throw new Error("Expected pre-write backup snapshot to be created, but mockThemeBackups is empty.");
      }
      const latestBackup = mockBackups[mockBackups.length - 1];
      if (latestBackup.assetKey !== "layout/theme.liquid" || latestBackup.themeId !== "mock-theme-dev") {
        throw new Error(`Expected backup assetKey 'layout/theme.liquid', got: ${latestBackup.assetKey}`);
      }
      if (latestBackup.newValue !== "new character content value updated by merchant") {
        throw new Error(`Expected backup newValue matching target content, got: ${latestBackup.newValue}`);
      }

      console.log("   [TEST Z] Verified settings + team dynamic enabled status, scope gates, direct write blocking, unsafe asset path rejections, yambasurf real API trigger, live warning modals, and backup pre-writes successfully!");
    } finally {
      if (oldGeminiModel === undefined) {
        delete process.env.GEMINI_MODEL;
      } else {
        process.env.GEMINI_MODEL = oldGeminiModel;
      }
    }
  });

  // Summary Printing
  console.log(`\n\x1b[1m\x1b[36m=== SMOKE TEST SUMMARY ===\x1b[0m`);
  for (const t of tests) {
    if (t.status === "PASS") {
      console.log(` \x1b[32m✓\x1b[0m ${t.name}: \x1b[32mPASS\x1b[0m`);
    } else {
      console.log(` \x1b[31m✗\x1b[0m ${t.name}: \x1b[31mFAIL\x1b[0m (${t.error})`);
    }
  }

  console.log(`\n\x1b[1mResults: \x1b[32m${passCount} passed\x1b[0m, \x1b[31m${failCount} failed\x1b[0m, total ${tests.length}\n`);

  let exitCode = 0;
  if (failCount > 0) {
    console.log(`\x1b[1m\x1b[31mSMOKE TEST FAILED!\x1b[0m\n`);
    exitCode = 1;
  } else {
    console.log(`\x1b[1m\x1b[32mSMOKE TEST COMPLETED SUCCESSFULLY!\x1b[0m\n`);
    exitCode = 0;
  }
  
  return exitCode;
} catch (err) {
  console.error("   [SMOKE-TEST] Fatal error encountered during suite execution:", err);
  return 1;
} finally {
  if (localServerInstance) {
    await new Promise((resolve) => {
      localServerInstance.close(() => {
        console.log("   [SMOKE-TEST] Ephemeral in-process local server shutdown completed.");
        resolve();
      });
    });
  }
  if (hasSeededFirestoreFixtures && !isInMemory) {
    console.log("   [SMOKE-TEST] Teardown: Cleaning up seeded Firestore fixtures...");
    try {
      const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
      const repos = getRepositories();
      await repos.proposedActions.deleteProposedAction(uniqueSeoActionId);
      await repos.proposedActions.deleteProposedAction(uniqueCleanupActionId);
      await repos.proposedActions.deleteProposedAction(uniqueReadonlyActionId);
      console.log("   [SMOKE-TEST] Firestore fixtures cleaned up successfully.");
    } catch (err) {
      console.error("   [SMOKE-TEST] Failed to clean up Firestore fixtures:", err.message);
    }
  }
}
}

runSuite().then(code => process.exit(code));

