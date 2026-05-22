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
