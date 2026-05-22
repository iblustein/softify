import { getRepositories } from "../repositories/repository-provider.js";
import { readProducts } from "./shopify-admin-client.service.js";
import { ProductSnapshot } from "../domain/types.js";

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

export async function syncProductsForShop(
  shopDomain: string,
  limit?: number
): Promise<{ count: number; latestSyncAt: string }> {
  const cleanShop = normalizeShopDomain(shopDomain);
  const repos = getRepositories();

  // 1. Fetch store connection
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);
  if (!connection) {
    throw new Error(`Shopify store connection not found for shop domain '${cleanShop}'.`);
  }

  // 2. Read products from Shopify GraphQL
  const productsResult = await readProducts(cleanShop, { limit });
  const products = productsResult.products;

  const now = new Date().toISOString();

  // 3. Map to ProductSnapshot and upsert
  for (const p of products) {
    const shopifyProductId = p.id.split("/").pop() || p.id;
    const docId = `${cleanShop}_${shopifyProductId}`;

    const snapshot: ProductSnapshot = {
      id: docId,
      organizationId: connection.organizationId,
      storeConnectionId: connection.id,
      shopDomain: cleanShop,
      shopifyProductId,
      title: p.title || "",
      handle: p.handle || "",
      status: p.status || "UNKNOWN",
      vendor: p.vendor || undefined,
      productType: p.productType || undefined,
      tags: p.tags || [],
      variantsCount: p.totalVariants || 0,
      imagesCount: p.featuredImage ? 1 : 0,
      createdAt: p.createdAt || now,
      updatedAt: p.updatedAt || now,
      syncedAt: now
    };

    await repos.products.upsertProductSnapshot(snapshot);
  }

  return {
    count: products.length,
    latestSyncAt: now
  };
}
