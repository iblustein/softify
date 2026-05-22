import { URL } from "url";

const baseUrl = process.env.SOFTIFY_BASE_URL || "https://softify-595151907767.europe-west1.run.app";
const shop = process.env.SOFTIFY_TEST_SHOP || "yambasurf-co-il.myshopify.com";
const defaultLimit = process.env.SMOKE_PRODUCTS_LIMIT ? parseInt(process.env.SMOKE_PRODUCTS_LIMIT, 10) : 5;

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

async function runSuite() {
  // Test A: OAuth Status validation
  await check("A. OAuth Status endpoint validation", async () => {
    const timestamp = Date.now();
    const url = `${baseUrl}/api/shopify/oauth/status?shop=${encodeURIComponent(shop)}&t=${timestamp}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP Error status ${res.status}`);
    }
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.configured !== true) {
      throw new Error(`Expected configured to be true, got: ${data.configured}`);
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
    if (!res.ok) {
      throw new Error(`HTTP Error status ${res.status}`);
    }
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
    if (!res.ok) {
      throw new Error(`HTTP Error status ${res.status}`);
    }
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
    if (!res.ok) {
      throw new Error(`HTTP Error status ${res.status}`);
    }
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
    if (!res.ok) {
      throw new Error(`HTTP Error status ${res.status}`);
    }
    const data = await res.json();
    scanForForbiddenKeys(data);

    if (data.limit !== 20) {
      throw new Error(`Expected limit to fallback to 20, got: ${data.limit}`);
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
