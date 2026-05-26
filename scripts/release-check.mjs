import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import process from "process";

// 1. Re-spawn self under tsx loader if not already active to enable direct TS imports
if (!process.env.TSX_ACTIVE && !process.argv.includes("--child")) {
  const scriptPath = fileURLToPath(import.meta.url);
  const result = spawnSync("node", ["--import", "tsx", scriptPath, "--child", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, TSX_ACTIVE: "1", REPOSITORY_BACKEND: "memory" }
  });
  process.exit(result.status ?? 1);
}

// Centralized Test Fixtures (Strictly restricted to test environment context)
const TEST_ORGANIZATION_ID = "demo-org-id";
const TEST_SHOP = "yambasurf-co-il.myshopify.com";
const TEST_STORE_CONNECTION_ID = "store-luminary";

// 2. Offline Static Release Verification Logic
console.log(`\n\x1b[1m\x1b[36m=== SOFTIFY SAAS PRE-DEPLOYMENT RELEASE VERIFICATION ===\x1b[0m`);

let passCount = 0;
let failCount = 0;
const tests = [];

async function check(name, fn) {
  console.log(`\x1b[33mVerifying:\x1b[0m ${name}...`);
  try {
    await fn();
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

async function runVerification() {
  // Test 1: Import check for routes and sync services
  await check("1. Module imports (Catalog routes & Shopify sync service)", async () => {
    const catalogRoutes = await import("../src/server/routes/catalog.routes.ts");
    const syncService = await import("../src/server/services/shopify-product-sync.service.ts");
    
    if (!catalogRoutes.default) {
      throw new Error("Catalog routes module does not export a default router.");
    }
    if (typeof syncService.syncProductsForShop !== "function") {
      throw new Error("Shopify sync service does not export syncProductsForShop function.");
    }
  });

  // Test 2: Product limit normalization bounds validation
  await check("2. Product limit normalization behavior", async () => {
    const { normalizeProductsLimit } = await import("../src/server/services/shopify-admin-client.service.ts");
    
    // Bounds validation
    if (normalizeProductsLimit(500) !== 50) throw new Error(`Capping 500 should return 50, got ${normalizeProductsLimit(500)}`);
    if (normalizeProductsLimit(-10) !== 1) throw new Error(`Floor bounds -10 should return 1, got ${normalizeProductsLimit(-10)}`);
    if (normalizeProductsLimit(25.7) !== 25) throw new Error(`Decimals 25.7 should return Math.floor 25, got ${normalizeProductsLimit(25.7)}`);
    
    // Non-numeric / NaN / Infinity fallbacks
    if (normalizeProductsLimit(undefined) !== 20) throw new Error("Undefined fallback should return 20");
    if (normalizeProductsLimit(null) !== 20) throw new Error("Null fallback should return 20");
    if (normalizeProductsLimit(NaN) !== 20) throw new Error("NaN fallback should return 20");
    if (normalizeProductsLimit(Infinity) !== 20) throw new Error("Infinity fallback should return 20");
    if (normalizeProductsLimit("abc") !== 20) throw new Error("String fallback should return 20");
  });

  // Test 3: Repository Provider Products contract exposure validation
  await check("3. Repository provider contract exposure for products", async () => {
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const repos = getRepositories();
    
    if (!repos.products) {
      throw new Error("Repository provider is missing 'products' repository reference.");
    }
    
    const requiredMethods = [
      "upsertProductSnapshot",
      "listProductSnapshotsByShop",
      "countProductSnapshotsByShop",
      "getLatestProductSyncAt",
      "deleteProductSnapshotsByShop"
    ];
    
    for (const method of requiredMethods) {
      if (typeof repos.products[method] !== "function") {
        throw new Error(`Products repository is missing required operation: '${method}'`);
      }
    }
  });

  // Test 4: In-memory repository operations simulation
  await check("4. In-memory products repository CRUD operations simulation", async () => {
    const inMemoryProducts = await import("../src/server/repositories/in-memory/in-memory-product.repository.ts");
    await inMemoryProducts.clearProductSnapshots();

    const testShop = "release-test-shop.myshopify.com";
    const now = new Date().toISOString();
    
    const testSnapshot = {
      id: `${testShop}_prod123`,
      organizationId: "org-release-123",
      storeConnectionId: "conn-release-123",
      shopDomain: testShop,
      shopifyProductId: "prod123",
      title: "Release Verification Jacket",
      handle: "release-verification-jacket",
      status: "ACTIVE",
      tags: ["verification", "test"],
      variantsCount: 3,
      imagesCount: 2,
      createdAt: now,
      updatedAt: now,
      syncedAt: now
    };

    // Upsert
    const upserted = await inMemoryProducts.upsertProductSnapshot(testSnapshot);
    if (upserted.id !== testSnapshot.id) throw new Error("Upsert returned incorrect product snapshot ID.");

    // Count
    const count = await inMemoryProducts.countProductSnapshotsByShop(testShop);
    if (count !== 1) throw new Error(`Expected 1 snapshot, got ${count}`);

    // List
    const list = await inMemoryProducts.listProductSnapshotsByShop(testShop, 10);
    if (list.length !== 1) throw new Error(`List size expected 1, got ${list.length}`);
    if (list[0].shopifyProductId !== "prod123") throw new Error("List contents are incorrect.");

    // Latest sync timestamp
    const syncAt = await inMemoryProducts.getLatestProductSyncAt(testShop);
    if (!syncAt) throw new Error("Latest product sync timestamp is missing.");

    // Deletion
    await inMemoryProducts.deleteProductSnapshotsByShop(testShop);
    const countAfter = await inMemoryProducts.countProductSnapshotsByShop(testShop);
    if (countAfter !== 0) throw new Error(`Expected 0 snapshots after deletion, got ${countAfter}`);
  });

  // Test 5: Token security scan of product snapshots
  await check("5. ProductSnapshot public shape security token scan", async () => {
    const inMemoryProducts = await import("../src/server/repositories/in-memory/in-memory-product.repository.ts");
    await inMemoryProducts.clearProductSnapshots();

    const testShop = "token-test-shop.myshopify.com";
    const now = new Date().toISOString();
    
    const snapshot = {
      id: `${testShop}_prod999`,
      organizationId: "org-token-999",
      storeConnectionId: "conn-token-999",
      shopDomain: testShop,
      shopifyProductId: "prod999",
      title: "Security Verified T-Shirt",
      handle: "security-verified-t-shirt",
      status: "ACTIVE",
      tags: ["security"],
      variantsCount: 1,
      imagesCount: 1,
      createdAt: now,
      updatedAt: now,
      syncedAt: now
    };

    const saved = await inMemoryProducts.upsertProductSnapshot(snapshot);
    scanForForbiddenKeys(saved);
  });

  // Test 6: ProductSnapshot optional fields sanitization validation
  await check("6. ProductSnapshot optional fields sanitization validation", async () => {
    const { removeUndefinedValues } = await import("../src/server/repositories/firestore/firestore-product.repository.ts");
    
    const testSnapshot = {
      id: "sanitize-shop_prod1",
      organizationId: "org-sanitize-1",
      storeConnectionId: "conn-sanitize-1",
      shopDomain: "sanitize-shop.myshopify.com",
      shopifyProductId: "prod1",
      title: "Sanitize Test Product",
      handle: "sanitize-test-product",
      status: "ACTIVE",
      vendor: undefined, // undefined optional
      productType: null, // nullable optional
      tags: ["sanitize"],
      variantsCount: 2,
      imagesCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString()
    };

    const sanitized = removeUndefinedValues(testSnapshot);

    // Ensure undefined field was removed
    if ("vendor" in sanitized) {
      throw new Error("Sanitization failed: 'vendor' key with undefined value was not removed.");
    }
    // Ensure null field was kept
    if (sanitized.productType !== null) {
      throw new Error(`Sanitization failed: 'productType' should be null, got: ${sanitized.productType}`);
    }

    // Double check token security on sanitized object
    scanForForbiddenKeys(sanitized);
  });

  // Test 7: AI Provider Factory, Mock AI Provider, and Agent Runtime Imports
  await check("7. AI Provider Factory, Mock AI Provider, and Agent Runtime Imports", async () => {
    const { getAiProvider } = await import("../src/server/ai/ai-provider.factory.ts");
    const { MockAiProvider } = await import("../src/server/ai/mock-ai.provider.ts");
    const { runAgentChat } = await import("../src/server/services/agent-runtime.service.ts");

    if (typeof getAiProvider !== "function") throw new Error("getAiProvider is not a function.");
    if (typeof runAgentChat !== "function") throw new Error("runAgentChat is not a function.");

    const provider = getAiProvider("mock");
    if (provider.name !== "mock") throw new Error(`Expected mock provider name, got: ${provider.name}`);

    // Verify Mock provider behavior A (catalog/read queries returns tool call)
    const readResponse = await provider.generate({
      agentId: "agent_product_intelligence",
      shop: "test-shop.myshopify.com",
      message: "How many products are synced?",
      allowedTools: ["catalog.products.summary"]
    });

    if (readResponse.type !== "tool_call" || readResponse.toolName !== "catalog.products.summary") {
      throw new Error(`Expected catalog.products.summary tool call, got: ${JSON.stringify(readResponse)}`);
    }

    // Verify Mock provider behavior B (write queries returns read-only refusal)
    const writeResponse = await provider.generate({
      agentId: "agent_product_intelligence",
      shop: "test-shop.myshopify.com",
      message: "Update all product titles",
      allowedTools: ["catalog.products.summary"]
    });

    if (writeResponse.type !== "final") {
      throw new Error(`Expected final answer for write intent, got: ${JSON.stringify(writeResponse)}`);
    }
    if (!writeResponse.message.toLowerCase().includes("read-only") && !writeResponse.message.toLowerCase().includes("cannot")) {
      throw new Error(`Expected refusal message, got: ${writeResponse.message}`);
    }
  });

  // Test 8: Tool Gateway recursive sanitization validation
  await check("8. Tool Gateway recursive sanitization validation", async () => {
    const { sanitizeResult } = await import("../src/server/tools/tool-gateway.ts");

    const sensitiveObject = {
      id: "prod_1",
      title: "Test Shirt",
      accessToken: "secret-token-123",
      access_token: "secret-token-456",
      accessTokenEncrypted: "encrypted-abc",
      refreshToken: "refresh-abc",
      apiKey: "key-123",
      secret: "pass-abc",
      password: "pass",
      credentials: {
        privateKey: "private-abc",
        bearer: "bearer-abc"
      },
      authorization: "Bearer secret",
      nestedList: [
        {
          id: "nested_1",
          token: "secret-token"
        }
      ]
    };

    const sanitized = sanitizeResult(sensitiveObject);

    // Scan for forbidden fields explicitly
    const scanKeys = (obj) => {
      if (obj === null || obj === undefined) return;
      if (Array.isArray(obj)) {
        obj.forEach(scanKeys);
        return;
      }
      if (typeof obj === "object") {
        const forbiddenKeys = [
          "accesstoken", "access_token", "accesstokenencrypted", "refreshtoken",
          "apikey", "api_key", "secret", "password", "credential", "credentials",
          "token", "privatekey", "authorization", "bearer"
        ];
        for (const [key, val] of Object.entries(obj)) {
          const lowerKey = key.toLowerCase();
          const isForbidden = forbiddenKeys.some(f => lowerKey.includes(f));
          if (isForbidden) {
            throw new Error(`Forbidden key "${key}" was not removed by recursive sanitization.`);
          }
          scanKeys(val);
        }
      }
    };

    scanKeys(sanitized);

    // Validate non-sensitive keys are kept
    if (sanitized.id !== "prod_1") throw new Error("Sanitization removed valid ID field.");
    if (sanitized.title !== "Test Shirt") throw new Error("Sanitization removed valid title field.");
  });

  // Test 9: getDemoPlatformContext static imports scan
  await check("9. getDemoPlatformContext imports scan", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    const runtimePath = path.resolve(process.cwd(), "src/server/services/agent-runtime.service.ts");
    const resolverPath = path.resolve(process.cwd(), "src/server/services/platform-context-resolver.service.ts");
    
    const runtimeContent = fs.readFileSync(runtimePath, "utf8");
    const resolverContent = fs.readFileSync(resolverPath, "utf8");
    
    if (runtimeContent.includes("getDemoPlatformContext")) {
      throw new Error("Security Violation: agent-runtime.service.ts imports getDemoPlatformContext");
    }
    if (resolverContent.includes("getDemoPlatformContext")) {
      throw new Error("Security Violation: platform-context-resolver.service.ts imports getDemoPlatformContext");
    }
  });

  // Test 10: Static Agent Registry allowed tools validation
  await check("10. Static Agent Registry allowed tools validation", async () => {
    const { AGENT_PRODUCT_INTELLIGENCE, getAgentDefinition } = await import("../src/server/agents/agent-definitions.ts");
    
    if (!AGENT_PRODUCT_INTELLIGENCE) {
      throw new Error("Static Agent AGENT_PRODUCT_INTELLIGENCE is not defined.");
    }
    if (AGENT_PRODUCT_INTELLIGENCE.id !== "agent_product_intelligence") {
      throw new Error(`Expected ID agent_product_intelligence, got ${AGENT_PRODUCT_INTELLIGENCE.id}`);
    }
    
    const resolvedAgent = getAgentDefinition("agent_product_intelligence");
    if (!resolvedAgent || resolvedAgent.id !== "agent_product_intelligence") {
      throw new Error("Failed to resolve static agent from getAgentDefinition.");
    }
    
    const forbiddenRegistryTools = resolvedAgent.allowedTools.filter(t => !t.startsWith("catalog.products.") && !t.startsWith("catalog.insights."));
    if (forbiddenRegistryTools.length > 0) {
      throw new Error(`Security Violation: Agent allowed tools contains forbidden non-read-only tools: ${forbiddenRegistryTools.join(", ")}`);
    }
  });

  // Test 11: Platform Context Resolver rejections and scope validation
  await check("11. Platform Context Resolver rejections and scope validation", async () => {
    const { resolvePlatformContext } = await import("../src/server/services/platform-context-resolver.service.ts");
    const inMemoryStore = await import("../src/server/repositories/in-memory/in-memory-store.repository.ts");
    
    await inMemoryStore.clearStoreConnections();
    
    const testShop = "resolver-test-shop.myshopify.com";
    
    // Create disconnected store
    const connInfo = {
      id: "conn_resolver_test",
      organizationId: "org_resolver_test",
      storeUrl: testShop,
      scopes: ["read_products"],
      status: "DISCONNECTED",
      plan: "Standard Plan",
      currency: "USD"
    };
    await inMemoryStore.createStoreConnection(connInfo);
    
    // Set up mock request headers for dev-bypass
    const bypassHeaders = {
      "x-softify-dev-bypass": "test-bypass-secret"
    };
    
    process.env.SOFTIFY_ALLOW_AGENT_DEV_BYPASS = "true";
    process.env.SOFTIFY_AGENT_DEV_BYPASS_SECRET = "test-bypass-secret";
    
    // Verify disconnected rejection (409)
    try {
      await resolvePlatformContext({
        shop: testShop,
        agentId: "agent_product_intelligence",
        request: { headers: bypassHeaders }
      });
      throw new Error("Resolver should have rejected disconnected store.");
    } catch (err) {
      if (err.httpStatus !== 409 || err.code !== "DISCONNECTED_SHOP") {
        throw new Error(`Expected DISCONNECTED_SHOP (409) error, got: ${err.code} (${err.httpStatus})`);
      }
    }
    
    // Update store status to CONNECTED
    await inMemoryStore.updateStoreConnection("conn_resolver_test", { status: "CONNECTED" });
    
    // Verify unknown agent rejection (404)
    try {
      await resolvePlatformContext({
        shop: testShop,
        agentId: "non_existent_agent",
        request: { headers: bypassHeaders }
      });
      throw new Error("Resolver should have rejected unknown agent.");
    } catch (err) {
      if (err.httpStatus !== 404 || err.code !== "UNKNOWN_AGENT") {
        throw new Error(`Expected UNKNOWN_AGENT (404) error, got: ${err.code} (${err.httpStatus})`);
      }
    }
    
    // Verify missing scopes rejection (403) by removing scopes from store
    await inMemoryStore.updateStoreConnection("conn_resolver_test", { scopes: [] });
    try {
      await resolvePlatformContext({
        shop: testShop,
        agentId: "agent_product_intelligence",
        request: { headers: bypassHeaders }
      });
      throw new Error("Resolver should have rejected missing scopes.");
    } catch (err) {
      if (err.httpStatus !== 403 || err.code !== "MISSING_REQUIRED_SCOPES") {
        throw new Error(`Expected MISSING_REQUIRED_SCOPES (403) error, got: ${err.code} (${err.httpStatus})`);
      }
    }
    
    // Restore scopes and test successful resolve
    const inMemoryAgentInstallations = await import("../src/server/repositories/in-memory/in-memory-agent-installation.repository.js");
    await inMemoryAgentInstallations.clearAgentInstallations();
    await inMemoryAgentInstallations.upsertInstallation({
      id: "conn_resolver_test_agent_product_intelligence",
      organizationId: "org_resolver_test",
      storeConnectionId: "conn_resolver_test",
      shopDomain: testShop,
      agentId: "agent_product_intelligence",
      enabled: true,
      allowedTools: ["catalog.products.status", "catalog.products.summary", "catalog.products.read", "catalog.products.list"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await inMemoryStore.updateStoreConnection("conn_resolver_test", { scopes: ["read_products"] });
    const context = await resolvePlatformContext({
      shop: testShop,
      agentId: "agent_product_intelligence",
      request: { headers: bypassHeaders }
    });
    
    if (context.storeConnection.id !== "conn_resolver_test") {
      throw new Error("Resolver returned incorrect store connection.");
    }
    if (context.currentOrganization.id !== "org_resolver_test") {
      throw new Error(`Derive currentOrganization.id failed: expected org_resolver_test, got ${context.currentOrganization.id}`);
    }
  });

  // Test 12: Validate that scripts/smoke-test.mjs contains "X-Softify-Dev-Bypass"
  await check("12. smoke-test.mjs contains X-Softify-Dev-Bypass header", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const smokePath = path.resolve(process.cwd(), "scripts/smoke-test.mjs");
    const content = fs.readFileSync(smokePath, "utf8");
    if (!content.includes("X-Softify-Dev-Bypass")) {
      throw new Error("scripts/smoke-test.mjs is missing 'X-Softify-Dev-Bypass' header reference.");
    }
  });

  // Test 13: Validate that scripts/smoke-test.mjs reads "SOFTIFY_AGENT_DEV_BYPASS_SECRET"
  await check("13. smoke-test.mjs reads SOFTIFY_AGENT_DEV_BYPASS_SECRET", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const smokePath = path.resolve(process.cwd(), "scripts/smoke-test.mjs");
    const content = fs.readFileSync(smokePath, "utf8");
    if (!content.includes("SOFTIFY_AGENT_DEV_BYPASS_SECRET")) {
      throw new Error("scripts/smoke-test.mjs is missing 'SOFTIFY_AGENT_DEV_BYPASS_SECRET' environment variable reference.");
    }
  });

  // Test 14: Validate that .github/workflows/deploy-cloud-run.yml contains "SOFTIFY_AGENT_DEV_BYPASS_SECRET"
  await check("14. deploy-cloud-run.yml contains SOFTIFY_AGENT_DEV_BYPASS_SECRET", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("SOFTIFY_AGENT_DEV_BYPASS_SECRET")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing 'SOFTIFY_AGENT_DEV_BYPASS_SECRET' secret propagation reference.");
    }
  });

  // Test 15: Validate that .github/workflows/deploy-cloud-run.yml validates "Missing secret: SOFTIFY_AGENT_DEV_BYPASS_SECRET"
  await check("15. deploy-cloud-run.yml validates Missing secret: SOFTIFY_AGENT_DEV_BYPASS_SECRET", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("Missing secret: SOFTIFY_AGENT_DEV_BYPASS_SECRET")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing 'Missing secret: SOFTIFY_AGENT_DEV_BYPASS_SECRET' check.");
    }
  });

  // Test 16: Validate that .github/workflows/deploy-cloud-run.yml configures "SOFTIFY_ALLOW_AGENT_DEV_BYPASS=true"
  await check("16. deploy-cloud-run.yml configures SOFTIFY_ALLOW_AGENT_DEV_BYPASS=true", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("SOFTIFY_ALLOW_AGENT_DEV_BYPASS=true")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing Cloud Run deployment config flag for 'SOFTIFY_ALLOW_AGENT_DEV_BYPASS=true'.");
    }
  });

  // Test 17: Validate diagnostics router is imported and mounted in app.ts
  await check("17. diagnostics router is imported and mounted in app.ts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const appPath = path.resolve(process.cwd(), "src/server/app.ts");
    const content = fs.readFileSync(appPath, "utf8");
    if (!content.includes("diagnostics.routes.js")) {
      throw new Error("src/server/app.ts is missing 'diagnostics.routes.js' import.");
    }
    if (!content.includes("app.use(\"/api\", diagnosticsRoutes)")) {
      throw new Error("src/server/app.ts is missing '/api' mount for diagnosticsRoutes.");
    }
  });

  // Test 18: Validate that .github/workflows/deploy-cloud-run.yml contains gcloud secrets describe SHOPIFY_API_SECRET
  await check("18. deploy-cloud-run.yml contains gcloud secrets describe SHOPIFY_API_SECRET", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("gcloud secrets describe SHOPIFY_API_SECRET")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing 'gcloud secrets describe SHOPIFY_API_SECRET'.");
    }
  });

  // Test 19: Validate that .github/workflows/deploy-cloud-run.yml contains gcloud secrets describe SHOPIFY_TOKEN_ENCRYPTION_KEY
  await check("19. deploy-cloud-run.yml contains gcloud secrets describe SHOPIFY_TOKEN_ENCRYPTION_KEY", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("gcloud secrets describe SHOPIFY_TOKEN_ENCRYPTION_KEY")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing 'gcloud secrets describe SHOPIFY_TOKEN_ENCRYPTION_KEY'.");
    }
  });

  // Test 20: Validate that .github/workflows/deploy-cloud-run.yml contains gcloud secrets describe SOFTIFY_AGENT_DEV_BYPASS_SECRET
  await check("20. deploy-cloud-run.yml contains gcloud secrets describe SOFTIFY_AGENT_DEV_BYPASS_SECRET", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("gcloud secrets describe SOFTIFY_AGENT_DEV_BYPASS_SECRET")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing 'gcloud secrets describe SOFTIFY_AGENT_DEV_BYPASS_SECRET'.");
    }
  });

  // Test 21: Validate that .github/workflows/deploy-cloud-run.yml does not require SHOPIFY_API_SECRET as GitHub secret if using --set-secrets
  await check("21. deploy-cloud-run.yml does not require SHOPIFY_API_SECRET as GitHub secret if using --set-secrets", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (content.includes("--set-secrets")) {
      if (content.includes('test -n "${{ secrets.SHOPIFY_API_SECRET }}"')) {
        throw new Error(".github/workflows/deploy-cloud-run.yml requires 'SHOPIFY_API_SECRET' as GitHub secret via test -n check.");
      }
    }
  });

  // Test 22: Validate that .github/workflows/deploy-cloud-run.yml does not require SHOPIFY_TOKEN_ENCRYPTION_KEY as GitHub secret if using --set-secrets
  await check("22. deploy-cloud-run.yml does not require SHOPIFY_TOKEN_ENCRYPTION_KEY as GitHub secret if using --set-secrets", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (content.includes("--set-secrets")) {
      if (content.includes('test -n "${{ secrets.SHOPIFY_TOKEN_ENCRYPTION_KEY }}"')) {
        throw new Error(".github/workflows/deploy-cloud-run.yml requires 'SHOPIFY_TOKEN_ENCRYPTION_KEY' as GitHub secret via test -n check.");
      }
    }
  });

  // Test 23: Validate that .github/workflows/deploy-cloud-run.yml uses gcloud custom delimiter syntax "^|^" for --set-env-vars
  await check("23. deploy-cloud-run.yml uses gcloud custom delimiter syntax ^|^ for --set-env-vars", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const workflowPath = path.resolve(process.cwd(), ".github/workflows/deploy-cloud-run.yml");
    const content = fs.readFileSync(workflowPath, "utf8");
    if (!content.includes("--set-env-vars=^|^")) {
      throw new Error(".github/workflows/deploy-cloud-run.yml is missing custom delimiter syntax '^|^' for --set-env-vars.");
    }
  });

  // Test 24: Validate Agent Installation repository contract imports
  await check("24. Agent Installation Repository Contract imports", async () => {
    const contract = await import("../src/server/repositories/contracts/agent-installation.repository.contract.ts");
    if (!contract) {
      throw new Error("Failed to import agent-installation.repository.contract.ts");
    }
  });

  // Test 25: Validate Firestore agent installation repository exists and can be imported
  await check("25. Firestore Agent Installation Repository imports", async () => {
    const firestoreRepo = await import("../src/server/repositories/firestore/firestore-agent-installation.repository.ts");
    if (typeof firestoreRepo.getByShopAndAgent !== "function" || typeof firestoreRepo.upsertInstallation !== "function") {
      throw new Error("firestore-agent-installation.repository.ts does not export getByShopAndAgent or upsertInstallation as functions.");
    }
  });

  // Test 26: Validate repository provider exposes agentInstallations repository reference
  await check("26. Repository provider exposes agentInstallations reference", async () => {
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const repos = getRepositories();
    if (!repos.agentInstallations) {
      throw new Error("Repository provider is missing 'agentInstallations' repository reference.");
    }
    if (typeof repos.agentInstallations.getByShopAndAgent !== "function") {
      throw new Error("Exposed agentInstallations repository is missing getByShopAndAgent function.");
    }
    if (typeof repos.agentInstallations.upsertInstallation !== "function") {
      throw new Error("Exposed agentInstallations repository is missing upsertInstallation function.");
    }
  });

  // Test 27: Validate platform-context-resolver looks up and validates installations
  await check("27. platform-context-resolver references agent installation lookup and rejects invalid states", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const resolverPath = path.resolve(process.cwd(), "src/server/services/platform-context-resolver.service.ts");
    const content = fs.readFileSync(resolverPath, "utf8");
    
    if (!content.includes("getByShopAndAgent")) {
      throw new Error("platform-context-resolver.service.ts does not call 'getByShopAndAgent'.");
    }
    if (!content.includes("AGENT_NOT_INSTALLED")) {
      throw new Error("platform-context-resolver.service.ts does not reject with 'AGENT_NOT_INSTALLED'.");
    }
    if (!content.includes("AGENT_DISABLED")) {
      throw new Error("platform-context-resolver.service.ts does not reject with 'AGENT_DISABLED'.");
    }
    if (!content.includes("AGENT_INSTALLATION_INVALID")) {
      throw new Error("platform-context-resolver.service.ts does not reject with 'AGENT_INSTALLATION_INVALID'.");
    }
  });

  // Test 28: Validate that no write/mutation tools are added in tool definitions
  await check("28. No write tools, product update tools, or mutation tools exist", async () => {
    const { ENABLED_TOOLS } = await import("../src/server/tools/tool-definitions.ts");
    const preExistingAllowed = ["shopify.prepareProductUpdate", "shopify.prepareThemePatch", "catalog.products.propose_update"];
    const forbiddenKeywords = ["write", "delete", "create", "mutate", "inventory", "publish", "unpublish"];
    
    for (const tool of ENABLED_TOOLS) {
      if (preExistingAllowed.includes(tool.name)) continue;
      
      const lowerName = tool.name.toLowerCase();
      const isForbidden = forbiddenKeywords.some(kw => lowerName.includes(kw));
      if (isForbidden) {
        throw new Error(`Security Violation: Forbidden tool name detected: '${tool.name}'`);
      }
    }
  });

  // Test 29: Validate catalog-insights.service imports successfully
  await check("29. catalog-insights.service imports successfully", async () => {
    const service = await import("../src/server/services/catalog-insights.service.ts");
    if (typeof service.getCatalogHealth !== "function" || typeof service.getProductsMissingImages !== "function" || typeof service.getVendorSummary !== "function") {
      throw new Error("catalog-insights.service.ts is missing required insight methods.");
    }
  });

  // Test 30: Validate registration of new catalog.insights.* tools in tool definitions and agent definition
  await check("30. Registration of catalog.insights.* tools in definitions", async () => {
    const { ENABLED_TOOLS } = await import("../src/server/tools/tool-definitions.ts");
    const { AGENT_PRODUCT_INTELLIGENCE } = await import("../src/server/agents/agent-definitions.ts");
    
    const requiredTools = [
      "catalog.insights.health",
      "catalog.insights.missing_images",
      "catalog.insights.missing_vendor",
      "catalog.insights.missing_product_type",
      "catalog.insights.vendor_summary",
      "catalog.insights.product_type_summary",
      "catalog.insights.stale_snapshots"
    ];

    for (const tool of requiredTools) {
      const isRegistered = ENABLED_TOOLS.some(t => t.name === tool);
      if (!isRegistered) {
        throw new Error(`Tool definitions are missing tool: '${tool}'`);
      }
      const isAllowedByAgent = AGENT_PRODUCT_INTELLIGENCE.allowedTools.includes(tool);
      if (!isAllowedByAgent) {
        throw new Error(`AGENT_PRODUCT_INTELLIGENCE is missing allowedTool: '${tool}'`);
      }
    }
  });

  // Test 31: Validate mock provider maps catalog health question to catalog.insights.health
  await check("31. Mock AI Provider maps catalog health queries to catalog.insights.health", async () => {
    const { MockAiProvider } = await import("../src/server/ai/mock-ai.provider.ts");
    const provider = new MockAiProvider();
    
    const res = await provider.generate({
      agentId: "agent_product_intelligence",
      shop: "test-shop.myshopify.com",
      message: "What is the health of my catalog?",
      allowedTools: []
    });

    if (res.type !== "tool_call" || res.toolName !== "catalog.insights.health") {
      throw new Error(`Expected catalog.insights.health tool call, got: ${JSON.stringify(res)}`);
    }
  });

  // Test 32: Validate smoke-test.mjs contains catalog health, missing images, and vendor summary validations
  await check("32. smoke-test.mjs includes catalog health, missing images, and vendor summary validations", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const smokePath = path.resolve(process.cwd(), "scripts/smoke-test.mjs");
    const content = fs.readFileSync(smokePath, "utf8");
    
    if (!content.includes("catalog.insights.health")) {
      throw new Error("smoke-test.mjs is missing 'catalog.insights.health' validation.");
    }
    if (!content.includes("catalog.insights.missing_images")) {
      throw new Error("smoke-test.mjs is missing 'catalog.insights.missing_images' validation.");
    }
    if (!content.includes("catalog.insights.vendor_summary")) {
      throw new Error("smoke-test.mjs is missing 'catalog.insights.vendor_summary' validation.");
    }
  });

  // Test 33: Validate firestore-audit.repository imports successfully
  await check("33. firestore-audit.repository imports successfully", async () => {
    const firestoreRepo = await import("../src/server/repositories/firestore/firestore-audit.repository.ts");
    if (typeof firestoreRepo.createAuditEvent !== "function" || typeof firestoreRepo.getAuditEventsByOrganizationId !== "function") {
      throw new Error("firestore-audit.repository.ts is missing critical contract operations.");
    }
  });

  // Test 34: Validate repository provider exposes audit repository reference
  await check("34. Repository provider exposes audit reference", async () => {
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const repos = getRepositories();
    if (!repos.audit) {
      throw new Error("Repository provider is missing 'audit' repository reference.");
    }
    if (typeof repos.audit.createAuditEvent !== "function") {
      throw new Error("Exposed audit repository is missing createAuditEvent function.");
    }
  });

  // Test 35: Centralized sanitizeAuditPayload allowlist filters credentials, secrets, raw Shopify details, and raw query messages
  await check("35. Centralized sanitizeAuditPayload allowlist filters credentials, secrets, raw Shopify details, and raw query messages", async () => {
    const { sanitizeAuditPayload } = await import("../src/server/services/audit-log.service.ts");
    const highRiskPayload = {
      id: "LOG-999",
      organizationId: "org-abc",
      accessToken: "secret-token",
      apiKey: "secret-key",
      customer: { name: "John Doe", email: "john@example.com", phone: "123456" },
      rawShopifyResponse: { status: "ACTIVE", token: "x" },
      rawUserQuery: "Select all products...",
      messageLength: 200,
      toolName: "catalog.products.status"
    };

    const sanitized = sanitizeAuditPayload(highRiskPayload);

    // Allowlisted keys must be present and match
    if (sanitized.organizationId !== "org-abc") throw new Error("Allowlist key organizationId was incorrectly modified.");
    if (sanitized.messageLength !== 200) throw new Error("Allowlist key messageLength was incorrectly modified.");
    if (sanitized.toolName !== "catalog.products.status") throw new Error("Allowlist key toolName was incorrectly modified.");

    // Non-allowlisted/high-risk keys must be redacted
    if (!sanitized.accessToken.includes("[REDACTED")) throw new Error("Sanitization failed: accessToken was not redacted.");
    if (!sanitized.apiKey.includes("[REDACTED")) throw new Error("Sanitization failed: apiKey was not redacted.");
    if (!sanitized.customer.includes("[REDACTED")) throw new Error("Sanitization failed: customer object was not redacted.");
    if (!sanitized.rawShopifyResponse.includes("[REDACTED")) throw new Error("Sanitization failed: rawShopifyResponse was not redacted.");
    if (!sanitized.rawUserQuery.includes("[REDACTED")) throw new Error("Sanitization failed: rawUserQuery was not redacted.");
  });

  // Test 36: No token/secret exposure inside logged events
  await check("36. No token/secret exposure inside logged events", async () => {
    const { writeLog, getAuditLogs } = await import("../src/server/services/audit-log.service.ts");
    writeLog("Test Initiator", "TEST_EVENT", "Testing log security", {
      organizationId: "demo-org-id",
      accessToken: "exposed-token",
      shopifyToken: "exposed",
      secret: "pass",
      customer: { email: "j@j.com" }
    });

    const logs = getAuditLogs("demo-org-id");
    const testLog = logs.find(l => l.event === "TEST_EVENT");
    if (!testLog) throw new Error("Failed to find logged test event.");

    const meta = testLog.metadata;
    if (meta.accessToken && !meta.accessToken.includes("[REDACTED")) throw new Error("Exposed raw accessToken in metadata.");
    if (meta.secret && !meta.secret.includes("[REDACTED")) throw new Error("Exposed raw secret in metadata.");
    if (meta.customer && !meta.customer.includes("[REDACTED")) throw new Error("Exposed raw customer in metadata.");
  });

  // Test 37: Firestore approval repository contract compliance check
  await check("37. Firestore approval repository contract compliance check", async () => {
    const firestoreRepo = await import("../src/server/repositories/firestore/firestore-approval.repository.ts");
    if (!firestoreRepo.getApprovalById) throw new Error("Missing getApprovalById implementation in Firestore approvals repo.");
    if (!firestoreRepo.getApprovalsByOrganizationId) throw new Error("Missing getApprovalsByOrganizationId implementation in Firestore approvals repo.");
    if (!firestoreRepo.createApprovalRequest) throw new Error("Missing createApprovalRequest implementation in Firestore approvals repo.");
    if (!firestoreRepo.updateApprovalRequest) throw new Error("Missing updateApprovalRequest implementation in Firestore approvals repo.");
  });

  // Test 38: Repository provider contract wireup check
  await check("38. Repository provider contract wireup check", async () => {
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const repos = getRepositories();
    if (!repos.approvals) throw new Error("Repository provider does not expose approvals reference.");
  });

  // Test 39: Tool definitions proposal-only mutation tool registration check
  await check("39. Tool definitions proposal-only mutation tool registration check", async () => {
    const { ENABLED_TOOLS } = await import("../src/server/tools/tool-definitions.ts");
    const proposeProduct = ENABLED_TOOLS.find(t => t.name === "catalog.products.propose_update");
    if (!proposeProduct) throw new Error("Missing catalog.products.propose_update in ENABLED_TOOLS definitions.");
    if (proposeProduct.riskLevel !== "Medium") throw new Error(`Incorrect risk level for product proposal tool: ${proposeProduct.riskLevel}`);
    if (proposeProduct.requiredScope !== "read_products") throw new Error(`Incorrect scope for product proposal tool: ${proposeProduct.requiredScope}`);

    const patchTheme = ENABLED_TOOLS.find(t => t.name === "theme.assets.patch");
    if (patchTheme) throw new Error("Security Violation: theme.assets.patch must not be registered in Phase 10.6.");
  });

  // Test 40: Verify theme patching is completely absent from tools and gateway
  await check("40. theme.assets.patch and shopify.prepareThemePatch must not be registered or executed", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    const defsPath = path.resolve(process.cwd(), "src/server/tools/tool-definitions.ts");
    const gatewayPath = path.resolve(process.cwd(), "src/server/tools/tool-gateway.ts");
    
    const defsContent = fs.readFileSync(defsPath, "utf8");
    const gatewayContent = fs.readFileSync(gatewayPath, "utf8");
    
    if (defsContent.includes("theme.assets.patch") || defsContent.includes("shopify.prepareThemePatch")) {
      throw new Error("Security Violation: Legacy theme patch tools registered in definitions.");
    }
    if (gatewayContent.includes("theme.assets.patch") || gatewayContent.includes("shopify.prepareThemePatch")) {
      throw new Error("Security Violation: Legacy theme patch references in gateway execution.");
    }
  });

  // Test 41: Verify legacy prepareProductUpdate is not enabled
  await check("41. shopify.prepareProductUpdate must not be enabled or create legacy approvals", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    const defsPath = path.resolve(process.cwd(), "src/server/tools/tool-definitions.ts");
    const defsContent = fs.readFileSync(defsPath, "utf8");
    if (defsContent.includes("shopify.prepareProductUpdate")) {
      throw new Error("Security Violation: shopify.prepareProductUpdate is still registered.");
    }
    
    const gatewayPath = path.resolve(process.cwd(), "src/server/tools/tool-gateway.ts");
    const gatewayContent = fs.readFileSync(gatewayPath, "utf8");
    if (gatewayContent.includes("shopify.prepareProductUpdate")) {
      throw new Error("Security Violation: shopify.prepareProductUpdate is referenced in gateway code.");
    }
  });

  // Test 42: Verify decide routes contain zero execution capabilities
  await check("42. setMockProducts, setActiveThemeCode, and upsertProductSnapshot must be unreachable from approvals decide routes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routesPath = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    const content = fs.readFileSync(routesPath, "utf8");
    
    if (content.includes("setMockProducts")) {
      throw new Error("Security Violation: setMockProducts is referenced in approvals routes.");
    }
    if (content.includes("setActiveThemeCode")) {
      throw new Error("Security Violation: setActiveThemeCode is referenced in approvals routes.");
    }
    if (content.includes("upsertProductSnapshot")) {
      throw new Error("Security Violation: upsertProductSnapshot is referenced in approvals routes.");
    }
  });

  // Test 43: No REST Admin write path in codebase
  await check("43. No REST Admin write path in codebase", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const clientPath = path.resolve(process.cwd(), "src/server/services/shopify-admin-client.service.ts");
    const content = fs.readFileSync(clientPath, "utf8");
    if (content.includes("admin/api") && content.includes(".json") && (content.includes("PUT") || content.includes("method: \"PUT\"") || content.includes("method: 'PUT'"))) {
      throw new Error("REST API product update method detected inside shopify-admin-client.service.ts");
    }
  });

  // Test 44: Token resolution and decryption inside shopify admin client service
  await check("44. Token resolution and decryption inside shopify admin client service", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const clientPath = path.resolve(process.cwd(), "src/server/services/shopify-admin-client.service.ts");
    const content = fs.readFileSync(clientPath, "utf8");
    const match = content.match(/interface\s+UpdateProductFieldsArgs\s*\{([\s\S]+?)\}/);
    if (!match) {
      throw new Error("Could not find interface UpdateProductFieldsArgs in shopify-admin-client.service.ts");
    }
    const interfaceBody = match[1];
    if (interfaceBody.includes("accessToken") || interfaceBody.includes("token:") || interfaceBody.match(/\btoken\b/)) {
      throw new Error("Security Violation: updateProductAllowedFields accepts a raw access token in its signature.");
    }
  });

  // Test 45: Strict execute endpoint tenant validations
  await check("45. Strict execute endpoint tenant validations", async () => {
    const { executeApprovedProductMutation } = await import("../src/server/services/approved-product-mutation-executor.service.ts");
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const repos = getRepositories();
    
    // Clear and prepare
    await repos.approvals.clearApprovals();
    await repos.stores.clearStoreConnections();

    // Create a connection
    const conn = {
      id: "conn-test-execute",
      organizationId: "org-test-execute",
      storeUrl: "glowthread-apparel.myshopify.com",
      scopes: ["write_products"],
      status: "CONNECTED",
      plan: "Standard Plan",
      currency: "USD"
    };
    await repos.stores.createStoreConnection(conn);

    // Create an approval request
    const approval = {
      id: "APV-test-exec",
      organizationId: "org-test-execute",
      storeConnectionId: "conn-test-execute",
      agentInstallationId: "inst-test-execute",
      agentId: "agent_product_intelligence",
      toolName: "catalog.products.propose_update",
      requestedBy: "Content Agent",
      status: "PENDING", // not APPROVED
      riskLevel: "Medium",
      targetType: "PRODUCT_PROPOSAL",
      targetId: "gid://shopify/Product/123",
      proposedChangesSummary: "Update title",
      diffSummary: "Update title",
      sanitizedPayload: { title: "New Title" },
      allowedFields: ["title"]
    };
    await repos.approvals.createApprovalRequest(approval);

    // 1. Mismatching tenant should reject
    try {
      await executeApprovedProductMutation("APV-test-exec", "mismatch-org", "Shop Owner");
      throw new Error("Should have thrown tenant isolation violation.");
    } catch (err) {
      if (err.code !== "TENANT_ISOLATION_VIOLATION") {
        throw new Error(`Expected TENANT_ISOLATION_VIOLATION, got ${err.code}`);
      }
    }

    // 2. Non-approved state should reject
    try {
      await executeApprovedProductMutation("APV-test-exec", "org-test-execute", "Shop Owner");
      throw new Error("Should have thrown invalid state rejection.");
    } catch (err) {
      if (err.code !== "INVALID_APPROVAL_STATE") {
        throw new Error(`Expected INVALID_APPROVAL_STATE, got ${err.code}`);
      }
    }
  });

  // Test 46: Execution locks (atomic claim transitions)
  await check("46. Concurrency claim locks and atomic transitions", async () => {
    const { getRepositories } = await import("../src/server/repositories/repository-provider.ts");
    const repos = getRepositories();

    // Reset approval request status to APPROVED
    await repos.approvals.updateApprovalRequest("APV-test-exec", { status: "APPROVED" });

    // Try claiming it first
    const claimed = await repos.approvals.claimApprovalForExecution("APV-test-exec", "org-test-execute");
    if (claimed.status !== "EXECUTING") {
      throw new Error(`Expected claimed status to be EXECUTING, got ${claimed.status}`);
    }

    // Try claiming it again should fail due to state lock
    try {
      await repos.approvals.claimApprovalForExecution("APV-test-exec", "org-test-execute");
      throw new Error("Should have blocked duplicate concurrency claim.");
    } catch (err) {
      if (!err.message.includes("Concurrency block")) {
        throw new Error(`Expected concurrency block message, got: ${err.message}`);
      }
    }
  });

  // Test 47: No unauthorized mutations & executor / client service static hardening verification
  await check("47. Hardening checks inside executor and shopify client", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const execPath = path.resolve(process.cwd(), "src/server/services/approved-product-mutation-executor.service.ts");
    const execContent = fs.readFileSync(execPath, "utf8");
    
    // 1. Forbidden fields check
    if (execContent.includes("price") || execContent.includes("inventory") || execContent.includes("variant") || execContent.includes("media") || execContent.includes("descriptionHtml")) {
      throw new Error("Security Violation: Found forbidden mutation scopes (price, inventory, variant, media, or descriptionHtml) in executor service.");
    }

    // 2. Verify store connection organization ownership validation is present in executor
    if (!execContent.includes("storeConn.organizationId !== organizationId")) {
      throw new Error("Hardening Violation: Executor service does not verify store connection organization ownership.");
    }

    // 3. Verify execution started audit happens after claim in executor code
    const claimIdx = execContent.indexOf("claimApprovalForExecution");
    const startedIdx = execContent.indexOf("APPROVAL_EXECUTION_STARTED");
    if (claimIdx === -1 || startedIdx === -1) {
      throw new Error("Hardening Violation: claimApprovalForExecution or APPROVAL_EXECUTION_STARTED references are missing in executor service.");
    }
    if (startedIdx < claimIdx) {
      throw new Error("Hardening Violation: APPROVAL_EXECUTION_STARTED audit event occurs before claimApprovalForExecution.");
    }

    // 4. Verify shopify admin client checks write_products
    const clientPath = path.resolve(process.cwd(), "src/server/services/shopify-admin-client.service.ts");
    const clientContent = fs.readFileSync(clientPath, "utf8");
    
    // Scan for updateProductAllowedFields function block
    if (!clientContent.includes("updateProductAllowedFields")) {
      throw new Error("Hardening Violation: Could not locate updateProductAllowedFields in shopify client service.");
    }
    
    const writeCheckIdx = clientContent.indexOf("write_products");
    const updateFuncIdx = clientContent.indexOf("updateProductAllowedFields");
    if (writeCheckIdx === -1 || writeCheckIdx < updateFuncIdx) {
      // Must check write_products within or after updateProductAllowedFields definition
      throw new Error("Hardening Violation: updateProductAllowedFields does not perform self-contained write_products validation.");
    }
  });

  // Test 48: Static hard guardrails and config assertions
  await check("48. Stuck execution timeout and allowlisted reason safety validation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routesPath = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    const routesContent = fs.readFileSync(routesPath, "utf8");

    // 1. Stuck execution timeout check (must have APPROVAL_EXECUTION_STUCK_TIMEOUT_MS and fallback default)
    if (!routesContent.includes("APPROVAL_EXECUTION_STUCK_TIMEOUT_MS")) {
      throw new Error("Hardening Violation: Stuck execution timeout configuration is missing.");
    }
    if (!routesContent.includes("900000")) {
      throw new Error("Hardening Violation: Default 15 minutes timeout (900000 ms) fallback is missing.");
    }

    // 2. Allowlisted recovery reasons check
    if (!routesContent.includes("execution_timeout") || !routesContent.includes("operator_marked_stuck") || !routesContent.includes("manual_recovery")) {
      throw new Error("Hardening Violation: Recovery reason allowlist is missing or incomplete in routes.");
    }
  });

  // Test 49: Recovery endpoints state isolation assertions
  await check("49. Recovery endpoints state isolation and Shopify containment check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routesPath = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    const routesContent = fs.readFileSync(routesPath, "utf8");

    // Get the indices of the recovery endpoints definitions
    const resetIdx = routesContent.indexOf("reset-failed");
    const markIdx = routesContent.indexOf("mark-execution-failed");
    
    if (resetIdx === -1 || markIdx === -1) {
      throw new Error("Hardening Violation: Recovery endpoints (reset-failed or mark-execution-failed) are missing.");
    }

    // Slice the route blocks
    const resetBlock = routesContent.slice(resetIdx, markIdx);
    const nextRouteIdx = routesContent.indexOf("router.post(\"/approvals/batch-", markIdx);
    const markBlock = nextRouteIdx !== -1 ? routesContent.slice(markIdx, nextRouteIdx) : routesContent.slice(markIdx);

    // Verify neither reset-failed nor mark-execution-failed call updateProductAllowedFields or syncProductsForShop
    if (resetBlock.includes("updateProductAllowedFields") || resetBlock.includes("syncProductsForShop")) {
      throw new Error("Hardening Violation: reset-failed endpoint calls mutation execution or product sync.");
    }
    if (markBlock.includes("updateProductAllowedFields") || markBlock.includes("syncProductsForShop")) {
      throw new Error("Hardening Violation: mark-execution-failed endpoint calls mutation execution or product sync.");
    }

    // Verify neither reset-failed nor mark-execution-failed call buildLegacyApprovalShape
    if (resetBlock.includes("buildLegacyApprovalShape")) {
      throw new Error("Hardening Violation: reset-failed endpoint calls buildLegacyApprovalShape.");
    }
    if (markBlock.includes("buildLegacyApprovalShape")) {
      throw new Error("Hardening Violation: mark-execution-failed endpoint calls buildLegacyApprovalShape.");
    }
  });

  // Test 50: Detail shape and parameter scoping sanity checks
  await check("50. Operational details sanitization and actor verification check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routesPath = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    const routesContent = fs.readFileSync(routesPath, "utf8");

    // 1. Details endpoint must not call buildLegacyApprovalShape
    const detailsIdx = routesContent.indexOf("router.get(\"/approvals/:id\"");
    const auditIdx = routesContent.indexOf("router.get(\"/approvals/:id/audit\"");
    if (detailsIdx === -1) {
      throw new Error("Hardening Violation: Details endpoint GET /api/approvals/:id is missing.");
    }
    const detailsBlock = routesContent.slice(detailsIdx, auditIdx);
    if (detailsBlock.includes("buildLegacyApprovalShape")) {
      throw new Error("Hardening Violation: GET /api/approvals/:id returns a legacy adaptored detail response shape.");
    }

    // 2. Recovery endpoints require performedBy/actor and reject system case-insensitively
    if (!routesContent.includes("trimmedActor.toLowerCase() === \"system\"")) {
      throw new Error("Hardening Violation: Recovery endpoints do not validate and reject the 'system' actor input case-insensitively.");
    }

    // 3. Recovery endpoints enforce actor presence after trim and max length boundary
    if (!routesContent.includes("trimmedActor.length === 0")) {
      throw new Error("Hardening Violation: Recovery endpoints do not reject empty actor inputs after trimming.");
    }
    if (!routesContent.includes("trimmedActor.length > 100")) {
      throw new Error("Hardening Violation: Recovery endpoints do not reject actors exceeding 100 characters.");
    }

    // 4. Stuck execution recovery endpoint enforces reason type checking
    if (!routesContent.includes("typeof rawReason !== \"string\"")) {
      throw new Error("Hardening Violation: Stuck execution recovery does not type check reason parameter.");
    }
  });

  // Test 51: Dynamic tenant context resolution validation on routes
  await check("51. Dynamic tenant context resolution static assertions on routes", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    const auditPath = path.resolve(process.cwd(), "src/server/routes/audit.routes.ts");
    const approvalsPath = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    
    const auditContent = fs.readFileSync(auditPath, "utf8");
    const approvalsContent = fs.readFileSync(approvalsPath, "utf8");
    
    // Check audit-logs route has store connection lookup and context validation
    if (!auditContent.includes("getStoreConnectionByUrl") || !auditContent.includes("storeConnection.organizationId")) {
      throw new Error("Static Check Violation: audit.routes.ts is missing store connection lookup or organizationId resolution/validation.");
    }
    
    // Check approvals routes have store connection lookup and organizationId resolution/validation
    if (!approvalsContent.includes("getStoreConnectionByUrl") || !approvalsContent.includes("storeConnection.organizationId")) {
      throw new Error("Static Check Violation: approvals.routes.ts is missing store connection lookup or organizationId resolution/validation.");
    }

    // Check approvals decide endpoint resolves requestShop from body or query
    if (!approvalsContent.includes("req.body.shop") || !approvalsContent.includes("req.query.shop")) {
      throw new Error("Static Check Violation: approvals.routes.ts decide endpoint does not support shop context resolution.");
    }
  });

  // Test 52: Frontend shop context persistence and URL cleanup regression validation
  await check("52. Frontend shop context persistence and URL cleanup regression validation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    const appPath = path.resolve(process.cwd(), "src/App.tsx");
    const appContent = fs.readFileSync(appPath, "utf8");
    
    // 1. App.tsx must not call window.history.replaceState with window.location.pathname only
    if (appContent.includes("window.history.replaceState({}, document.title, window.location.pathname)")) {
      throw new Error("Regression Violation: App.tsx blindly clears URL query params using window.location.pathname, which removes the shop context.");
    }
    
    // 2. App.tsx must have a centralized helper for resolving shop context
    if (!appContent.includes("resolveActiveShop") || !appContent.includes("buildShopQuery")) {
      throw new Error("Hardening Violation: App.tsx is missing a centralized shop context resolver (resolveActiveShop / buildShopQuery).");
    }

    // 3. Check that URLSearchParams is used for selective parameter deletion
    if (!appContent.includes("delete(\"shopify_connected\")")) {
      throw new Error("Hardening Violation: App.tsx does not use URLSearchParams to selectively remove transient OAuth callback parameters.");
    }
  });

  // Test 53: Phase 10.9 Multi-Agent Product Workspace static guardrails
  await check("53. Phase 10.9 Multi-Agent Product Workspace static validation and guardrails", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    // 1. Verify available agents in agents.routes.ts
    const agentsPath = path.resolve(process.cwd(), "src/server/routes/agents.routes.ts");
    const agentsContent = fs.readFileSync(agentsPath, "utf8");
    
    const requiredAgents = [
      "product_intelligence_agent",
      "seo_aeo_agent",
      "content_agent",
      "design_review_agent"
    ];
    for (const agent of requiredAgents) {
      if (!agentsContent.includes(agent)) {
        throw new Error(`Static Check Violation: Required agent '${agent}' is missing from catalog definition.`);
      }
    }
    
    // 2. Strict theme write/read boundaries check
    if (agentsContent.includes("\"read_themes\"") || agentsContent.includes("\"write_themes\"") || agentsContent.includes("'read_themes'") || agentsContent.includes("'write_themes'")) {
      throw new Error("Security Violation: Theme read/write permissions cannot be exposed to Workspace Agents.");
    }
    
    // 3. Strict forbidden product mutations check
    const forbiddenKeywords = ["price", "inventory", "variants", "images", "descriptionHtml"];
    const schemasPath = path.resolve(process.cwd(), "src/server/domain/types.ts");
    const schemasContent = fs.readFileSync(schemasPath, "utf8");
    const proposedActionSliceIdx = schemasContent.indexOf("export interface ProposedAction");
    if (proposedActionSliceIdx === -1) {
      throw new Error("Static Check Violation: ProposedAction interface is missing in types.ts.");
    }
    const proposedActionSlice = schemasContent.slice(proposedActionSliceIdx);
    const changesBlockIdx = proposedActionSlice.indexOf("changes:");
    const changesBlockEnd = proposedActionSlice.indexOf("}", changesBlockIdx);
    const changesBlock = proposedActionSlice.slice(changesBlockIdx, changesBlockEnd);
    
    for (const keyword of forbiddenKeywords) {
      if (changesBlock.includes(keyword)) {
        throw new Error(`Security Violation: ProposedAction changes block contains forbidden property '${keyword}'.`);
      }
    }
    
    // 4. Proposed actions executionMode types validation
    if (!proposedActionSlice.includes("'DRAFT_ONLY'") || !proposedActionSlice.includes("'APPROVAL_REQUIRED'") || !proposedActionSlice.includes("'NOT_EXECUTABLE'")) {
      throw new Error("Static Check Violation: ProposedAction is missing required executionMode enum values.");
    }
  });

  // Test 54: Phase 10.10 Multi-Agent Workspace Analytics & Operational Visibility static guardrails
  await check("54. Phase 10.10 Multi-Agent Workspace Analytics & Operational Visibility static validation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    
    // 1. Verify that all 6 analytics routes are defined in analytics.routes.ts
    const routesPath = path.resolve(process.cwd(), "src/server/routes/analytics.routes.ts");
    const routesContent = fs.readFileSync(routesPath, "utf8");
    
    const requiredEndpoints = [
      "/workspace/analytics/summary",
      "/workspace/analytics/agent-runs",
      "/workspace/analytics/recommendations",
      "/workspace/analytics/proposed-actions",
      "/workspace/analytics/approval-conversion",
      "/workspace/analytics/timeline"
    ];
    for (const endpoint of requiredEndpoints) {
      if (!routesContent.includes(endpoint)) {
        throw new Error(`Static Check Violation: Required analytics endpoint '${endpoint}' is missing in routes.`);
      }
    }

    // 2. Verify that there is a route method block for non-GET requests returning 405
    if (!routesContent.includes("router.all(\"/workspace/analytics/*\"") && !routesContent.includes("router.all('/workspace/analytics/*'")) {
      throw new Error("Security Violation: Analytics endpoints are missing non-GET block rejections.");
    }

    // 3. Static verification that no database writes, mutations, or side effects are initiated by routes or service
    const servicePath = path.resolve(process.cwd(), "src/server/services/workspace-analytics.service.ts");
    const serviceContent = fs.readFileSync(servicePath, "utf8");
    
    const serviceForbidden = [
      "createProposedAction",
      "updateProposedAction",
      "createRecommendation",
      "updateRecommendation",
      "createApprovalRequest",
      "updateApprovalRequest",
      "delete",
      "writeAuditEvent"
    ];
    for (const kw of serviceForbidden) {
      if (serviceContent.includes(kw)) {
        throw new Error(`Security Violation: Workspace Analytics Service invokes mutating operation or event write: '${kw}'.`);
      }
    }

    const routesForbidden = [
      "createProposedAction",
      "updateProposedAction",
      "createRecommendation",
      "updateRecommendation",
      "createApprovalRequest",
      "updateApprovalRequest",
      "delete",
      "writeAuditEvent",
      "shopifyProductSync",
      "syncProductsForShop",
      "updateProductAllowedFields",
      "prepareProductUpdate",
      "prepareThemePatch"
    ];
    for (const kw of routesForbidden) {
      if (routesContent.includes(kw)) {
        throw new Error(`Security Violation: Analytics routes file contains forbidden mutation keyword or side effect: '${kw}'.`);
      }
    }

    // 4. Verify no POST, PUT, DELETE, PATCH routes are defined for analytics
    if (routesContent.includes("router.post(") || routesContent.includes("router.put(") || routesContent.includes("router.patch(") || routesContent.includes("router.delete(")) {
      throw new Error("Security Violation: Analytics routes must be strictly read-only GET routes, no mutating route verbs are allowed.");
    }

    // 5. Verify no batch/bulk actions exist in the analytics layer
    if (routesContent.includes("batch") || serviceContent.includes("batch")) {
      throw new Error("Security/Scope Violation: Batch or bulk operations are not permitted in Phase 10.10 operational analytics.");
    }

    // 6. Verify timeline safeSummary sanitization (no raw description fallback allowed)
    if (serviceContent.includes("auditDescription ||") || serviceContent.includes("e.description ||")) {
      throw new Error("Security Violation: Timeline safeSummary uses forbidden raw audit description fallback.");
    }
    if (serviceContent.includes("getSafeSummary(e.event, e.description")) {
      throw new Error("Security Violation: Timeline Trace passes raw description to safeSummary.");
    }
    if (serviceContent.includes("function getSafeSummary(event: string, auditDescription")) {
      throw new Error("Security Violation: getSafeSummary signature takes auditDescription, violating the allowlist-only design.");
    }

    // 7. Verify no exposure of raw prompts, reasoning steps, tool arguments, or Shopify responses
    const exposureForbidden = ["rawPrompt", "rawReasoning", "rawToolArgs", "rawShopifyResponse"];
    for (const kw of exposureForbidden) {
      if (routesContent.includes(kw) || serviceContent.includes(kw)) {
        throw new Error(`Security Violation: Operational Visibility leaks internal raw trace fields: '${kw}'.`);
      }
    }

    // 8. Verify Timeline allowlist security constraints (disallowed fields are completely stripped and not on the return payload object)
    if (!serviceContent.includes("id: e.id") || !serviceContent.includes("safeSummary")) {
      throw new Error("Security Violation: Timeline Trace does not enforce strict allowlist-only payload scrub mapping.");
    }
  });

  // Test 55: Phase 10.11 MVP End-to-End Merchant Workflow Hardening static guardrails
  await check("55. Phase 10.11 MVP End-to-End Merchant Workflow Hardening static validation", async () => {
    const fs = await import("fs");
    const path = await import("path");

    // 1. Verify docs exist
    const planPath = path.resolve(process.cwd(), "docs/phases/phase-10.11/IMPLEMENTATION_PLAN.md");
    if (!fs.existsSync(planPath)) {
      throw new Error("Phase 10.11 Implementation Plan file is missing.");
    }

    // 2. Validate no forbidden bulk/batch operations routes inside catalog routes
    const appPath = path.resolve(process.cwd(), "src/server/app.ts");
    const appContent = fs.readFileSync(appPath, "utf8");
    if (appContent.includes("batch-dismiss") || appContent.includes("batch-approve") || appContent.includes("batch-execute")) {
      throw new Error("Security Violation: Batch/bulk routing paths found in app.ts.");
    }

    const catalogRoutePath = path.resolve(process.cwd(), "src/server/routes/catalog.routes.ts");
    const catalogRouteContent = fs.readFileSync(catalogRoutePath, "utf8");
    if (catalogRouteContent.includes("batch-dismiss") || catalogRouteContent.includes("batch-approve") || catalogRouteContent.includes("batch-execute")) {
      throw new Error("Security Violation: Batch/bulk routing paths found in catalog routes.");
    }

    // 3. Validate explicit approval and explicit execution language in components
    const queuePath = path.resolve(process.cwd(), "src/components/ApprovalQueue.tsx");
    const queueContent = fs.readFileSync(queuePath, "utf8");
    
    if (!queueContent.includes("Manual Gatekeeper Guardrail:") && !queueContent.includes("Manual Gatekeeper")) {
      throw new Error("UX Hardening Violation: Missing explicit manual execution warning in ApprovalQueue.");
    }
    if (!queueContent.includes("Execute Commit to Shopify")) {
      throw new Error("UX Hardening Violation: Missing explicit Execute Commit CTA button in ApprovalQueue.");
    }

    // 4. Validate no raw payload exposure patterns in proposed actions rendering
    const workspacePath = path.resolve(process.cwd(), "src/components/AgentWorkspace.tsx");
    const workspaceContent = fs.readFileSync(workspacePath, "utf8");
    
    if (workspaceContent.includes("JSON.stringify(act.changes")) {
      throw new Error("Security Violation: Raw JSON payload exposure found in AgentWorkspace proposed actions review.");
    }
    
    // Assert that the allowlist mapping is strictly present
    const requiredAllowlistFields = ["'title'", "'vendor'", "'productType'", "'status'", "'tags'"];
    for (const field of requiredAllowlistFields) {
      if (!workspaceContent.includes(field) && !workspaceContent.includes(field.replace(/'/g, '"'))) {
        throw new Error(`Security Violation: Allowlisted field mapping for '${field}' is missing in proposed action review.`);
      }
    }

    // 5. Verify no hardcoded demo-org-id in App.tsx
    const appTsxPath = path.resolve(process.cwd(), "src/App.tsx");
    const appTsxContent = fs.readFileSync(appTsxPath, "utf8");
    if (appTsxContent.includes("organizationId: 'demo-org-id'") || appTsxContent.includes('organizationId: "demo-org-id"')) {
      throw new Error("Security Violation: Hardcoded 'demo-org-id' is still present in src/App.tsx.");
    }

    // 6. Verify handleDecideApproval uses data.approval || data normalization
    if (!appTsxContent.includes("data.approval || data")) {
      throw new Error("Normalizer Violation: App.tsx handleDecideApproval does not normalize decide response shape using data.approval || data.");
    }

    // 7. Verify approval response shape in route maps includes organizationId and storeConnectionId explicitly
    const approvalsRoutePath2 = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    const approvalsRouteContent2 = fs.readFileSync(approvalsRoutePath2, "utf8");
    if (!approvalsRouteContent2.includes("organizationId: a.organizationId") || !approvalsRouteContent2.includes("storeConnectionId: a.storeConnectionId")) {
      throw new Error("Sanitization Shape Violation: approval routes response shape mapping must explicitly propagate organizationId and storeConnectionId.");
    }

    // 8. Verify explicit execution language remains present and is conditional only on APPROVED
    if (!queueContent.includes("selectedItem.status === 'APPROVED'") && !queueContent.includes('selectedItem.status === "APPROVED"')) {
      throw new Error("UX Hardening Violation: Explicit Execute Commit CTA must be conditional on status === APPROVED.");
    }
  });

  // Test 56: Phase 10.12 Production Bulk Operations Foundation static guardrails
  await check("56. Phase 10.12 Production Bulk Operations Foundation static validation", async () => {
    const fs = await import("fs");
    const path = await import("path");

    // 1. Verify batch endpoint files exist and are imported in app.ts
    const appPath = path.resolve(process.cwd(), "src/server/app.ts");
    const appContent = fs.readFileSync(appPath, "utf8");
    if (!appContent.includes("proposed-actions.routes.js") || !appContent.includes("approvals.routes.js")) {
      throw new Error("Route Mounting Violation: Batch/bulk routing files are missing or not mounted correctly in app.ts.");
    }

    // 2. Verify that batch execute orchestrates single-item execution by using executeApprovedProductMutation
    const approvalsRoutePath = path.resolve(process.cwd(), "src/server/routes/approvals.routes.ts");
    const approvalsRouteContent = fs.readFileSync(approvalsRoutePath, "utf8");
    if (!approvalsRouteContent.includes("executorService.executeApprovedProductMutation") || !approvalsRouteContent.includes("executeApprovedProductMutation(")) {
      throw new Error("Executor Service Violation: Batch execute does not orchestrate existing approved single-item mutation executor.");
    }

    // 3. Verify no duplication of productUpdate logic (no new raw Shopify mutation paths)
    if (approvalsRouteContent.match(/mutation\s+productUpdate/gi)) {
      throw new Error("Security Violation: Custom productUpdate GraphQL mutation found in approvals.routes.ts (must reuse executor service).");
    }

    // 4. Verify no theme tools in proposed action/approval routes
    if (approvalsRouteContent.includes("read_themes") || approvalsRouteContent.includes("write_themes")) {
      throw new Error("Security Violation: theme access scopes / tools referenced in approvals.routes.ts.");
    }

    // 5. Verify batch size cap parameter in routes (restricted to max 10 items)
    if (!approvalsRouteContent.includes("ids.length > 10")) {
      throw new Error("Throttling/Safety Violation: Batch approvals execute / decide route lacks strict batch size limit of 10 items.");
    }

    // 6. Verify tenant validation mismatch checks and 403 response trigger on both approvals batch routes
    const forbiddenMatches = approvalsRouteContent.match(/res\.status\(403\)/g);
    if (!forbiddenMatches || forbiddenMatches.length < 2) {
      throw new Error("Tenant Safety Violation: Missing or weak tenant context validation check in approvals batch routes.");
    }

    // 7. Verify batch-request-approval performs preflight validation for executionMode and allowed fields before calling requestProposedActionApprovalBridge
    const propRoutePath = path.resolve(process.cwd(), "src/server/routes/proposed-actions.routes.ts");
    const propRouteContent = fs.readFileSync(propRoutePath, "utf8");
    if (!propRouteContent.includes("executionMode !== \"APPROVAL_REQUIRED\"") && !propRouteContent.includes("executionMode !== 'APPROVAL_REQUIRED'")) {
      throw new Error("Preflight Safety Violation: batch-request-approval does not check executionMode in Phase 1 preflight.");
    }
    if (!propRouteContent.includes("allowedFieldsList")) {
      throw new Error("Preflight Safety Violation: batch-request-approval does not check allowed fields in Phase 1 preflight.");
    }

    // 8. Verify batch-execute distinguishes EXECUTION_BLOCKED / missing write_products safe blocks from generic FAILED results
    if (!approvalsRouteContent.includes("EXECUTION_BLOCKED") || !approvalsRouteContent.includes("missing write_products scope")) {
      throw new Error("Safe Block Exception Violation: batch-execute does not check for EXECUTION_BLOCKED or missing write_products scope in sequential queue loop.");
    }
    if (!approvalsRouteContent.includes("status: \"BLOCKED\"") && !approvalsRouteContent.includes("status: 'BLOCKED'")) {
      throw new Error("Safe Block Mapping Violation: batch-execute does not map safe scope-blocked exceptions to 'BLOCKED' status.");
    }
  });

  // Print PASS/FAIL Summary
  console.log(`\n\x1b[1m\x1b[36m=== RELEASE VERIFICATION SUMMARY ===\x1b[0m`);
  for (const t of tests) {
    if (t.status === "PASS") {
      console.log(` \x1b[32m✓\x1b[0m ${t.name}: \x1b[32mPASS\x1b[0m`);
    } else {
      console.log(` \x1b[31m✗\x1b[0m ${t.name}: \x1b[31mFAIL\x1b[0m (${t.error})`);
    }
  }

  console.log(`\n\x1b[1mResults: \x1b[32m${passCount} passed\x1b[0m, \x1b[31m${failCount} failed\x1b[0m, total ${tests.length}\n`);

  if (failCount > 0) {
    console.log(`\x1b[1m\x1b[31mRELEASE VERIFICATION FAILED!\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[1m\x1b[32mRELEASE VERIFICATION PASSED SUCCESSFULLY!\x1b[0m\n`);
    process.exit(0);
  }
}

runVerification();
