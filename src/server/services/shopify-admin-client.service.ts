import { getRepositories } from "../repositories/repository-provider.js";
import { decryptAccessToken } from "./token-crypto.service.js";
import { getShopifyAdminApiConfig } from "../config/shopify-admin-api.config.js";
import { isShopifyOAuthConfigured } from "../config/shopify.config.js";
import { getMockProducts } from "../data/mock-products.js";

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

export type NormalizedProduct = {
  id: string;
  title: string | null;
  handle: string | null;
  status: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  totalVariants: number | null;
  featuredImage: {
    url: string | null;
    altText: string | null;
  } | null;
  priceRange: {
    minVariantPrice: {
      amount: string | null;
      currencyCode: string | null;
    };
    maxVariantPrice: {
      amount: string | null;
      currencyCode: string | null;
    };
  } | null;
};

export type NormalizedProductsResult = {
  shopDomain: string;
  products: NormalizedProduct[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  limit: number;
  query: string | null;
  grantedScopes: string[];
};

export function hasScope(connectionScopes: string[], requiredScope: string): boolean {
  return connectionScopes.includes(requiredScope);
}

export function normalizeProductsLimit(value?: number): number {
  if (value === undefined || value === null || !Number.isFinite(value)) return 20;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

export async function readProducts(
  shopDomain: string,
  options?: { limit?: number; query?: string; after?: string; }
): Promise<NormalizedProductsResult> {
  const cleanShop = normalizeShopDomain(shopDomain);
  if (!cleanShop) {
    throw new ShopifyAdminApiError("SHOPIFY_STORE_NOT_CONNECTED", "Shop domain cannot be empty.");
  }

  // Parse and enforce safe server-side limits
  const limit = normalizeProductsLimit(options?.limit);
  const searchQuery = options?.query || null;
  const afterCursor = options?.after || null;

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

  // 2. Validate scopes
  // In mock fallback where no connection exists, assume it is granted. Otherwise check connection scopes.
  const scopes = connection?.scopes || [];
  if (connection && !hasScope(scopes, "read_products")) {
    throw new ShopifyAdminApiError(
      "SHOPIFY_SCOPE_MISSING",
      "The connected Shopify store is missing the required read_products scope."
    );
  }

  // 3. Mock fallback routing (only allowed when OAuth is not configured OR explicit local mock domains are queried)
  if (!isConfigured || isMockDomain) {
    const allMockProducts = getMockProducts();
    
    // Convert to normalized products
    let mockNormalized: NormalizedProduct[] = allMockProducts.map(p => ({
      id: `gid://shopify/Product/${p.id}`,
      title: p.title || null,
      handle: p.title ? p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") : null,
      status: p.status ? p.status.toUpperCase() : null,
      vendor: "Mock Vendor",
      productType: "Mock Type",
      tags: ["mock"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalVariants: p.inventory > 0 ? 1 : 0,
      featuredImage: p.image ? { url: p.image, altText: p.title } : null,
      priceRange: {
        minVariantPrice: { amount: String(p.price), currencyCode: "USD" },
        maxVariantPrice: { amount: String(p.price), currencyCode: "USD" }
      }
    }));

    // Filter by query if provided
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      mockNormalized = mockNormalized.filter(p => 
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.handle && p.handle.toLowerCase().includes(q))
      );
    }

    // Apply cursor pagination if after is provided
    let startIndex = 0;
    if (afterCursor) {
      const index = mockNormalized.findIndex(p => p.id === afterCursor);
      if (index !== -1) {
        startIndex = index + 1;
      }
    }

    const paginatedProducts = mockNormalized.slice(startIndex, startIndex + limit);
    const hasNextPage = startIndex + limit < mockNormalized.length;
    const endCursor = paginatedProducts.length > 0 ? paginatedProducts[paginatedProducts.length - 1].id : null;

    return {
      shopDomain: cleanShop,
      products: paginatedProducts,
      pageInfo: {
        hasNextPage,
        endCursor
      },
      limit,
      query: searchQuery,
      grantedScopes: scopes.length > 0 ? scopes : ["read_products"]
    };
  }

  // Real OAuth configured mode and connection is valid. Decrypt access token securely.
  const { accessTokenEncrypted } = connection!;
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

  // Execute Graphql request
  const { apiVersion } = getShopifyAdminApiConfig();
  const graphqlUrl = `https://${cleanShop}/admin/api/${apiVersion}/graphql.json`;

  const queryStr = `
    query Products($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node {
            id
            title
            handle
            status
            vendor
            productType
            tags
            createdAt
            updatedAt
            totalVariants
            featuredImage {
              url
              altText
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
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
      body: JSON.stringify({
        query: queryStr,
        variables: {
          first: limit,
          after: afterCursor,
          query: searchQuery
        }
      })
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

  const productsData = responseJson?.data?.products || {};
  const edges = productsData.edges || [];
  const pageInfo = productsData.pageInfo || { hasNextPage: false, endCursor: null };

  const products: NormalizedProduct[] = edges.map((edge: any) => {
    const node = edge.node || {};
    const priceRangeRaw = node.priceRangeV2 || null;

    return {
      id: node.id,
      title: node.title || null,
      handle: node.handle || null,
      status: node.status || null,
      vendor: node.vendor || null,
      productType: node.productType || null,
      tags: node.tags || [],
      createdAt: node.createdAt || null,
      updatedAt: node.updatedAt || null,
      totalVariants: node.totalVariants || null,
      featuredImage: node.featuredImage ? {
        url: node.featuredImage.url || null,
        altText: node.featuredImage.altText || null
      } : null,
      priceRange: priceRangeRaw ? {
        minVariantPrice: {
          amount: priceRangeRaw.minVariantPrice?.amount || null,
          currencyCode: priceRangeRaw.minVariantPrice?.currencyCode || null
        },
        maxVariantPrice: {
          amount: priceRangeRaw.maxVariantPrice?.amount || null,
          currencyCode: priceRangeRaw.maxVariantPrice?.currencyCode || null
        }
      } : null
    };
  });

  return {
    shopDomain: cleanShop,
    products,
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage || false,
      endCursor: pageInfo.endCursor || null
    },
    limit,
    query: searchQuery,
    grantedScopes: scopes
  };
}
