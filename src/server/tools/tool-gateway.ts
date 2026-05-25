import * as mockTools from "./mock-shopify-tools.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { getDemoPlatformContext } from "../services/platform-context.service.js";
import { ToolExecutionContext } from "../services/tool-execution-context.service.js";
import { readShopInfo, readProducts, ShopifyAdminApiError } from "../services/shopify-admin-client.service.js";
import { getRepositories } from "../repositories/repository-provider.js";
import * as insightsService from "../services/catalog-insights.service.js";
import { AuditEventNames, AllowedProductProposalField } from "../domain/types.js";

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
  let effectiveToolName = toolName;
  if (toolName === "shopify.prepareProductUpdate") {
    effectiveToolName = "catalog.products.propose_update";
  }

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
  const isEnabled = context.enabledTools.some(t => t.name === effectiveToolName);
  if (!isEnabled) {
    return {
      isValid: false,
      error: `Tool ${effectiveToolName} is not enabled on this platform`,
      reason: "tool_not_enabled"
    };
  }

  // 4. Tool not allowed by agentDefinition.allowedTools check
  const isAllowedByAgent = (
    context.agentDefinition.allowedTools && (
      context.agentDefinition.allowedTools.includes(effectiveToolName) ||
      context.agentDefinition.allowedTools.includes(toolName)
    )
  );
  if (!isAllowedByAgent) {
    return {
      isValid: false,
      error: "Tool not allowed for this agent",
      reason: "tool_not_allowed"
    };
  }

  // 4.5. Tool not allowed by agentInstallation.allowedTools check
  const isAllowedByInstallation = (
    context.agentInstallation.allowedTools && (
      context.agentInstallation.allowedTools.includes(effectiveToolName) ||
      context.agentInstallation.allowedTools.includes(toolName)
    )
  );
  if (!isAllowedByInstallation) {
    return {
      isValid: false,
      error: `Tool ${effectiveToolName} is not allowed by agent installation`,
      reason: "tool_not_allowed_by_installation"
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
  let effectiveToolName = toolName;
  let effectiveArgs = args;

  if (toolName === "shopify.prepareProductUpdate") {
    effectiveToolName = "catalog.products.propose_update";
    const cleanArgs = args || {};
    effectiveArgs = {
      productId: String(cleanArgs.productId || ""),
      fields: cleanArgs.fields || {},
      summary: cleanArgs.summary || customApprovalDetails?.summary || "Legacy prepareProductUpdate proposal redirect."
    };
  }

  const result = await executeToolWithContextRaw(effectiveToolName, effectiveArgs, context, customApprovalDetails);
  
  const status = result.status === "failed" ? "failed" : "completed";
  const decision = result.status === "failed" ? "failed" : "completed";

  await writeAuditEvent({
    organizationId: context.currentOrganization.id,
    storeConnectionId: context.storeConnection.id,
    agentInstallationId: context.agentInstallation.id,
    agentId: context.agentDefinition.id,
    agentDefinitionId: context.agentDefinition.id,
    toolName: effectiveToolName,
    initiator: context.agentDefinition.name,
    event: AuditEventNames.GATEWAY_TOOL_EXECUTION,
    description: `Tool \`${effectiveToolName}\` execution status: ${status}`,
    decision,
    reason: result.status === "failed" ? "tool_execution_failed" : undefined,
    metadata: {
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallation.id,
      agentId: context.agentDefinition.id,
      toolName: effectiveToolName,
      decision,
      status,
      argsCount: Object.keys(effectiveArgs || {}).length
    }
  });

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
    await writeAuditEvent({
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallation.id,
      agentId: context.agentDefinition.id,
      agentDefinitionId: context.agentDefinition.id,
      toolName,
      initiator: context.agentDefinition.name,
      event: AuditEventNames.GATEWAY_VALIDATION_BLOCKED,
      description: `Tool \`${toolName}\` validation blocked: ${validation.error}`,
      decision: "blocked",
      reason: validation.reason,
      metadata: {
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallation.id,
        agentId: context.agentDefinition.id,
        toolName,
        decision: "blocked",
        reason: validation.reason,
        argsCount: Object.keys(cleanArgs).length
      }
    });

    return {
      toolName,
      args: cleanArgs,
      status: "failed",
      result: {
        error: validation.error || "Tool blocked by platform context safety policies"
      }
    };
  }

  // Intercept write/proposal tools and convert them into approvals!
  if (toolName === "catalog.products.propose_update") {
    const repos = getRepositories();
    const riskLevel = "Medium";
    const targetId = String(cleanArgs.productId || "");
    const summary = cleanArgs.summary || "AI-suggested catalog attributes/fields description optimization.";
    
    // Strict union types and allowedFields definition
    const allowedFieldsList: AllowedProductProposalField[] = ["title", "vendor", "productType", "status", "tags"];
    
    // Sanitize payload strictly: title, vendor, productType, status, tags
    const incomingFields = cleanArgs.fields || {};
    const sanitizedPayload: {
      title?: string;
      vendor?: string;
      productType?: string;
      status?: string;
      tags?: string[];
    } = {};

    if (typeof incomingFields.title === "string") sanitizedPayload.title = incomingFields.title;
    if (typeof incomingFields.vendor === "string") sanitizedPayload.vendor = incomingFields.vendor;
    if (typeof incomingFields.productType === "string") sanitizedPayload.productType = incomingFields.productType;
    if (typeof incomingFields.status === "string") sanitizedPayload.status = incomingFields.status;
    if (Array.isArray(incomingFields.tags)) {
      sanitizedPayload.tags = incomingFields.tags.map((t: any) => String(t));
    }

    const proposedChangesSummary = summary;
    
    // Diff summary
    const diffSummary = Object.keys(sanitizedPayload)
      .map(k => `${k}: proposed change`)
      .join(", ") || "No allowed changes proposed";

    const approvalId = `APV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    await repos.approvals.createApprovalRequest({
      id: approvalId,
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallation.id,
      agentId: context.agentDefinition.id,
      toolName,
      requestedBy: context.agentDefinition.name,
      status: "PENDING",
      riskLevel,
      targetType: "PRODUCT_PROPOSAL",
      targetId,
      proposedChangesSummary,
      diffSummary,
      sanitizedPayload,
      allowedFields: allowedFieldsList
    });

    // Audit approval creation using writeAuditEvent
    await writeAuditEvent({
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallation.id,
      agentId: context.agentDefinition.id,
      agentDefinitionId: context.agentDefinition.id,
      toolName,
      initiator: context.agentDefinition.name,
      event: AuditEventNames.APPROVAL_CREATED,
      description: `Created approval request '${approvalId}' for tool '${toolName}'`,
      decision: "blocked",
      reason: "requires_merchant_approval",
      metadata: {
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallation.id,
        agentId: context.agentDefinition.id,
        toolName,
        approvalId,
        decision: "blocked",
        reason: "requires_merchant_approval"
      }
    });

    // Return sanitized arguments summary only: argsCount, targetId, allowedFields
    const sanitizedArgsSummary = {
      argsCount: Object.keys(cleanArgs).length,
      targetId,
      allowedFields: allowedFieldsList
    };

    return {
      toolName,
      args: sanitizedArgsSummary,
      status: "failed", // Blocked waiting for approval
      result: {
        requires_approval: true,
        approvalId,
        message: `Action requires merchant approval. Created request: ${approvalId}`
      }
    };
  }

  // Record validation allowed decision securely via the async writeAuditEvent path
  await writeAuditEvent({
    organizationId: context.currentOrganization.id,
    storeConnectionId: context.storeConnection.id,
    agentInstallationId: context.agentInstallation.id,
    agentId: context.agentDefinition.id,
    agentDefinitionId: context.agentDefinition.id,
    toolName,
    initiator: context.agentDefinition.name,
    event: AuditEventNames.GATEWAY_VALIDATION_ALLOWED,
    description: `Tool \`${toolName}\` validation allowed for store ${context.storeConnection.storeUrl}`,
    decision: "allowed",
    metadata: {
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallation.id,
      agentId: context.agentDefinition.id,
      toolName,
      decision: "allowed",
      argsCount: Object.keys(cleanArgs).length
    }
  });

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

    case "catalog.insights.health": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getCatalogHealth(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
      }
    }

    case "catalog.insights.missing_images": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getProductsMissingImages(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
      }
    }

    case "catalog.insights.missing_vendor": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getProductsMissingVendor(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
      }
    }

    case "catalog.insights.missing_product_type": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getProductsMissingProductType(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
      }
    }

    case "catalog.insights.vendor_summary": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getVendorSummary(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
      }
    }

    case "catalog.insights.product_type_summary": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getProductTypeSummary(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
      }
    }

    case "catalog.insights.stale_snapshots": {
      try {
        const shopDomain = cleanArgs.shop || cleanArgs.shopDomain || context.storeConnection?.storeUrl;
        if (!shopDomain) {
          throw new Error("No active shop domain found in context or arguments.");
        }
        const result = await insightsService.getStaleSnapshots(shopDomain);
        return { toolName, args: cleanArgs, status: "completed", result };
      } catch (error: any) {
        return { toolName, args: cleanArgs, status: "failed", result: { error: error.message } };
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
