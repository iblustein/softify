import { Router } from "express";
import { isShopifyOAuthConfigured, getShopifyConfig } from "../config/shopify.config.js";
import {
  validateShopDomain,
  normalizeShopDomain,
  createAuthorizationUrl,
  verifyShopifyHmac,
  verifyOAuthState,
  exchangeCodeForAccessToken,
  connectShopFromOAuth
} from "../services/shopify-oauth.service.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { checkHealth } from "../services/shopify-connection-health.service.js";

const router = Router();

/**
 * GET /api/shopify/oauth/status
 * Exposes current Shopify OAuth config and connection status.
 */
router.get("/status", async (req, res) => {
  try {
    const { shop, check_setup } = req.query;
    const shopToCheck = typeof shop === "string" ? shop : null;

    const health = await checkHealth(shopToCheck);

    const responseData: any = {
      configured: health.configured,
      connected: health.connected,
      status: health.status,
      shop: health.shop,
      scopes: health.actualScopes.length > 0 ? health.actualScopes : health.storedScopes,
      requiredScopes: health.requiredScopes,
      storedScopes: health.storedScopes,
      actualScopes: health.actualScopes,
      missingScopes: health.missingScopes,
      tokenValid: health.tokenValid,
      message: health.message
    };

    if (check_setup === "true") {
      responseData.testShop = getShopifyConfig().testShop;
    }

    res.json(responseData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shopify/oauth/install
 * Initiates the Shopify OAuth installation flow.
 */
router.get("/install", (req, res) => {
  try {
    // 1. Only return 503 if OAuth is not configured and install is explicitly attempted
    if (!isShopifyOAuthConfigured()) {
      return res.status(503).json({
        error: "Shopify OAuth configuration is missing on this server instance. Falling back to local prototype connection mode."
      });
    }

    const { shop } = req.query;
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ error: "Query parameter 'shop' is required" });
    }

    const normalizedShop = normalizeShopDomain(shop);
    if (!validateShopDomain(normalizedShop)) {
      return res.status(400).json({
        error: "Invalid shop domain. Shopify store domains must end with '.myshopify.com'"
      });
    }

    // 2. Generate authorization URL and redirect the user
    const authUrl = createAuthorizationUrl(normalizedShop);
    res.redirect(authUrl);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/shopify/oauth/callback
 * Handles the redirect callback from Shopify after user permission approval.
 */
router.get("/callback", async (req, res) => {
  try {
    const { shop, hmac, code, state } = req.query;

    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ error: "Missing parameter 'shop'" });
    }
    if (!hmac || typeof hmac !== "string") {
      return res.status(400).json({ error: "Missing parameter 'hmac'" });
    }
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing parameter 'code'" });
    }
    if (!state || typeof state !== "string") {
      return res.status(400).json({ error: "Missing parameter 'state'" });
    }

    // 1. HMAC Signature Verification
    const isHmacValid = verifyShopifyHmac(req.query);
    if (!isHmacValid) {
      return res.status(400).json({ error: "HMAC signature verification failed. The request may be untrusted." });
    }

    // 2. State/Nonce validation
    const isStateValid = verifyOAuthState(state);
    if (!isStateValid) {
      return res.status(400).json({ error: "OAuth State validation failed. Request may have expired or been replayed." });
    }

    // 3. Real HTTP POST Exchange for access token
    const tokenResult = await exchangeCodeForAccessToken(shop, code);

    // 4. Secure persistence to StoreRepository
    await connectShopFromOAuth({
      shop,
      accessToken: tokenResult.accessToken,
      scope: tokenResult.scope
    });

    // 5. Successful connection redirect to frontend
    res.redirect(`/?shopify_connected=true&shop=${encodeURIComponent(shop)}`);
  } catch (error: any) {
    console.error("[SHOPIFY OAUTH] Error in callback handler:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
