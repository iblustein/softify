import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { syncProductsForShop } from "../services/shopify-product-sync.service.js";
import { normalizeProductsLimit } from "../services/shopify-admin-client.service.js";

const router = Router();

function sanitizeSnapshot(product: any) {
  if (!product) return product;
  const sanitized = { ...product };
  delete sanitized.accessToken;
  delete sanitized.access_token;
  delete sanitized.accessTokenEncrypted;
  delete sanitized.authorization;
  delete sanitized.Authorization;
  return sanitized;
}

/**
 * POST /api/catalog/products/sync
 * Manually trigger product catalog sync from Shopify Admin API into ProductSnapshots.
 */
router.post("/products/sync", async (req, res) => {
  try {
    const { shop, limit } = req.query;
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Query parameter 'shop' is required."
        }
      });
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    const normalizedLimit = normalizeProductsLimit(parsedLimit);

    const result = await syncProductsForShop(shop, normalizedLimit);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: "SYNC_FAILED",
        message: error.message
      }
    });
  }
});

/**
 * GET /api/catalog/products
 * Retrieve synced product snapshots from local database.
 */
router.get("/products", async (req, res) => {
  try {
    const { shop, limit } = req.query;
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Query parameter 'shop' is required."
        }
      });
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    const normalizedLimit = normalizeProductsLimit(parsedLimit);

    const repos = getRepositories();
    const list = await repos.products.listProductSnapshotsByShop(shop, normalizedLimit);

    res.json(list.map(sanitizeSnapshot));
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: "READ_FAILED",
        message: error.message
      }
    });
  }
});

/**
 * GET /api/catalog/products/status
 * Check catalog sync status (count and latestSyncAt timestamp).
 */
router.get("/products/status", async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Query parameter 'shop' is required."
        }
      });
    }

    const repos = getRepositories();
    const count = await repos.products.countProductSnapshotsByShop(shop);
    const latestSyncAt = await repos.products.getLatestProductSyncAt(shop);

    res.json({
      count,
      latestSyncAt
    });
  } catch (error: any) {
    res.status(500).json({
      error: {
        code: "STATUS_FAILED",
        message: error.message
      }
    });
  }
});

export default router;
