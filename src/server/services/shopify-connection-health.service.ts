import { getShopifyConfig, isShopifyOAuthConfigured } from "../config/shopify.config.js";
import { normalizeShopDomain } from "./shopify-oauth.service.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { decryptAccessToken } from "./token-crypto.service.js";
import { getShopifyAdminApiConfig } from "../config/shopify-admin-api.config.js";

export interface ShopifyConnectionHealth {
  configured: boolean;
  connected: boolean;
  status: "CONNECTED" | "DISCONNECTED" | "REAUTH_REQUIRED" | "MISSING_SCOPES" | "ERROR";
  shop: string | null;
  requiredScopes: string[];
  storedScopes: string[];
  actualScopes: string[];
  missingScopes: string[];
  tokenValid: boolean;
  message?: string;
}

/**
 * Checks the connection health of the active Shopify storefront integration.
 * Performs deep live validation against the Shopify Admin API if configured,
 * catching unauthorized/access denied errors or missing scopes and updating DB status.
 */
export async function checkHealth(shopDomain: string | null): Promise<ShopifyConnectionHealth> {
  const config = getShopifyConfig();
  const requiredScopes = config.scopes;

  // 1. If OAuth is not configured, preserve mock/offline behavior.
  if (!isShopifyOAuthConfigured()) {
    const repos = getRepositories();
    let conn = null;
    if (shopDomain) {
      const cleanShop = normalizeShopDomain(shopDomain);
      conn = await repos.stores.getStoreConnectionByUrl(cleanShop);
    } else {
      const conns = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
      conn = conns.find(c => c.status === "CONNECTED") || conns[0] || null;
    }

    const isConnected = conn ? conn.status === "CONNECTED" : false;
    return {
      configured: false,
      connected: isConnected,
      status: isConnected ? "CONNECTED" : "DISCONNECTED",
      shop: conn ? conn.storeUrl : null,
      requiredScopes,
      storedScopes: conn ? conn.scopes : [],
      actualScopes: conn ? conn.scopes : [],
      missingScopes: [],
      tokenValid: isConnected,
      message: isConnected 
        ? "Mock store is connected in offline prototype mode." 
        : "No mock store is connected."
    };
  }

  // OAuth IS configured
  const repos = getRepositories();
  let connection = null;

  if (shopDomain) {
    const cleanShop = normalizeShopDomain(shopDomain);
    connection = await repos.stores.getStoreConnectionByUrl(cleanShop);
  } else {
    const conns = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
    // Prioritize CONNECTED, then REAUTH_REQUIRED, then others
    connection = conns.find(c => c.status === "CONNECTED") ||
                 conns.find(c => c.status === "REAUTH_REQUIRED") ||
                 conns[0] || null;
  }

  // 2. If no connection exists, return DISCONNECTED.
  if (!connection) {
    return {
      configured: true,
      connected: false,
      status: "DISCONNECTED",
      shop: shopDomain ? normalizeShopDomain(shopDomain) : null,
      requiredScopes,
      storedScopes: [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: "No store connection exists for this shop."
    };
  }

  // 3. If connection status is DISCONNECTED, return DISCONNECTED.
  if (connection.status === "DISCONNECTED") {
    return {
      configured: true,
      connected: false,
      status: "DISCONNECTED",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: "Store connection status is DISCONNECTED in database."
    };
  }

  // 4. If connection status is REAUTH_REQUIRED but an encrypted token exists, run the live Shopify health check anyway.
  if (!connection.accessTokenEncrypted) {
    const targetStatus = connection.status === "REAUTH_REQUIRED" ? "REAUTH_REQUIRED" : "DISCONNECTED";
    return {
      configured: true,
      connected: false,
      status: targetStatus,
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: "No access token credentials found for store connection."
    };
  }

  // 8. Do not mock-bypass real Shopify domains when OAuth is configured.
  // We can still mock-bypass standard mock sandbox domains (glowthread-apparel, luminary-essentials, yambasurf-co-il) for offline testing:
  const isMockDomain = connection.storeUrl.includes("glowthread-apparel") || 
                       connection.storeUrl.includes("luminary-essentials") ||
                       connection.storeUrl.includes("yambasurf-co-il");

  if (isMockDomain) {
    return {
      configured: true,
      connected: connection.status === "CONNECTED",
      status: connection.status as any,
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: connection.scopes || [],
      missingScopes: [],
      tokenValid: true,
      message: "Mock store domain bypasses live API health check."
    };
  }

  // Live health check
  let accessToken: string;
  try {
    accessToken = await decryptAccessToken(connection.accessTokenEncrypted);
  } catch (err: any) {
    await repos.stores.updateStoreConnection(connection.id, { status: "REAUTH_REQUIRED" });
    return {
      configured: true,
      connected: false,
      status: "REAUTH_REQUIRED",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: "Access token decryption failed. Re-authorization is required."
    };
  }

  const { apiVersion } = getShopifyAdminApiConfig();
  const graphqlUrl = `https://${connection.storeUrl}/admin/api/${apiVersion}/graphql.json`;

  const query = `
    query {
      currentAppInstallation {
        accessScopes {
          handle
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
    return {
      configured: true,
      connected: false,
      status: "ERROR",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: `Network request to Shopify Admin API failed: ${err.message}`
    };
  }

  // 6. If Shopify returns 401, 403, or GraphQL access denied, update DB status to REAUTH_REQUIRED.
  if (response.status === 401 || response.status === 403) {
    await repos.stores.updateStoreConnection(connection.id, { status: "REAUTH_REQUIRED" });
    return {
      configured: true,
      connected: false,
      status: "REAUTH_REQUIRED",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: `Shopify Admin API returned HTTP status ${response.status}. Re-authorization is required.`
    };
  }

  if (!response.ok) {
    return {
      configured: true,
      connected: false,
      status: "ERROR",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: `Shopify Admin API returned HTTP status ${response.status}.`
    };
  }

  let responseJson: any;
  try {
    responseJson = await response.json();
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      status: "ERROR",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: connection.scopes || [],
      actualScopes: [],
      missingScopes: requiredScopes,
      tokenValid: false,
      message: "Failed to parse Shopify Admin API JSON response."
    };
  }

  // 6. If Shopify returns GraphQL access denied, update DB status to REAUTH_REQUIRED.
  if (responseJson.errors && responseJson.errors.length > 0) {
    const errorMsg = responseJson.errors.map((e: any) => e.message).join(", ");
    const isAccessDenied = responseJson.errors.some((e: any) => 
      (e.message && e.message.toLowerCase().includes("access denied")) ||
      (e.extensions && e.extensions.code === "ACCESS_DENIED")
    );

    if (isAccessDenied) {
      await repos.stores.updateStoreConnection(connection.id, { status: "REAUTH_REQUIRED" });
      return {
        configured: true,
        connected: false,
        status: "REAUTH_REQUIRED",
        shop: connection.storeUrl,
        requiredScopes,
        storedScopes: connection.scopes || [],
        actualScopes: [],
        missingScopes: requiredScopes,
        tokenValid: false,
        message: `Shopify Admin API returned access denied: ${errorMsg}`
      };
    } else {
      return {
        configured: true,
        connected: false,
        status: "ERROR",
        shop: connection.storeUrl,
        requiredScopes,
        storedScopes: connection.scopes || [],
        actualScopes: [],
        missingScopes: requiredScopes,
        tokenValid: false,
        message: `Shopify Admin API GraphQL errors: ${errorMsg}`
      };
    }
  }

  // Load actual scopes loaded via currentAppInstallation.accessScopes
  const accessScopesRaw = responseJson?.data?.currentAppInstallation?.accessScopes || [];
  const actualScopes: string[] = accessScopesRaw.map((s: any) => s.handle).filter(Boolean);

  // Calculate missing scopes
  const missingScopes = requiredScopes.filter(s => !actualScopes.includes(s));

  // 7. If actual scopes are missing, return MISSING_SCOPES and update DB status to REAUTH_REQUIRED.
  if (missingScopes.length > 0) {
    await repos.stores.updateStoreConnection(connection.id, { 
      status: "REAUTH_REQUIRED",
      scopes: actualScopes
    });
    return {
      configured: true,
      connected: false,
      status: "MISSING_SCOPES",
      shop: connection.storeUrl,
      requiredScopes,
      storedScopes: actualScopes,
      actualScopes,
      missingScopes,
      tokenValid: true,
      message: `The connected store is missing requested scopes: ${missingScopes.join(", ")}`
    };
  }

  // 5. If live health check succeeds and actual scopes include required scopes, update DB status back to CONNECTED.
  await repos.stores.updateStoreConnection(connection.id, { 
    status: "CONNECTED",
    scopes: actualScopes
  });

  return {
    configured: true,
    connected: true,
    status: "CONNECTED",
    shop: connection.storeUrl,
    requiredScopes,
    storedScopes: actualScopes,
    actualScopes,
    missingScopes: [],
    tokenValid: true,
    message: "Store connection is healthy and fully authorized."
  };
}
