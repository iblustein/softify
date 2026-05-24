import { getRepositories } from "../repositories/repository-provider.js";
import { ProductSnapshot } from "../domain/types.js";

// Constraints and thresholds as requested
export const MAX_INSIGHT_PRODUCTS = 1000;
export const SAMPLE_LIMIT = 5;
export const SUMMARY_LIMIT = 10;
export const CATALOG_STALE_AFTER_HOURS = 24;

export interface InsightResponse<T> {
  ok: boolean;
  shopDomain: string;
  insightType: string;
  generatedAt: string;
  totalProductsAnalyzed: number;
  capped: boolean;
  data: T;
}

interface ProductSample {
  id: string;
  title: string;
  handle: string;
}

/**
 * Load shop product snapshots with bounded cap
 */
async function loadBoundedProducts(shopDomain: string) {
  const repos = getRepositories();
  const products = await repos.products.listProductSnapshotsByShop(shopDomain, MAX_INSIGHT_PRODUCTS);
  return {
    products,
    capped: products.length >= MAX_INSIGHT_PRODUCTS
  };
}

function mapSample(p: ProductSnapshot): ProductSample {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle
  };
}

/**
 * catalog.insights.health
 * Returns a comprehensive, deterministic health score and count summaries
 */
export async function getCatalogHealth(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);
  const total = products.length;
  const now = Date.now();
  const staleThresholdMs = CATALOG_STALE_AFTER_HOURS * 60 * 60 * 1000;

  let missingImagesCount = 0;
  let missingVendorCount = 0;
  let missingProductTypeCount = 0;
  let noVariantsCount = 0;
  let staleCount = 0;
  let missingSyncTimestampCount = 0;

  for (const p of products) {
    if (p.imagesCount === undefined || p.imagesCount === null || p.imagesCount === 0) {
      missingImagesCount++;
    }
    if (!p.vendor || p.vendor.trim() === "") {
      missingVendorCount++;
    }
    if (!p.productType || p.productType.trim() === "") {
      missingProductTypeCount++;
    }
    if (p.variantsCount === undefined || p.variantsCount === null || p.variantsCount === 0) {
      noVariantsCount++;
    }
    if (!p.syncedAt) {
      missingSyncTimestampCount++;
    } else {
      const ageMs = now - new Date(p.syncedAt).getTime();
      if (ageMs > staleThresholdMs) {
        staleCount++;
      }
    }
  }

  // Deterministic and transparent health score formula
  // Start at 100, apply capped penalties
  let score = 100;
  const explanations: string[] = [];

  if (missingImagesCount > 0) {
    const penalty = Math.min(missingImagesCount * 5, 25);
    score -= penalty;
    explanations.push(`Deducted ${penalty} points due to ${missingImagesCount} product(s) missing images.`);
  }

  if (missingVendorCount > 0) {
    const penalty = Math.min(missingVendorCount * 5, 15);
    score -= penalty;
    explanations.push(`Deducted ${penalty} points due to ${missingVendorCount} product(s) missing vendor configuration.`);
  }

  if (missingProductTypeCount > 0) {
    const penalty = Math.min(missingProductTypeCount * 5, 15);
    score -= penalty;
    explanations.push(`Deducted ${penalty} points due to ${missingProductTypeCount} product(s) missing product types.`);
  }

  if (noVariantsCount > 0) {
    const penalty = Math.min(noVariantsCount * 5, 15);
    score -= penalty;
    explanations.push(`Deducted ${penalty} points due to ${noVariantsCount} product(s) containing no variants.`);
  }

  if (staleCount > 0) {
    const penalty = Math.min(staleCount * 10, 30);
    score -= penalty;
    explanations.push(`Deducted ${penalty} points due to ${staleCount} stale product snapshot(s) synced > ${CATALOG_STALE_AFTER_HOURS}h ago.`);
  }

  score = Math.max(score, 0);

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.health",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: total,
    capped,
    data: {
      healthScore: score,
      scoreExplanation: explanations.length > 0 ? explanations.join(" ") : "All products fully configured and freshly synced.",
      metricsSummary: {
        missingImagesCount,
        missingVendorCount,
        missingProductTypeCount,
        noVariantsCount,
        staleCount,
        missingSyncTimestampCount
      }
    }
  };
}

