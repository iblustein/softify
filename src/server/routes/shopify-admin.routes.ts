import { Router } from "express";
import { readShopInfo, readProducts, ShopifyAdminApiError } from "../services/shopify-admin-client.service.js";

const router = Router();

/**
 * GET /api/shopify/admin/shop
 * Manual test and debug validation endpoint.
 * Returns basic shop settings and info using the Admin API client.
 * 
 * TODO: Protect this endpoint with authenticated tenant session before production.
 * 
 * Security Constraints:
 * 1. This endpoint MUST NEVER return:
 *    - raw access tokens
 *    - encrypted access tokens
 *    - authorization headers
 *    - stack traces
 *    - sensitive internal error details
 */
router.get("/shop", async (req, res) => {
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

    const shopInfo = await readShopInfo(shop);
    res.json(shopInfo);
  } catch (error: any) {
    const code = error instanceof ShopifyAdminApiError ? error.code : "INTERNAL_SERVER_ERROR";
    const status = error instanceof ShopifyAdminApiError && error.code === "SHOPIFY_STORE_NOT_CONNECTED" ? 404 : 500;
    
    // Standardize error payload - strictly avoiding stack traces, tokens, or raw headers
    res.status(status).json({
      error: {
        code,
        message: error.message
      }
    });
  }
});

/**
 * GET /api/shopify/admin/products
 * Manual test and debug validation endpoint.
 * Returns a list of products using the Admin API client.
 * 
 * TODO: Protect this endpoint with authenticated tenant session before production.
 * 
 * Security Constraints:
 * 1. This endpoint MUST NEVER return:
 *    - raw access tokens
 *    - encrypted access tokens
 *    - authorization headers
 *    - stack traces
 *    - sensitive internal error details
 */
router.get("/products", async (req, res) => {
  try {
    const { shop, limit, query, after } = req.query;
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Query parameter 'shop' is required."
        }
      });
    }

    const parsedLimit = limit ? Number(limit) : undefined;
    const searchQuery = typeof query === "string" ? query : undefined;
    const afterCursor = typeof after === "string" ? after : undefined;

    const productsResult = await readProducts(shop, {
      limit: parsedLimit,
      query: searchQuery,
      after: afterCursor
    });

    res.json(productsResult);
  } catch (error: any) {
    const code = error instanceof ShopifyAdminApiError ? error.code : "INTERNAL_SERVER_ERROR";
    
    let status = 500;
    if (error instanceof ShopifyAdminApiError) {
      if (error.code === "SHOPIFY_STORE_NOT_CONNECTED") {
        status = 404;
      } else if (error.code === "SHOPIFY_SCOPE_MISSING") {
        status = 403;
      }
    }

    // Standardize error payload - strictly avoiding stack traces, tokens, or raw headers
    res.status(status).json({
      error: {
        code,
        message: error.message
      }
    });
  }
});

export default router;
