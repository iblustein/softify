import crypto from "crypto";
import { getShopifyConfig } from "../config/shopify.config.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { setShopifyStore } from "../data/mock-store.js";
import { encryptAccessToken } from "./token-crypto.service.js";
import { writeLog } from "./audit-log.service.js";
import { ShopifyStoreConnection } from "../domain/types.js";

// Nonce storage for state verification (temporary in-memory cache)
// TODO: Replace this in production with secure signed cookies or session-based server state.
const nonceCache = new Map<string, { timestamp: number }>();

/**
 * Validates that the shop domain conforms to the standard Shopify hostname rules.
 */
export function validateShopDomain(shop: string): boolean {
  if (!shop) return false;
  // Shopify shop domain: alphanumeric characters and hyphens, ending strictly with .myshopify.com
  const regex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/i;
  return regex.test(shop);
}

/**
 * Normalizes a shop URL input into a clean {subdomain}.myshopify.com format.
 */
export function normalizeShopDomain(shop: string): string {
  if (!shop) return "";
  let clean = shop.trim().toLowerCase();
  
  // Remove leading protocol and www
  clean = clean.replace(/^(https?:\/\/)?(www\.)?/, "");
  
  // Remove any trailing path/querystring parameters
  clean = clean.split("/")[0];
  
  if (!clean.endsWith(".myshopify.com")) {
    clean = `${clean}.myshopify.com`;
  }
  
  return clean;
}

/**
 * Generates a unique OAuth state nonce and stores it in the temporary cache.
 */
export function generateOAuthState(): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  nonceCache.set(nonce, { timestamp: Date.now() });
  
  // Periodically clean up nonces older than 15 minutes to prevent memory leaks
  const now = Date.now();
  for (const [key, value] of nonceCache.entries()) {
    if (now - value.timestamp > 15 * 60 * 1000) {
      nonceCache.delete(key);
    }
  }
  
  return nonce;
}

/**
 * Verifies that a received OAuth state nonce is active and has not been used yet.
 */
export function verifyOAuthState(state: string): boolean {
  if (!state) return false;
  const exists = nonceCache.has(state);
  if (exists) {
    // Nonces are strictly single-use to prevent replay attacks
    nonceCache.delete(state);
    return true;
  }
  return false;
}

/**
 * Constructs the Shopify OAuth Authorization URL to initiate the handshake.
 */
export function createAuthorizationUrl(shop: string, state?: string): string {
  const config = getShopifyConfig();
  const finalState = state || generateOAuthState();
  const normalizedShop = normalizeShopDomain(shop);
  const redirectUri = `${config.appUrl}${config.oauthCallbackPath}`;
  const scopesStr = config.scopes.join(",");
  
  return `https://${normalizedShop}/admin/oauth/authorize?client_id=${config.apiKey}&scope=${scopesStr}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${finalState}`;
}

/**
 * Performs timing-safe Shopify HMAC signature verification using the API secret.
 */
export function verifyShopifyHmac(query: Record<string, any>): boolean {
  const config = getShopifyConfig();
  const receivedHmac = query.hmac;
  if (!receivedHmac || !config.apiSecret) {
    return false;
  }

  // Clone parameters and remove the hmac key from signature verification input
  const params = { ...query };
  delete params.hmac;

  // Sort parameter keys alphabetically and construct the canonical query string
  const sortedKeys = Object.keys(params).sort();
  const message = sortedKeys
    .map(key => `${key}=${params[key]}`)
    .join("&");

  const calculatedHmac = crypto
    .createHmac("sha256", config.apiSecret)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculatedHmac, "utf8"),
      Buffer.from(receivedHmac, "utf8")
    );
  } catch (err) {
    return false;
  }
}

/**
 * Executes a real HTTP POST request to exchange the authorization code for an access token.
 */
export async function exchangeCodeForAccessToken(
  shop: string,
  code: string
): Promise<{ accessToken: string; scope: string }> {
  const config = getShopifyConfig();
  const normalizedShop = normalizeShopDomain(shop);
  
  const tokenUrl = `https://${normalizedShop}/admin/oauth/access_token`;
  const body = {
    client_id: config.apiKey,
    client_secret: config.apiSecret,
    code
  };

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    // NEVER log raw body with secret parameters!
    throw new Error(`Shopify OAuth token exchange failed: HTTP ${response.status}`);
  }

  const data: any = await response.json();
  if (!data.access_token) {
    throw new Error("Shopify OAuth response did not contain an access_token");
  }

  return {
    accessToken: data.access_token,
    scope: data.scope || ""
  };
}

/**
 * Safe parser for Shopify scopes.
 * Handles both string and string[] inputs gracefully.
 * Trims whitespace, removes empty values, deduplicates, and lowercases.
 * Does not throw on empty/undefined input.
 */
export function parseScopeList(scopeValue?: string | string[] | null): string[] {
  if (!scopeValue) return [];
  let list: string[] = [];
  if (Array.isArray(scopeValue)) {
    list = scopeValue;
  } else if (typeof scopeValue === "string") {
    list = scopeValue.split(",");
  } else {
    return [];
  }
  const normalized = list
    .map(s => (s || "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

/**
 * Persists the connected store details securely into the StoreRepository after successful OAuth.
 */
export async function connectShopFromOAuth(params: {
  shop: string;
  accessToken: string;
  scope: string;
}): Promise<ShopifyStoreConnection> {
  const { shop, accessToken, scope } = params;
  const normalizedShop = normalizeShopDomain(shop);
  
  // Immediately encrypt the access token. Never store or log it raw!
  const accessTokenEncrypted = await encryptAccessToken(accessToken);

  const config = getShopifyConfig();
  const tokenResponseScopes = parseScopeList(scope);
  const configuredScopes = parseScopeList(config.scopes);
  
  const fallbackUsed = tokenResponseScopes.length === 0;
  const grantedScopes = tokenResponseScopes.length > 0 ? tokenResponseScopes : configuredScopes;

  const repos = getRepositories();
  let connection = await repos.stores.getStoreConnectionByUrl(normalizedShop);

  if (connection) {
    connection = await repos.stores.updateStoreConnection(connection.id, {
      accessTokenEncrypted,
      scopes: grantedScopes,
      status: "CONNECTED",
      connectedAt: new Date().toISOString()
    });
  } else {
    connection = await repos.stores.createStoreConnection({
      id: `store-${crypto.randomUUID()}`,
      organizationId: "demo-org-id", // Sandboxed SaaS tenant organization identifier
      storeUrl: normalizedShop,
      accessTokenEncrypted,
      scopes: grantedScopes,
      status: "CONNECTED",
      connectedAt: new Date().toISOString(),
      plan: "Standard Plan",
      currency: "USD"
    });
  }

  if (!connection) {
    throw new Error("Failed to persist store connection in StoreRepository");
  }

  // Synchronize legacy in-memory mock store state to immediately reflect connection in Dashboard
  const shopName = normalizedShop.split(".")[0].replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  setShopifyStore({
    url: normalizedShop,
    name: shopName || "Shopify Store",
    connected: true,
    connectedAt: connection.connectedAt,
    plan: connection.plan,
    currency: connection.currency,
    scopes: connection.scopes
  });

  writeLog(
    "Shop Owner",
    "SHOP_CONNECTED",
    `Connected Shopify store '${normalizedShop}' via secure OAuth token exchange. Captured ${grantedScopes.length} scopes (fallback to config: ${fallbackUsed}).`,
    { url: normalizedShop, scopesCount: grantedScopes.length, fallbackUsed }
  );

  return connection;
}
