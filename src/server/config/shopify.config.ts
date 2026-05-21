export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string[];
  appUrl: string;
  oauthCallbackPath: string;
  testShop: string;
}

/**
 * Reads environment configuration variables for Shopify OAuth.
 */
export function getShopifyConfig(): ShopifyConfig {
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const apiSecret = process.env.SHOPIFY_API_SECRET || "";
  
  // Default scopes: read_products,read_orders,read_customers,read_themes,read_content
  const rawScopes = process.env.SHOPIFY_SCOPES || "read_products,read_orders,read_customers,read_themes,read_content";
  const scopes = rawScopes
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
    
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  const oauthCallbackPath = process.env.SHOPIFY_OAUTH_CALLBACK_PATH || "/api/shopify/oauth/callback";
  const testShop = process.env.SHOPIFY_TEST_SHOP || "yambasurf-co-il.myshopify.com";

  return {
    apiKey,
    apiSecret,
    scopes,
    appUrl,
    oauthCallbackPath,
    testShop
  };
}

/**
 * Checks whether Shopify OAuth settings are fully configured.
 */
export function isShopifyOAuthConfigured(): boolean {
  const config = getShopifyConfig();
  // Essential keys to run the OAuth flow: API key, secret, and application URL
  return Boolean(config.apiKey && config.apiSecret && config.appUrl);
}
