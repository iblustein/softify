export interface ShopifyAdminApiConfig {
  apiVersion: string;
}

/**
 * Reads environment configuration variables for Shopify Admin API connections.
 */
export function getShopifyAdminApiConfig(): ShopifyAdminApiConfig {
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2025-10";
  return {
    apiVersion
  };
}
