import * as mockTools from "./mock-shopify-tools.js";
import { createApproval } from "../services/approval.service.js";
import { writeLog } from "../services/audit-log.service.js";
import { getMockProducts } from "../data/mock-products.js";
import { getDemoPlatformContext } from "../services/platform-context.service.js";
import { ToolExecutionContext } from "../services/tool-execution-context.service.js";
import { readShopInfo, readProducts, ShopifyAdminApiError } from "../services/shopify-admin-client.service.js";
import { getRepositories } from "../repositories/repository-provider.js";

export interface ExecuteToolResult {
  toolName: string;
  args: any;
  status: 'success' | 'requires_approval' | 'failed' | 'completed';
  result: any;
  approvalId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  reason?: string;
}

/**
 * Type guard to check if an object is a ToolExecutionContext.
 */
export function isToolExecutionContext(obj: any): obj is ToolExecutionContext {
  return obj && typeof obj === "object" && "agentDefinition" in obj && "agentInstallation" in obj;
}

/**
 * Separate context validation into a helper function.
 * Validates in the exact requested order:
 *  1. agent installation disabled
 *  2. store disconnected
 *  3. tool not registered in enabledTools
 *  4. tool not allowed by agentDefinition.allowedTools
 *  5. TODO: Shopify scope validation
 *  6. TODO: billing / plan enforcement
 */
export function validateToolExecutionContext(toolName: string, context: ToolExecutionContext): ValidationResult {
  // 1. Agent installation disabled check
  if (!context.agentInstallation.enabled) {
    return {
      isValid: false,
      error: `Agent installation is disabled for agent ${context.agentDefinition.name}`,
      reason: "agent_installation_disabled"
    };
  }

  // 2. Store disconnected check
  if (context.storeConnection.status !== "CONNECTED") {
    return {
      isValid: false,
      error: `Shopify store ${context.storeConnection.storeUrl} is disconnected`,
      reason: "store_disconnected"
    };
  }

  // 3. Tool not registered in enabledTools check
  const isEnabled = context.enabledTools.some(t => t.name === toolName);
  if (!isEnabled) {
    return {
      isValid: false,
      error: `Tool ${toolName} is not enabled on this platform`,
      reason: "tool_not_enabled"
    };
  }

  // 4. Tool not allowed by agentDefinition.allowedTools check
  if (!context.agentDefinition.allowedTools || !context.agentDefinition.allowedTools.includes(toolName)) {
    return {
      isValid: false,
      error: "Tool not allowed for this agent",
      reason: "tool_not_allowed"
    };
  }

  // TODO: Shopify scope validation (verify agent required scopes map onto store connection scopes)
  // TODO: billing / plan enforcement (verify monthly quotas or tier limits)

  return { isValid: true };
}

/**
 * Build a compatibility context around legacy agent objects.
 */