/**
 * catalog.insights.missing_images
 */
export async function getProductsMissingImages(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);
  
  const filtered = products.filter(p => p.imagesCount === undefined || p.imagesCount === null || p.imagesCount === 0);
  const sample = filtered.slice(0, SAMPLE_LIMIT).map(mapSample);

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.missing_images",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    capped,
    data: {
      missingImagesCount: filtered.length,
      sample
    }
  };
}

/**
 * catalog.insights.missing_vendor
 */
export async function getProductsMissingVendor(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);

  const filtered = products.filter(p => !p.vendor || p.vendor.trim() === "");
  const sample = filtered.slice(0, SAMPLE_LIMIT).map(mapSample);

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.missing_vendor",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    capped,
    data: {
      missingVendorCount: filtered.length,
      sample
    }
  };
}

/**
 * catalog.insights.missing_product_type
 */
export async function getProductsMissingProductType(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);

  const filtered = products.filter(p => !p.productType || p.productType.trim() === "");
  const sample = filtered.slice(0, SAMPLE_LIMIT).map(mapSample);

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.missing_product_type",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    capped,
    data: {
      missingProductTypeCount: filtered.length,
      sample
    }
  };
}

/**
 * catalog.insights.vendor_summary
 */
export async function getVendorSummary(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);

  const counts: Record<string, number> = {};
  for (const p of products) {
    const v = p.vendor && p.vendor.trim() !== "" ? p.vendor.trim() : "Unconfigured";
    counts[v] = (counts[v] || 0) + 1;
  }

  const vendors = Object.entries(counts)
    .map(([vendor, count]) => ({ vendor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, SUMMARY_LIMIT);

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.vendor_summary",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    capped,
    data: {
      uniqueVendorsCount: Object.keys(counts).length,
      topVendors: vendors
    }
  };
}

/**
 * catalog.insights.product_type_summary
 */
export async function getProductTypeSummary(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);

  const counts: Record<string, number> = {};
  for (const p of products) {
    const t = p.productType && p.productType.trim() !== "" ? p.productType.trim() : "Unconfigured";
    counts[t] = (counts[t] || 0) + 1;
  }

  const types = Object.entries(counts)
    .map(([productType, count]) => ({ productType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, SUMMARY_LIMIT);

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.product_type_summary",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    capped,
    data: {
      uniqueProductTypesCount: Object.keys(counts).length,
      topProductTypes: types
    }
  };
}

/**
 * catalog.insights.stale_snapshots
 */
export async function getStaleSnapshots(shopDomain: string): Promise<InsightResponse<any>> {
  const { products, capped } = await loadBoundedProducts(shopDomain);
  const now = Date.now();
  const staleThresholdMs = CATALOG_STALE_AFTER_HOURS * 60 * 60 * 1000;

  const staleProducts: ProductSample[] = [];
  let missingSyncTimestamp = 0;

  for (const p of products) {
    if (!p.syncedAt) {
      missingSyncTimestamp++;
    } else {
      const ageMs = now - new Date(p.syncedAt).getTime();
      if (ageMs > staleThresholdMs) {
        if (staleProducts.length < SAMPLE_LIMIT) {
          staleProducts.push(mapSample(p));
        }
      }
    }
  }

  const staleCount = products.filter(p => {
    if (!p.syncedAt) return false;
    return (now - new Date(p.syncedAt).getTime()) > staleThresholdMs;
  }).length;

  return {
    ok: true,
    shopDomain,
    insightType: "catalog.insights.stale_snapshots",
    generatedAt: new Date().toISOString(),
    totalProductsAnalyzed: products.length,
    capped,
    data: {
      staleSnapshotsCount: staleCount,
      missingSyncTimestamp,
      staleThresholdHours: CATALOG_STALE_AFTER_HOURS,
      sample: staleProducts
    }
  };
}
