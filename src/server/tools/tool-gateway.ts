import * as mockTools from "./mock-shopify-tools.js";
import { createApproval } from "../services/approval.service.js";
import { writeLog } from "../services/audit-log.service.js";
import { getMockProducts } from "../data/mock-products.js";
import { getDemoPlatformContext } from "../services/platform-context.service.js";
import { ToolExecutionContext } from "../services/tool-execution-context.service.js";

export interface ExecuteToolResult {
  toolName: string;
  args: any;
  status: 'success' | 'requires_approval' | 'failed';
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
export function executeToolWithContext(
  toolName: string,
  args: any,
  context: ToolExecutionContext,
  customApprovalDetails?: { title: string; summary: string; before?: string }
): ExecuteToolResult {
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

/**
 * Unified execution gate for all AI agent tool calls.
 * Kept fully backward compatible with the current legacy signature.
 */
export function executeTool(
  toolName: string,
  args: any,
  agentOrContext: { id: string; name: string; allowedTools: string[]; requiredScopes: string[] } | ToolExecutionContext,
  customApprovalDetails?: { title: string; summary: string; before?: string }
): ExecuteToolResult {
  if (isToolExecutionContext(agentOrContext)) {
    return executeToolWithContext(toolName, args, agentOrContext, customApprovalDetails);
  }

  const context = buildCompatibilityContext(agentOrContext);
  return executeToolWithContext(toolName, args, context, customApprovalDetails);
}
