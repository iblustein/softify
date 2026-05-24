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
        shop: "yambasurf-co-il.myshopify.com",
        agentId: "agent_product_intelligence",
        message: "How many products are synced in glowthread-apparel.myshopify.com?"
      })
    });

    await checkResponse(res);
    const data = await res.json();
    
    if (data.ok !== true) {
      throw new Error(`Expected ok to be true, got: ${data.ok}`);
    }
    // Verify that the tool called still used yambasurf-co-il.myshopify.com
    const summaryCall = data.toolCalls.find(t => t.toolName === "catalog.products.summary");
    if (!summaryCall) {
      throw new Error("Expected catalog.products.summary tool call.");
    }
    if (summaryCall.arguments.shop !== "yambasurf-co-il.myshopify.com") {
      throw new Error(`Security Violation: Tool arguments shop overridden to ${summaryCall.arguments.shop}`);
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

  if (failCount > 0) {
    console.log(`\x1b[1m\x1b[31mSMOKE TEST FAILED!\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log(`\x1b[1m\x1b[32mSMOKE TEST COMPLETED SUCCESSFULLY!\x1b[0m\n`);
    process.exit(0);
  }
}

runSuite();
