import { getRepositories } from "../repositories/repository-provider.js";
import { decryptAccessToken } from "./token-crypto.service.js";
import { getShopifyAdminApiConfig } from "../config/shopify-admin-api.config.js";
import { isShopifyOAuthConfigured } from "../config/shopify.config.js";

export class ShopifyAdminApiError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message);
    this.name = "ShopifyAdminApiError";
  }
}

/**
 * Normalizes the shop domain to a lowercase, protocol-free, path-free identifier ending in .myshopify.com.
 */
function normalizeShopDomain(shop: string): string {
  if (!shop) return "";
  let domain = shop.trim().toLowerCase();
  
  // Remove leading protocol and www
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  
  // Remove any trailing path/querystring parameters
  domain = domain.split("/")[0];
  
  if (!domain.endsWith(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  
  return domain;
}

export interface ShopifyShopInfo {
  shopDomain: string;
  name: string | null;
  myshopifyDomain: string | null;
  primaryDomain: string | null;
  currencyCode: string | null;
  email: string | null;
  planDisplayName: string | null;
  grantedScopes: string[];
}

/**
 * Safely fetches live shop information from the Shopify Admin GraphQL API.
 * Uses provider-backed store repository and decrypts stored tokens inside this service.
 * Never logs, stores, or returns the decrypted token.
 */
export async function readShopInfo(shopDomain: string): Promise<ShopifyShopInfo> {
  const cleanShop = normalizeShopDomain(shopDomain);
  if (!cleanShop) {
    throw new ShopifyAdminApiError("SHOPIFY_STORE_NOT_CONNECTED", "Shop domain cannot be empty.");
  }

  // Fetch connection from provider-backed StoreRepository
  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  const isMockDomain = cleanShop.includes("glowthread-apparel") || cleanShop.includes("luminary-essentials");
  const isConfigured = isShopifyOAuthConfigured();

  // 1. Strict real OAuth environment validation
  if (isConfigured && !isMockDomain) {
    if (!connection || connection.status !== "CONNECTED") {
      throw new ShopifyAdminApiError("SHOPIFY_STORE_NOT_CONNECTED", `Shopify store '${cleanShop}' is not connected.`);
    }
  }

  // 2. Mock fallback routing (only allowed when OAuth is not configured OR explicit local mock domains are queried)
  if (!isConfigured || isMockDomain) {
    return {
      shopDomain: cleanShop,
      name: connection?.status === "CONNECTED" ? "Demo Store Connection" : "Mock Shop (Dev)",
      myshopifyDomain: cleanShop,
      primaryDomain: `https://${cleanShop}`,
      currencyCode: connection?.currency || "USD",
      email: "owner@example.com",
      planDisplayName: connection?.plan || "Developer Preview",
      grantedScopes: connection?.scopes || []
    };
  }

  // We are in real OAuth configured mode and connection is valid. Decrypt access token securely inside this service.
  const { accessTokenEncrypted, scopes } = connection!;
  if (!accessTokenEncrypted) {
    throw new ShopifyAdminApiError("SHOPIFY_STORE_NOT_CONNECTED", `Shopify store '${cleanShop}' has no persisted access token credentials.`);
  }

  let accessToken: string;
  try {
    accessToken = await decryptAccessToken(accessTokenEncrypted);
  } catch (err: any) {
    throw new ShopifyAdminApiError(
      "SHOPIFY_TOKEN_DECRYPT_FAILED",
      `Failed to decrypt access token for shop '${cleanShop}'.`
    );
  }

  // Execute Graphql request using the minimal requested fields
  const { apiVersion } = getShopifyAdminApiConfig();
  const graphqlUrl = `https://${cleanShop}/admin/api/${apiVersion}/graphql.json`;
  
  const query = `
    query {
      shop {
        name
        myshopifyDomain
        primaryDomain {
          url
        }
        currencyCode
        email
        plan {
          displayName
        }
      }
    }
  `;

  let response: Response;
  try {
    response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Shopify-Access-Token": accessToken
      },
      body: JSON.stringify({ query })
    });
  } catch (err: any) {
    throw new ShopifyAdminApiError(
      "SHOPIFY_ADMIN_API_REQUEST_FAILED",
      `Network request to Shopify Admin API failed: ${err.message}`
    );
  }

  if (!response.ok) {
    throw new ShopifyAdminApiError(
      "SHOPIFY_ADMIN_API_REQUEST_FAILED",
      `Shopify Admin API returned HTTP status ${response.status}.`
    );
  }

  let responseJson: any;
  try {
    responseJson = await response.json();
  } catch (err: any) {
    throw new ShopifyAdminApiError(
      "SHOPIFY_ADMIN_API_REQUEST_FAILED",
      "Failed to parse Shopify Admin API JSON response."
    );
  }

  if (responseJson.errors && responseJson.errors.length > 0) {
    const errorMsg = responseJson.errors.map((e: any) => e.message).join(", ");
    throw new ShopifyAdminApiError(
      "SHOPIFY_ADMIN_API_GRAPHQL_ERROR",
      `Shopify Admin API GraphQL errors: ${errorMsg}`
    );
  }

  const shopData = responseJson?.data?.shop || {};

  return {
    shopDomain: cleanShop,
    name: shopData.name || null,
    myshopifyDomain: shopData.myshopifyDomain || null,
    primaryDomain: shopData.primaryDomain?.url || null,
    currencyCode: shopData.currencyCode || null,
    email: shopData.email || null,
    planDisplayName: shopData.plan?.displayName || null,
    grantedScopes: scopes || []
  };
}
