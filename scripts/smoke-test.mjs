import { URL } from "url";

const baseUrl = process.env.SOFTIFY_BASE_URL || "https://softify-595151907767.europe-west1.run.app";
const shop = process.env.SOFTIFY_TEST_SHOP || "yambasurf-co-il.myshopify.com";
const defaultLimit = process.env.SMOKE_PRODUCTS_LIMIT ? parseInt(process.env.SMOKE_PRODUCTS_LIMIT, 10) : 5;

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

async function runSuite() {
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
        agentId: "agent_product_intelligence"
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
    if (inst.agentId !== "agent_product_intelligence") {
      throw new Error(`Expected installation.agentId to be "agent_product_intelligence", got: "${inst.agentId}"`);
    }
    
    // Verify allowedTools contains catalog.products.* and catalog.insights.* tools, and catalog.insights.health is present
    if (!Array.isArray(inst.allowedTools) || inst.allowedTools.length === 0) {
      throw new Error("Allowed tools list should not be empty");
    }
    if (!inst.allowedTools.includes("catalog.insights.health")) {
      throw new Error("Expected allowedTools to include 'catalog.insights.health'");
    }
    for (const tool of inst.allowedTools) {
      if (!tool.startsWith("catalog.products.") && !tool.startsWith("catalog.insights.")) {
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
    const url = `${baseUrl}/api/agents/installations/status?shop=${encodeURIComponent(shop)}&agentId=agent_product_intelligence`;
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
      if (!tool.startsWith("catalog.products.") && !tool.startsWith("catalog.insights.")) {
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
        agentId: "agent_product_intelligence",
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
        agentId: "agent_product_intelligence",
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
        agentId: "agent_product_intelligence",
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
        agentId: "agent_product_intelligence",
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
        agentId: "agent_product_intelligence",
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
        agentId: "agent_product_intelligence",
        message: "simulate tool catalog.products.update"
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

    // Find the newly created PENDING approval request for catalog.products.update
    const pendingApproval = approvals.find(
      a => a.status === "PENDING" && a.toolName === "catalog.products.update"
    );
    if (!pendingApproval) {
      throw new Error("Expected to find a PENDING approval request for catalog.products.update.");
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

    // 5. Approve the request (expect 200 and state APPLIED)
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
    if (decideResult.status !== "APPLIED" && decideResult.status !== "APPROVED") {
      throw new Error(`Expected decision status to be APPROVED or APPLIED, got: ${decideResult.status}`);
    }

    // 6. Verify that mock catalog changes were committed successfully
    const resProducts = await fetch(`${baseUrl}/api/catalog/products?shop=${shop}&t=${timestamp}`);
    await checkResponse(resProducts);
    const products = await resProducts.json();
    const targetProduct = products.find(p => String(p.shopifyProductId || p.id) === "101");
    if (!targetProduct) {
      throw new Error("Expected to find product 101 in catalog.");
    }
    if (targetProduct.title !== "Super Polished Tee") {
      throw new Error(`Expected product 101 title to be updated to 'Super Polished Tee', got: ${targetProduct.title}`);
    }

    // 7. Verify audit logs trail for APPROVAL_CREATED, APPROVAL_APPROVED, and APPROVAL_APPLIED
    const resAudits = await fetch(`${baseUrl}/api/audit-logs?organizationId=demo-org-id&t=${timestamp}`);
    await checkResponse(resAudits);
    const audits = await resAudits.json();

    const createdEvent = audits.find(a => a.event === "APPROVAL_CREATED" && a.metadata?.approvalId === approvalId);
    const approvedEvent = audits.find(a => a.event === "APPROVAL_APPROVED" && a.metadata?.approvalId === approvalId);
    const appliedEvent = audits.find(a => a.event === "APPROVAL_APPLIED" && a.metadata?.approvalId === approvalId);

    if (!createdEvent) throw new Error("Missing APPROVAL_CREATED audit log event.");
    if (!approvedEvent) throw new Error("Missing APPROVAL_APPROVED audit log event.");
    if (!appliedEvent) throw new Error("Missing APPROVAL_APPLIED audit log event.");

    // Check zero-PII/security constraints on approvals
    scanForForbiddenKeys(pendingApproval);

    console.log(`   [APPROVAL TESTS] Successfully intercepted tool catalog.products.update, created approval request, rejected unauthorized access, committed mock catalog changes, and verified chronological audit trails.`);
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

  if (failCount > 0) {
    console.log(`\x1b[1m\x1b[31mSMOKE TEST FAILED!\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[1m\x1b[32mSMOKE TEST COMPLETED SUCCESSFULLY!\x1b[0m\n`);
    process.exit(0);
  }
}

runSuite();
