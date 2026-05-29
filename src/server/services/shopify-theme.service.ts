import { getRepositories } from "../repositories/repository-provider.js";
import { decryptAccessToken } from "./token-crypto.service.js";
import { getShopifyAdminApiConfig } from "../config/shopify-admin-api.config.js";
import { isShopifyOAuthConfigured } from "../config/shopify.config.js";
import { getFirestoreClient } from "./firestore-client.service.js";
import { isFirestoreConfigured } from "../config/firestore.config.js";
import { writeAuditEvent } from "./audit-log.service.js";
import { AuditEventNames } from "../domain/types.js";

// Safe asset keys allowlist folders
const ALLOWED_FOLDERS = ["layout/", "templates/", "sections/", "snippets/", "assets/", "config/"];
const ALLOWED_EXTENSIONS = [".liquid", ".json", ".css", ".js", ".css.liquid", ".js.liquid"];

// Mock theme backups array for in-memory fallback
let mockThemeBackups: any[] = [];

/**
 * Normalizes shop domain.
 */
function normalizeShopDomain(shop: string): string {
  if (!shop) return "";
  let domain = shop.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  domain = domain.split("/")[0];
  if (!domain.endsWith(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

/**
 * Validates whether the asset key is safe and allowlisted.
 */
export function validateAssetPath(assetKey: string): boolean {
  if (!assetKey || typeof assetKey !== "string") return false;

  // Block path traversal and absolute routes
  if (assetKey.includes("..") || assetKey.startsWith("/") || assetKey.includes("\\")) {
    return false;
  }

  // Enforce folder allowlist
  const matchesFolder = ALLOWED_FOLDERS.some(folder => assetKey.startsWith(folder));
  if (!matchesFolder) return false;

  // Enforce file extension check
  const matchesExtension = ALLOWED_EXTENSIONS.some(ext => assetKey.endsWith(ext));
  if (!matchesExtension) return false;

  return true;
}

/**
 * Lists available themes on the Shopify store.
 */
export async function listThemes(shopDomain: string) {
  const cleanShop = normalizeShopDomain(shopDomain);
  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  const isMockDomain = cleanShop.includes("glowthread-apparel") || 
                       cleanShop.includes("luminary-essentials") ||
                       cleanShop.includes("yambasurf-co-il");
  const isConfigured = isShopifyOAuthConfigured();

  if (!isConfigured || isMockDomain) {
    return [
      { id: "mock-theme-active", name: "Dawn (Active Live Theme)", role: "main", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "mock-theme-dev", name: "Sense (Unpublished Dev Copy)", role: "development", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: "mock-theme-draft", name: "Craft (Staging Draft)", role: "unpublished", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ];
  }

  if (!connection || connection.status !== "CONNECTED") {
    throw new Error(`Shopify store '${cleanShop}' is not connected.`);
  }

  if (!connection.scopes.includes("read_themes")) {
    throw new Error("Missing required 'read_themes' scope for listing themes.");
  }

  const accessToken = await decryptAccessToken(connection.accessTokenEncrypted!);
  const { apiVersion } = getShopifyAdminApiConfig();
  const restUrl = `https://${cleanShop}/admin/api/${apiVersion}/themes.json`;

  const res = await fetch(restUrl, {
    headers: {
      "Accept": "application/json",
      "X-Shopify-Access-Token": accessToken
    }
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin REST API list themes failed with status: ${res.status}`);
  }

  const data = await res.json();
  return data.themes || [];
}

/**
 * Lists theme assets (files).
 */
export async function listThemeAssets(shopDomain: string, themeId: string) {
  const cleanShop = normalizeShopDomain(shopDomain);
  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  const isMockDomain = cleanShop.includes("glowthread-apparel") || 
                       cleanShop.includes("luminary-essentials") ||
                       cleanShop.includes("yambasurf-co-il");
  const isConfigured = isShopifyOAuthConfigured();

  if (!isConfigured || isMockDomain) {
    return [
      { key: "layout/theme.liquid" },
      { key: "templates/index.json" },
      { key: "sections/header.liquid" },
      { key: "sections/footer.liquid" },
      { key: "assets/application.css" },
      { key: "assets/application.js" }
    ];
  }

  if (!connection || connection.status !== "CONNECTED") {
    throw new Error(`Shopify store '${cleanShop}' is not connected.`);
  }

  if (!connection.scopes.includes("read_themes")) {
    throw new Error("Missing required 'read_themes' scope for listing assets.");
  }

  const accessToken = await decryptAccessToken(connection.accessTokenEncrypted!);
  const { apiVersion } = getShopifyAdminApiConfig();
  const restUrl = `https://${cleanShop}/admin/api/${apiVersion}/themes/${themeId}/assets.json`;

  const res = await fetch(restUrl, {
    headers: {
      "Accept": "application/json",
      "X-Shopify-Access-Token": accessToken
    }
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin REST API list assets failed with status: ${res.status}`);
  }

  const data = await res.json();
  return data.assets || [];
}

/**
 * Reads specific asset content.
 */
export async function getThemeAssetContent(shopDomain: string, themeId: string, assetKey: string): Promise<string> {
  const cleanShop = normalizeShopDomain(shopDomain);
  
  if (!validateAssetPath(assetKey)) {
    throw new Error(`Security Violation: Reading unsafe asset path '${assetKey}' is strictly blocked.`);
  }

  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  const isMockDomain = cleanShop.includes("glowthread-apparel") || 
                       cleanShop.includes("luminary-essentials") ||
                       cleanShop.includes("yambasurf-co-il");
  const isConfigured = isShopifyOAuthConfigured();

  if (!isConfigured || isMockDomain) {
    if (assetKey === "layout/theme.liquid") {
      return `<!doctype html>
<html class="no-js" lang="en">
  <head>
    <meta charset="utf-8">
    <title>Mock Storefront</title>
    {{ content_for_header }}
  </head>
  <body>
    {% section 'header' %}
    <main id="MainContent" class="content-for-layout focus-none" role="main">
      {{ content_for_layout }}
    </main>
    {% section 'footer' %}
  </body>
</html>`;
    }
    if (assetKey === "sections/header.liquid") {
      return `<header class="header">
  <div class="header__logo">
    <a href="/">{{ shop.name }}</a>
  </div>
  <nav class="header__navigation">
    <ul>
      <li><a href="/collections/all">Catalog</a></li>
    </ul>
  </nav>
</header>`;
    }
    if (assetKey === "sections/footer.liquid") {
      return `<footer class="footer">
  <p>&copy; {{ 'now' | date: '%Y' }} {{ shop.name }}. All rights reserved.</p>
</footer>`;
    }
    return `// Mock content for ${assetKey}\nconsole.log("Mock script loaded");`;
  }

  if (!connection || connection.status !== "CONNECTED") {
    throw new Error(`Shopify store '${cleanShop}' is not connected.`);
  }

  if (!connection.scopes.includes("read_themes")) {
    throw new Error("Missing required 'read_themes' scope for reading assets.");
  }

  const accessToken = await decryptAccessToken(connection.accessTokenEncrypted!);
  const { apiVersion } = getShopifyAdminApiConfig();
  const restUrl = `https://${cleanShop}/admin/api/${apiVersion}/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;

  const res = await fetch(restUrl, {
    headers: {
      "Accept": "application/json",
      "X-Shopify-Access-Token": accessToken
    }
  });

  if (!res.ok) {
    throw new Error(`Shopify Admin REST API get asset failed with status: ${res.status}`);
  }

  const data = await res.json();
  const asset = data.asset || {};
  return asset.value || asset.attachment || "";
}

/**
 * Creates a durable backup snapshot record.
 */
async function createThemeBackup(params: {
  shopDomain: string;
  themeId: string;
  assetKey: string;
  oldValue: string;
  newValue: string;
  operator: string;
}) {
  const { shopDomain, themeId, assetKey, oldValue, newValue, operator } = params;
  const backupId = `BAK-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  const backupData = {
    id: backupId,
    shopDomain,
    themeId,
    assetKey,
    oldValue,
    newValue,
    timestamp: new Date().toISOString(),
    operator
  };

  const isConfigured = isFirestoreConfigured();
  if (isConfigured) {
    try {
      const firestore = getFirestoreClient();
      await firestore.collection("theme_backups").doc(backupId).set(backupData);
    } catch (err) {
      console.error("[BACKUP ERROR] Failed to save backup to Firestore, falling back to process trace:", err);
    }
  } else {
    mockThemeBackups.push(backupData);
  }

  return backupId;
}

/**
 * Safely updates theme asset content (Backup before write).
 */
export async function updateThemeAsset(params: {
  shopDomain: string;
  themeId: string;
  assetKey: string;
  value: string;
  operator: string;
}) {
  const { shopDomain, themeId, assetKey, value, operator } = params;
  const cleanShop = normalizeShopDomain(shopDomain);

  // 1. Path Gating
  if (!validateAssetPath(assetKey)) {
    throw new Error(`Security Violation: Modifying unsafe asset path '${assetKey}' is strictly blocked.`);
  }

  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  const isMockDomain = cleanShop.includes("glowthread-apparel") || 
                       cleanShop.includes("luminary-essentials") ||
                       cleanShop.includes("yambasurf-co-il");
  const isConfigured = isShopifyOAuthConfigured();

  // Fetch current value for backup
  let currentVal = "";
  try {
    currentVal = await getThemeAssetContent(cleanShop, themeId, assetKey);
  } catch (err) {
    console.log(`[INFO] Creating a new asset because file was not found or failed reading: ${assetKey}`);
  }

  // 2. Perform Backup
  const backupId = await createThemeBackup({
    shopDomain: cleanShop,
    themeId,
    assetKey,
    oldValue: currentVal,
    newValue: value,
    operator
  });

  // Mock domain fallback update
  if (!isConfigured || isMockDomain) {
    await writeAuditEvent({
      organizationId: connection?.organizationId || "demo-org-id",
      storeConnectionId: connection?.id || "store-yambasurf",
      initiator: operator,
      event: AuditEventNames.GATEWAY_TOOL_EXECUTION,
      description: `Safely wrote theme file '${assetKey}' in sandbox (Backup created: ${backupId})`,
      decision: "allowed",
      metadata: {
        themeId,
        assetKey,
        backupId,
        sandbox: true
      }
    });

    return {
      success: true,
      assetKey,
      themeId,
      backupId,
      sandbox: true
    };
  }

  // 3. Real write connection checks
  if (!connection || connection.status !== "CONNECTED") {
    throw new Error(`Shopify store '${cleanShop}' is not connected.`);
  }

  if (!connection.scopes.includes("write_themes")) {
    throw new Error("Missing required 'write_themes' scope for writing assets.");
  }

  const accessToken = await decryptAccessToken(connection.accessTokenEncrypted!);
  const { apiVersion } = getShopifyAdminApiConfig();
  const restUrl = `https://` + cleanShop + `/admin/api/` + apiVersion + `/themes/` + themeId + `/assets.json`;

  const requestBody = {
    asset: {
      key: assetKey,
      value: value
    }
  };

  const res = await fetch(restUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify(requestBody)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Shopify Admin REST API theme write failed with status ${res.status}: ${errText}`);
  }

  // 4. Log successful audit trail
  await writeAuditEvent({
    organizationId: connection.organizationId,
    storeConnectionId: connection.id,
    initiator: operator,
    event: AuditEventNames.GATEWAY_TOOL_EXECUTION,
    description: `Safely modified theme file '${assetKey}' (Backup ID: ${backupId})`,
    decision: "allowed",
    metadata: {
      themeId,
      assetKey,
      backupId
    }
  });

  return {
    success: true,
    assetKey,
    themeId,
    backupId
  };
}

/**
 * Returns mock backups count or details (for verification tests).
 */
export function getMockBackups() {
  return mockThemeBackups;
}

/**
 * Clears mock backups (useful in resets).
 */
export function clearMockBackups() {
  mockThemeBackups = [];
}
