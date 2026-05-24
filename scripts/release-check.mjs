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
    const preExistingAllowed = ["shopify.prepareProductUpdate", "shopify.prepareThemePatch"];
    const forbiddenKeywords = ["write", "update", "delete", "create", "mutate", "inventory", "patch", "publish", "unpublish"];
    
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
