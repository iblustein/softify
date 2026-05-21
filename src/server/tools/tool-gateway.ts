import * as mockTools from "./mock-shopify-tools.js";
import { createApproval } from "../services/approval.service.js";
import { writeLog } from "../services/audit-log.service.js";
import { getMockProducts } from "../data/mock-products.js";
import { getShopifyStore } from "../data/mock-store.js";
import { ApprovalItem } from "../../types.js";

export interface ExecuteToolResult {
  toolName: string;
  args: any;
  status: 'success' | 'requires_approval' | 'failed';
  result: any;
  approvalId?: string;
}

/**
 * Tool Gateway: Unified execution gate for all AI agent tool calls.
 * 
 * TODO: Future enforcement point for:
 *  - Scope and permissions check (e.g., verifying if the agent possesses the required Shopify scope)
 *  - Risk policy checks (e.g., restricting High risk agents from making unauthorized write commands)
 *  - Centralized approval policy enforcement
 *  - Encrypted token verification
 *  - Direct routing to the real Shopify GraphQL Admin API / REST Admin API
 */
export function executeTool(
  toolName: string,
  args: any,
  agent: { id: string; name: string; allowedTools: string[]; requiredScopes: string[] },
  customApprovalDetails?: { title: string; summary: string; before?: string }
): ExecuteToolResult {
  const cleanArgs = args || {};

  // Verify toolName exists in agent.allowedTools
  if (!agent.allowedTools || !agent.allowedTools.includes(toolName)) {
    writeLog(
      agent.name,
      "TOOL_BLOCKED",
      `Tool \`${toolName}\` blocked: Not allowed for agent \`${agent.name}\``,
      { toolName, args: cleanArgs }
    );
    return {
      toolName,
      args: cleanArgs,
      status: "failed",
      result: {
        error: "Tool not allowed for this agent"
      }
    };
  }

  // TODO: Scope validation. Verify if the agent possesses the required Shopify scope in agent.requiredScopes.

  // Standard logging for tool execution
  writeLog(agent.name, "TOOL_CALL", `Executed SDK Gateway task: \`${toolName}\``, { args: cleanArgs });

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
        agentId: agent.id,
        agentName: agent.name,
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
      writeLog(agent.name, "APPROVAL_CREATED", `Added manual audit item ${approval.id} for product ${productId}`, { approvalId: approval.id });

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
        agentId: agent.id,
        agentName: agent.name,
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
      writeLog(agent.name, "APPROVAL_CREATED", `Added manual CSS overhaul task ${approval.id}`, { approvalId: approval.id });

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