function buildCompatibilityContext(
  agent: { id: string; name: string; allowedTools: string[]; requiredScopes: string[] }
): ToolExecutionContext {
  const platformContext = getDemoPlatformContext();

  let agentDefinition = platformContext.agentDefinitions.find(d => d.id === agent.id);
  if (!agentDefinition) {
    agentDefinition = {
      id: agent.id,
      name: agent.name,
      description: "",
      systemInstruction: "",
      allowedTools: agent.allowedTools,
      requiredScopes: agent.requiredScopes,
      riskLevel: "Medium",
      avatarColor: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } else {
    // Override allowedTools and requiredScopes to align with any in-memory session changes made by callers
    agentDefinition = {
      ...agentDefinition,
      allowedTools: agent.allowedTools,
      requiredScopes: agent.requiredScopes
    };
  }

  let agentInstallation = platformContext.agentInstallations.find(i => i.agentDefinitionId === agent.id);
  if (!agentInstallation) {
    agentInstallation = {
      id: `inst_${agent.id}`,
      organizationId: platformContext.currentOrganization.id,
      storeConnectionId: platformContext.storeConnection.id,
      agentDefinitionId: agent.id,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  return {
    currentUser: platformContext.currentUser,
    currentOrganization: platformContext.currentOrganization,
    storeConnection: platformContext.storeConnection,
    agentDefinition,
    agentInstallation,
    enabledTools: platformContext.enabledTools
  };
}

/**
 * Preferred new tool execution path that validates against a full ToolExecutionContext.
 */
export async function executeToolWithContext(
  toolName: string,
  args: any,
  context: ToolExecutionContext,
  customApprovalDetails?: { title: string; summary: string; before?: string }
): Promise<ExecuteToolResult> {
  const result = await executeToolWithContextRaw(toolName, args, context, customApprovalDetails);
  if (result && result.result) {
    result.result = sanitizeResult(result.result);
  }
  return result;
}

async function executeToolWithContextRaw(
  toolName: string,
  args: any,
  context: ToolExecutionContext,
  customApprovalDetails?: { title: string; summary: string; before?: string }
): Promise<ExecuteToolResult> {
  const cleanArgs = args || {};

  // Run validation
  const validation = validateToolExecutionContext(toolName, context);
  if (!validation.isValid) {
    writeLog(
      context.agentDefinition.name,
      "TOOL_BLOCKED",
      `Tool \`${toolName}\` blocked: ${validation.error}`,
      {
        toolName,
        reason: validation.reason,
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentDefinitionId: context.agentDefinition.id,
        agentInstallationId: context.agentInstallation.id,
        args: cleanArgs
      }
    );

    return {
      toolName,
      args: cleanArgs,
      status: "failed",
      result: {
        error: validation.error || "Tool blocked by platform context safety policies"
      }
    };
  }

  // Standard logging for tool execution
  writeLog(
    context.agentDefinition.name,
    "TOOL_CALL",
    `Executed SDK Gateway task: \`${toolName}\` for store ${context.storeConnection.storeUrl}`,
    { args: cleanArgs }
  );

  switch (toolName) {
    case "shopify.getShopInfo": {
      const result = mockTools.getShopInfo();
      return { toolName, args: cleanArgs, status: "success", result };
    }

    case "shopify.getProducts": {
      const result = mockTools.getProducts();
      return { toolName, args: cleanArgs, status: "success", result };
    }

    case "shopify.getOrders": {
      const result = mockTools.getOrders();
      return { toolName, args: cleanArgs, status: "success", result };
    }

    case "shopify.getSalesSummary": {
      const result = mockTools.getSalesSummary();
      return { toolName, args: cleanArgs, status: "success", result };
    }

    case "shopify.prepareProductUpdate": {
      const productId = Number(cleanArgs.productId || 101);
      const localProducts = getMockProducts();
      const localProd = localProducts.find(p => p.id === productId) || localProducts[0];
      const newFields = cleanArgs.fields || {};

      // Determine before and after description copy
      const beforeDesc = customApprovalDetails?.before || localProd.description;
      const afterDesc = newFields.description || "Updated copy content draft.";

      const title = customApprovalDetails?.title || `Optimized content draft for ${localProd.title}`;
      const summary = customApprovalDetails?.summary || "Gemini-generated high-converting sales copywriting overhaul.";

      // Register approval
      const approval = createApproval({
        agentId: context.agentDefinition.id,
        agentName: context.agentDefinition.name,
        actionType: "PRODUCT_UPDATE",
        targetId: String(productId),
        details: {
          title,
          before: beforeDesc,
          after: afterDesc,
          summary,
          productId,
          fields: newFields
        }
      });

      // Standard logging for approval creation
      writeLog(
        context.agentDefinition.name,
        "APPROVAL_CREATED",
        `Added manual audit item ${approval.id} for product ${productId}`,
        { approvalId: approval.id }
      );

      return {
        toolName,
        args: cleanArgs,
        status: "requires_approval",
        approvalId: approval.id,
        result: {
          status: customApprovalDetails ? "Awaiting owner authentication" : "Awaiting shop owner sign-off",
          approvalId: approval.id
        }
      };
    }

    case "shopify.prepareThemePatch": {
      const themeId = cleanArgs.themeId || "main_theme";
      const patch = cleanArgs.patch || "/* Polished rules */";

      const title = customApprovalDetails?.title || "Shopify core theme UI/CSS layout adjustment";
      const summary = customApprovalDetails?.summary || "Visual refinement compiled by theme agent.";
      const beforeCode = customApprovalDetails?.before || "/* Former theme layout hooks */";

      // Register approval
      const approval = createApproval({
        agentId: context.agentDefinition.id,
        agentName: context.agentDefinition.name,
        actionType: "THEME_PATCH",
        targetId: themeId,
        details: {
          title,
          before: beforeCode,
          after: patch,
          summary,
          themeId,
          patch
        }
      });

      // Standard logging for approval creation
      writeLog(
        context.agentDefinition.name,
        "APPROVAL_CREATED",
        `Added manual CSS overhaul task ${approval.id}`,
        { approvalId: approval.id }
      );

      return {
        toolName,
        args: cleanArgs,
        status: "requires_approval",
        approvalId: approval.id,
        result: {
          status: customApprovalDetails ? "Awaiting approval action" : "Awaiting theme verification",
          approvalId: approval.id
        }
      };
    }

    case "shopify.shop.read": {
      try {
        let shopDomain = cleanArgs.shopDomain;
        if (!shopDomain) {
          // If shopDomain is missing, use the currently connected store from context where available.
          shopDomain = context.storeConnection?.storeUrl;
        }
        if (!shopDomain) {
          throw new ShopifyAdminApiError("SHOPIFY_STORE_NOT_CONNECTED", "No active shop domain found in context or arguments.");
        }
        const result = await readShopInfo(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        const code = error instanceof ShopifyAdminApiError ? error.code : "SHOPIFY_ADMIN_API_REQUEST_FAILED";
        return {
          toolName,
          args: cleanArgs,
          status: "failed",
          result: {
            error: {
              code,
              message: error.message
            }
          }
        };
      }
    }

    case "shopify.products.read": {
      try {
        let shopDomain = cleanArgs.shopDomain;
        if (!shopDomain) {
          // If shopDomain is missing, use the currently connected store from context where available.
          shopDomain = context.storeConnection?.storeUrl;
        }
        if (!shopDomain) {
          throw new ShopifyAdminApiError("SHOPIFY_STORE_NOT_CONNECTED", "No active shop domain found in context or arguments.");
        }
        const limit = cleanArgs.limit !== undefined ? Number(cleanArgs.limit) : undefined;
        const query = typeof cleanArgs.query === "string" ? cleanArgs.query : undefined;
        const after = typeof cleanArgs.after === "string" ? cleanArgs.after : undefined;

        const result = await readProducts(shopDomain, { limit, query, after });
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        const code = error instanceof ShopifyAdminApiError ? error.code : "SHOPIFY_ADMIN_API_REQUEST_FAILED";
        return {
          toolName,
          args: cleanArgs,
          status: "failed",
          result: {
            error: {
              code,
              message: error.message
            }
          }
        };
      }
    }
    case "catalog.products.status": {
      try {
        let shopDomain = cleanArgs.shop;
        if (!shopDomain) {
          shopDomain = cleanArgs.shopDomain;
        }
        if (!shopDomain) {
          shopDomain = context.storeConnection?.storeUrl;
        }
        if (!shopDomain) {
          return {
            toolName,
            args: cleanArgs,
            status: "failed",
            result: { error: "No active shop domain found in context or arguments." }
          };
        }
        const repos = getRepositories();
        const count = await repos.products.countProductSnapshotsByShop(shopDomain);
        const latestSyncAt = await repos.products.getLatestProductSyncAt(shopDomain);
        return {
          toolName,
          args: cleanArgs,
          status: "completed",
          result: {
            shop: shopDomain,
            count,
            latestSyncAt
          }
        };
      } catch (error: any) {
        return {
          toolName,
          args: cleanArgs,
          status: "failed",
          result: { error: error.message }
        };
      }
    }

    case "catalog.products.summary": {
      try {
        let shopDomain = cleanArgs.shop;
        if (!shopDomain) {
          shopDomain = cleanArgs.shopDomain;
        }
        if (!shopDomain) {
          shopDomain = context.storeConnection?.storeUrl;
        }
        if (!shopDomain) {
          return {
            toolName,
            args: cleanArgs,
            status: "failed",
            result: { error: "No active shop domain found in context or arguments." }
          };
        }
        const repos = getRepositories();
        const count = await repos.products.countProductSnapshotsByShop(shopDomain);
        const latestSyncAt = await repos.products.getLatestProductSyncAt(shopDomain);
        return {
          toolName,
          args: cleanArgs,
          status: "completed",
          result: {
            shop: shopDomain,
            syncedProductCount: count,
            lastSyncedAt: latestSyncAt,
            source: "product_snapshots"
          }
        };
      } catch (error: any) {
        return {
          toolName,
          args: cleanArgs,
          status: "failed",
          result: { error: error.message }
        };
      }
    }

    case "catalog.products.read":
    case "catalog.products.list": {
      try {
        let shopDomain = cleanArgs.shop;
        if (!shopDomain) {
          shopDomain = cleanArgs.shopDomain;
        }
        if (!shopDomain) {
          shopDomain = context.storeConnection?.storeUrl;
        }
        if (!shopDomain) {
          return {
            toolName,
            args: cleanArgs,
            status: "failed",
            result: { error: "No active shop domain found in context or arguments." }
          };
        }
        const limit = cleanArgs.limit !== undefined ? Number(cleanArgs.limit) : undefined;
        const repos = getRepositories();
        const results = await repos.products.listProductSnapshotsByShop(shopDomain, limit);
        return {
          toolName,
          args: cleanArgs,
          status: "completed",
          result: results
        };
      } catch (error: any) {
        return {
          toolName,
          args: cleanArgs,
          status: "failed",
          result: { error: error.message }
        };
      }
    }

    default:
      return {
        toolName,
        args: cleanArgs,
        status: "failed",
        result: {
          error: `Tool ${toolName} not supported in gateway`
        }
      };
  }
}

export function sanitizeResult(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeResult);
  }
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (typeof obj === "object") {
    const sanitized: any = {};
    const forbiddenPatterns = [
      /token/i,
      /access_?token/i,
      /refresh_?token/i,
      /api_?key/i,
      /secret/i,
      /password/i,
      /credential/i,
      /private_?key/i,
      /authorization/i,
      /bearer/i
    ];
    for (const [key, val] of Object.entries(obj)) {
      const isForbidden = forbiddenPatterns.some(p => p.test(key));
      if (!isForbidden) {
        sanitized[key] = sanitizeResult(val);
      }
    }
    return sanitized;
  }
  return obj;
}

/**
 * Unified execution gate for all AI agent tool calls.
 * Kept fully backward compatible with the current legacy signature.
 */
export async function executeTool(
  toolName: string,
  args: any,
  agentOrContext: { id: string; name: string; allowedTools: string[]; requiredScopes: string[] } | ToolExecutionContext,
  customApprovalDetails?: { title: string; summary: string; before?: string }
): Promise<ExecuteToolResult> {
  let result: ExecuteToolResult;
  if (isToolExecutionContext(agentOrContext)) {
    result = await executeToolWithContext(toolName, args, agentOrContext, customApprovalDetails);
  } else {
    const context = buildCompatibilityContext(agentOrContext);
    result = await executeToolWithContext(toolName, args, context, customApprovalDetails);
  }

  if (result && result.result) {
    result.result = sanitizeResult(result.result);
  }
  return result;
}
