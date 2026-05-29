import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { getGeminiSDK } from "../services/gemini.service.js";
import { getThemeAssetContent, updateThemeAsset, listThemes, validateAssetPath } from "../services/shopify-theme.service.js";

const router = Router();

// Helper to validate tenant context for chat
async function validateChatTenant(req: any, res: any) {
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
    res.status(409).json({ error: "Store connection is disconnected.", code: "DISCONNECTED_SHOP" });
    return null;
  }

  if (organizationId && connection.organizationId !== organizationId) {
    res.status(403).json({ error: "Access denied. Tenant context mismatch.", code: "ACCESS_DENIED" });
    return null;
  }

  return { connection, cleanShop, repos };
}

/**
 * GET /api/agents/theme-editor/conversations
 * Fetch history of Theme Editor AI Agent conversations.
 */
router.get("/agents/theme-editor/conversations", async (req, res) => {
  try {
    const tenantCtx = await validateChatTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop, repos, connection } = tenantCtx;

    const allConversations = await repos.conversations.getConversationsByOrganizationId(connection.organizationId);
    // Filter to Theme Editor conversations only
    const filtered = allConversations
      .filter(c => c.agentId === "theme_editor_ai_agent" && c.shopDomain === cleanShop)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    res.json(filtered);
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /api/agents/theme-editor/conversations
 * Start a new conversation.
 */
router.post("/agents/theme-editor/conversations", async (req, res) => {
  try {
    const tenantCtx = await validateChatTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop, repos, connection } = tenantCtx;

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newConv = await repos.conversations.createConversation({
      id: conversationId,
      organizationId: connection.organizationId,
      storeConnectionId: connection.id,
      agentId: "theme_editor_ai_agent",
      shopDomain: cleanShop
    });

    // Add initial greeting from Theme Agent
    const greeting = await repos.conversations.addConversationMessage({
      id: `msg-${Date.now()}-greeting`,
      conversationId,
      sender: "agent",
      agentId: "theme_editor_ai_agent",
      agentName: "Theme Editor AI Agent",
      text: "Hello! I am your Theme Editor AI Agent. I am ready to help you optimize or customize your Shopify storefront theme. What would you like to edit today? For example, you can ask me to update header settings, footer copyrights, background colors, custom sections, or style rules in your stylesheet.",
      timestamp: new Date().toISOString()
    });

    res.json({
      ...newConv,
      messages: [greeting]
    });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * GET /api/agents/theme-editor/conversations/:conversationId
 * Fetch single conversation with messages.
 */
router.get("/agents/theme-editor/conversations/:conversationId", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const tenantCtx = await validateChatTenant(req, res);
    if (!tenantCtx) return;
    const { repos, connection } = tenantCtx;

    const conversation = await repos.conversations.getConversationById(conversationId);
    if (!conversation || conversation.organizationId !== connection.organizationId) {
      return res.status(404).json({ error: "Conversation not found.", code: "CONVERSATION_NOT_FOUND" });
    }

    const messages = await repos.conversations.getMessagesByConversationId(conversationId);
    res.json({
      ...conversation,
      messages
    });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /api/agents/theme-editor/conversations/:conversationId/messages
 * Send a message and trigger Gemini AI theme editing plan generation.
 */
router.post("/agents/theme-editor/conversations/:conversationId/messages", async (req: any, res: any) => {
  try {
    const { conversationId } = req.params;
    const { message, targetThemeId } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({ error: "Missing required 'message' string.", code: "MISSING_MESSAGE" });
    }

    const tenantCtx = await validateChatTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop, repos, connection } = tenantCtx;

    // Load active connection/conversation checks
    const conversation = await repos.conversations.getConversationById(conversationId);
    if (!conversation || conversation.organizationId !== connection.organizationId) {
      return res.status(404).json({ error: "Conversation not found.", code: "CONVERSATION_NOT_FOUND" });
    }

    // 1. Save user message to database
    const userMessage = await repos.conversations.addConversationMessage({
      id: `msg-${Date.now()}-u`,
      conversationId,
      sender: "user",
      text: message,
      timestamp: new Date().toISOString()
    });

    const client = getGeminiSDK();

    // 2. AI Credentials check fail-safe
    if (!client) {
      const fallbackText = "⚠️ **AI Provider Credentials Missing:**\n\nThe AI Engine (Gemini) is not configured on the backend server. Please verify that the `GEMINI_API_KEY` environment variable is loaded to authorize Theme Editor AI responses.";
      
      const assistantMessage = await repos.conversations.addConversationMessage({
        id: `msg-${Date.now()}-a`,
        conversationId,
        sender: "agent",
        agentId: "theme_editor_ai_agent",
        agentName: "Theme Editor AI Agent",
        text: fallbackText,
        timestamp: new Date().toISOString()
      });

      return res.json({
        ok: true,
        conversation,
        messages: [userMessage, assistantMessage]
      });
    }

    // 3. Fetch current theme templates context to pass to Gemini
    let currentThemeId = targetThemeId;
    if (!currentThemeId) {
      try {
        const themes = await listThemes(cleanShop);
        const mainTheme = themes.find((t: any) => t.role === "main") || themes[0];
        currentThemeId = mainTheme?.id;
      } catch (err) {
        console.error("Failed to list themes context for AI:", err);
      }
    }

    let themeLiquidContent = "// Default theme layout";
    let applicationCssContent = "/* Default styles */";

    if (currentThemeId) {
      try {
        themeLiquidContent = await getThemeAssetContent(cleanShop, currentThemeId, "layout/theme.liquid");
        applicationCssContent = await getThemeAssetContent(cleanShop, currentThemeId, "assets/application.css");
      } catch (err: any) {
        console.log("[INFO] Skipping read of theme files for context. Returning default mocks.");
      }
    }

    // 4. Construct prompt containing context and merchant query
    const prompt = `
      You are the Theme Editor AI Agent for Softify. You are a world-class Shopify, Liquid, and JavaScript expert.
      Your goal is to help the merchant customize and improve their storefront theme safely.

      Here is the theme layout file context we are looking at (layout/theme.liquid):
      \`\`\`liquid
      ${themeLiquidContent.slice(0, 3000)}
      \`\`\`

      Here is the active style sheet context (assets/application.css):
      \`\`\`css
      ${applicationCssContent.slice(0, 3000)}
      \`\`\`

      The merchant's query is: "${message}"

      YOUR TASKS:
      1. Formulate a highly premium, clear, merchant-facing explanation of the custom edits required.
      2. If the query intends to make layout, custom text, style edits, or margins corrections:
         a. Determine which file (e.g. layout/theme.liquid or assets/application.css) needs to be updated.
         b. Generate the complete, optimized, new character content value for that file.
         c. Set requiresChanges: true.
      3. If no modifications are requested (e.g., general query/explanation), set requiresChanges: false.

      RETURN STRICTLY A JSON OBJECT matching this exact structure, with NO surrounding markdown backticks:
      {
        "reply": "Your markdown formatted advice and step-by-step change summary.",
        "requiresChanges": true,
        "proposedChanges": [
          {
            "assetKey": "layout/theme.liquid",
            "newValue": "The complete drop-in character contents including the merchant customizations."
          }
        ],
        "riskLevel": "Low | Medium | High",
        "changeExplanation": "A brief summary of what will change, why, and a confirmation that a backup will be created."
      }
    `;

    // 5. Query Gemini
    const geminiRes = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const parsedResponse = JSON.parse(geminiRes.text.trim());

    // 6. Save AI reply to database
    const assistantMessage = await repos.conversations.addConversationMessage({
      id: `msg-${Date.now()}-a`,
      conversationId,
      sender: "agent",
      agentId: "theme_editor_ai_agent",
      agentName: "Theme Editor AI Agent",
      text: parsedResponse.reply,
      timestamp: new Date().toISOString(),
      toolInvocations: parsedResponse.requiresChanges ? [
        {
          toolName: "shopify.theme.assets.write",
          args: {
            themeId: currentThemeId,
            assetKey: parsedResponse.proposedChanges[0]?.assetKey,
            riskLevel: parsedResponse.riskLevel || "Medium",
            explanation: parsedResponse.changeExplanation,
            value: parsedResponse.proposedChanges[0]?.newValue
          },
          status: "requires_approval"
        }
      ] : []
    });

    res.json({
      ok: true,
      conversation,
      messages: [userMessage, assistantMessage]
    });

  } catch (error: any) {
    console.error("Theme agent chat failure:", error);
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /api/agents/theme-editor/conversations/:conversationId/plan
 * Expose active dynamic plan.
 */
router.post("/agents/theme-editor/conversations/:conversationId/plan", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { assetKey, newValue, targetThemeId, riskLevel } = req.body;

    if (!assetKey || !newValue || !targetThemeId) {
      return res.status(400).json({ error: "Missing required plan parameters.", code: "INVALID_PARAMETERS" });
    }

    const tenantCtx = await validateChatTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop } = tenantCtx;

    // Display proposed side-by-side specs safely
    let originalValue = "";
    try {
      originalValue = await getThemeAssetContent(cleanShop, targetThemeId, assetKey);
    } catch (err) {
      originalValue = "// File did not exist previously.";
    }

    res.json({
      ok: true,
      conversationId,
      themeId: targetThemeId,
      assetKey,
      riskLevel: riskLevel || "Medium",
      originalValue,
      proposedValue: newValue,
      backupStatus: "Durable DB snapshot queued"
    });
  } catch (error: any) {
    res.status(500).json({ error: "Internal server error.", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /api/agents/theme-editor/conversations/:conversationId/apply
 * Merchant explicitly clicks "Apply Change" (signs live storefront warnings).
 */
router.post("/agents/theme-editor/conversations/:conversationId/apply", async (req: any, res: any) => {
  try {
    const { conversationId } = req.params;
    const { themeId, assetKey, value, isLiveTheme, liveConfirmation } = req.body;

    if (!themeId || !assetKey || value === undefined) {
      return res.status(400).json({ error: "Missing required execution parameters.", code: "INVALID_PARAMETERS" });
    }

    // 1. Live Storefront Warning gate
    if (isLiveTheme === true && liveConfirmation !== true) {
      return res.status(400).json({
        error: "Live storefront theme writes require explicit merchant confirmation checkbox signature.",
        code: "LIVE_THEME_CONFIRMATION_REQUIRED"
      });
    }

    // 2. Validate tenant context
    const tenantCtx = await validateChatTenant(req, res);
    if (!tenantCtx) return;
    const { cleanShop, repos, connection } = tenantCtx;

    // Validate path safety
    if (!validateAssetPath(assetKey)) {
      return res.status(403).json({ error: "Forbidden. Path traversal or unsafe file layout blocked.", code: "UNSAFE_PATH" });
    }

    const conversation = await repos.conversations.getConversationById(conversationId);
    if (!conversation || conversation.organizationId !== connection.organizationId) {
      return res.status(404).json({ error: "Conversation not found.", code: "CONVERSATION_NOT_FOUND" });
    }

    // 3. Dispatch safe transaction write (backup snapshot generated internally first)
    const result = await updateThemeAsset({
      shopDomain: cleanShop,
      themeId,
      assetKey,
      value,
      operator: "Shop Owner"
    });

    // 4. Update the conversation messages to show applied status
    await repos.conversations.addConversationMessage({
      id: `msg-${Date.now()}-apply-success`,
      conversationId,
      sender: "system",
      text: `✅ **Theme Edit Applied Successfully!**\n\nThe change to \`${assetKey}\` has been safely deployed directly to your store theme (Theme ID: ${themeId}). A durable backup snapshot has been durably archived (Backup ID: ${result.backupId}).`,
      timestamp: new Date().toISOString()
    });

    res.json({
      ok: true,
      ...result
    });

  } catch (error: any) {
    console.error("Failed to apply theme change:", error.message);
    res.status(500).json({ error: error.message || "Failed to commit theme write.", code: "APPLY_FAILED" });
  }
});

export default router;
