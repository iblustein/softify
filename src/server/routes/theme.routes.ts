import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { listThemes, listThemeAssets, getThemeAssetContent, updateThemeAsset, validateAssetPath } from "../services/shopify-theme.service.js";

const router = Router();

// Helper to validate tenant context for theme actions
async function validateThemeTenant(req: any, res: any) {
  const shop = req.query.shop || req.body.shop;
  const organizationId = req.query.organizationId || req.body.organizationId || req.headers["x-organization-id"];

  if (!shop || typeof shop !== "string") {
    res.status(400).json({ error: "Missing or invalid shop domain.", code: "MISSING_SHOP" });
    return null;
  }

  const cleanShop = normalizeShopDomain(shop);
  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  if (!connection) {
    res.status(404).json({ error: "Store connection not found.", code: "UNKNOWN_SHOP" });
    return null;
  }

  if (connection.status !== "CONNECTED") {
    res.status(409).json({ error: "Store connection status is disconnected.", code: "DISCONNECTED_SHOP" });
    return null;
  }

  if (organizationId && connection.organizationId !== organizationId) {
    res.status(403).json({ error: "Access denied. Tenant context mismatch.", code: "ACCESS_DENIED" });
    return null;
  }

  return { connection, cleanShop };
}

/**
 * GET /api/theme/status
 * Returns readiness for theme modifications.
 */
router.get("/theme/status", async (req, res) => {
  try {
    const tenantCtx = await validateThemeTenant(req, res);
    if (!tenantCtx) return;
    const { connection, cleanShop } = tenantCtx;

    const hasRead = connection.scopes.includes("read_themes");
    const hasWrite = connection.scopes.includes("write_themes");

    res.json({
      shopDomain: cleanShop,
      ready: hasRead && hasWrite,
      scopes: {
        read_themes: hasRead,
        write_themes: hasWrite
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/theme/themes
 * Lists available themes on the connected Shopify store.
 */
router.get("/theme/themes", async (req, res) => {
  try {
    const tenantCtx = await validateThemeTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop } = tenantCtx;

    const themes = await listThemes(cleanShop);
    res.json(themes);
  } catch (error: any) {
    console.error("List themes failed:", error.message);
    res.status(500).json({ error: error.message || "Failed to load store themes.", code: "THEME_FETCH_FAILED" });
  }
});

/**
 * GET /api/theme/assets
 * Lists asset keys (files) within a theme.
 */
router.get("/theme/assets", async (req, res) => {
  try {
    const { themeId } = req.query;
    if (!themeId || typeof themeId !== "string") {
      return res.status(400).json({ error: "Missing themeId query parameter.", code: "MISSING_THEME_ID" });
    }

    const tenantCtx = await validateThemeTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop } = tenantCtx;

    const assets = await listThemeAssets(cleanShop, themeId);
    res.json(assets);
  } catch (error: any) {
    console.error("List assets failed:", error.message);
    res.status(500).json({ error: error.message || "Failed to load theme assets.", code: "ASSET_LIST_FAILED" });
  }
});

/**
 * GET /api/theme/assets/content
 * Reads specific theme asset content.
 */
router.get("/theme/assets/content", async (req, res) => {
  try {
    const { themeId, assetKey } = req.query;
    if (!themeId || typeof themeId !== "string") {
      return res.status(400).json({ error: "Missing themeId parameter.", code: "MISSING_THEME_ID" });
    }
    if (!assetKey || typeof assetKey !== "string") {
      return res.status(400).json({ error: "Missing assetKey parameter.", code: "MISSING_ASSET_KEY" });
    }

    // Path Safety Gating
    if (!validateAssetPath(assetKey)) {
      return res.status(403).json({ error: "Forbidden. Reading outside allowed folders or path traversal detected.", code: "UNSAFE_PATH" });
    }

    const tenantCtx = await validateThemeTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop } = tenantCtx;

    const content = await getThemeAssetContent(cleanShop, themeId, assetKey);
    res.json({
      themeId,
      assetKey,
      content
    });
  } catch (error: any) {
    console.error("Read asset content failed:", error.message);
    res.status(500).json({ error: error.message || "Failed to read file content.", code: "ASSET_READ_FAILED" });
  }
});

/**
 * POST /api/theme/assets/update
 * Safely writes/updates a theme file (Backup created before write).
 * [DISABLED IN PHASE 11.0 Gated Security Model] All theme writes must go through the Theme Editor Apply conversational flow.
 */
router.post("/theme/assets/update", async (req: any, res: any) => {
  return res.status(403).json({
    error: "Direct write operations are disabled. Theme edits must go through the Theme Editor approval/apply conversational flow.",
    code: "DIRECT_WRITE_DISABLED"
  });
});

export default router;
