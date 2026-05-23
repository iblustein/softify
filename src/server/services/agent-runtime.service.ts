import { getRepositories } from "../repositories/repository-provider.js";
import { getAiProvider } from "../ai/ai-provider.factory.js";
import { executeTool, sanitizeResult } from "../tools/tool-gateway.js";
import { getDemoPlatformContext } from "./platform-context.service.js";
import { ToolExecutionContext } from "./tool-execution-context.service.js";
import { writeLog } from "./audit-log.service.js";

function normalizeShopDomain(shop: string): string {
  if (!shop) return "";
  let domain = shop.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  domain = domain.split("/")[0];
  if (!domain.endsWith(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

export const PRODUCT_INTELLIGENCE_AGENT = {
  id: "agent_product_intelligence",
  name: "Product Intelligence Agent",
  allowedTools: [
    "catalog.products.status",
    "catalog.products.summary",
    "catalog.products.list",
    "catalog.products.read"
  ],
  requiredScopes: ["read_products"],
  systemInstruction: "You are the Product Intelligence Agent. You analyze the store's product catalog snapshots and answer questions using only allowed tools."
};

export interface AgentChatResult {
  ok: boolean;
  agentId: string;
  provider: string;
  message: string;
  toolCalls: Array<{
    toolName: string;
    arguments: Record<string, unknown>;
  }>;
}

export async function runAgentChat(params: {
  shop: string;
  agentId: string;
  message: string;
}): Promise<AgentChatResult> {
  const { agentId, message } = params;

  // 1. Validate requested agent ID
  if (agentId !== PRODUCT_INTELLIGENCE_AGENT.id) {
    throw new Error(`Agent not found: '${agentId}'`);
  }

  // 2. Validate request-level shop domain & load store connection
  const cleanShop = normalizeShopDomain(params.shop);
  if (!cleanShop) {
    throw new Error("Shop domain parameter is required.");
  }

  const repos = getRepositories();
  const connection = await repos.stores.getStoreConnectionByUrl(cleanShop);
  if (!connection) {
    throw new Error(`Shopify store connection not found for shop domain '${cleanShop}'.`);
  }

  // 3. Load provider through AI factory
  const provider = getAiProvider();

  // Audit initial chat request
  writeLog(
    PRODUCT_INTELLIGENCE_AGENT.name,
    "AGENT_CHAT_REQUEST",
    `Received customer catalog query for store ${cleanShop}`,
    { agentId, message } // Safe logging: never includes secrets
  );

  // 4. Invoke the pluggable AI provider
  const response = await provider.generate({
    agentId,
    shop: cleanShop,
    message,
    allowedTools: PRODUCT_INTELLIGENCE_AGENT.allowedTools
  });

  const toolCalls: Array<{ toolName: string; arguments: Record<string, unknown> }> = [];

  // 5. Handle AI Response type
  if (response.type === "final") {
    // Audit trace logging
    writeLog(
      PRODUCT_INTELLIGENCE_AGENT.name,
      "AGENT_CHAT_RESPONSE",
      `Formulated final answer directly: "${response.message.slice(0, 60)}..."`,
      { ok: true }
    );

    return {
      ok: true,
      agentId,
      provider: provider.name,
      message: response.message,
      toolCalls
    };
  }

  // 6. Handle AI Tool Call request
  if (response.type === "tool_call") {
    const requestedTool = response.toolName;

    // Enforce Allowed Tools check at the runtime level
    if (!PRODUCT_INTELLIGENCE_AGENT.allowedTools.includes(requestedTool)) {
      const refusal = "I cannot perform this action because the requested capability is not available to this agent.";
      writeLog(
        PRODUCT_INTELLIGENCE_AGENT.name,
        "AGENT_CHAT_RESPONSE",
        `Refused tool call '${requestedTool}' as it is not in the allowed list.`,
        { toolName: requestedTool }
      );

      return {
        ok: true,
        agentId,
        provider: provider.name,
        message: refusal,
        toolCalls
      };
    }

    // Authoritative request-level shop check: Override AI provider shop argument entirely
    const toolArgs = {
      ...(response.arguments || {}),
      shop: cleanShop // Force authoritative shop from request
    };

    toolCalls.push({
      toolName: requestedTool,
      arguments: toolArgs
    });

    // Construct full ToolExecutionContext for Gateway security policies
    const platformCtx = getDemoPlatformContext();
    const context: ToolExecutionContext = {
      currentUser: platformCtx.currentUser,
      currentOrganization: platformCtx.currentOrganization,
      storeConnection: connection,
      agentDefinition: {
        id: PRODUCT_INTELLIGENCE_AGENT.id,
        name: PRODUCT_INTELLIGENCE_AGENT.name,
        description: "Analyzes Shopify product snapshots.",
        systemInstruction: PRODUCT_INTELLIGENCE_AGENT.systemInstruction,
        allowedTools: PRODUCT_INTELLIGENCE_AGENT.allowedTools,
        requiredScopes: PRODUCT_INTELLIGENCE_AGENT.requiredScopes,
        riskLevel: "Low",
        avatarColor: "bg-teal-600 text-white",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      agentInstallation: {
        id: `inst_${PRODUCT_INTELLIGENCE_AGENT.id}`,
        organizationId: connection.organizationId,
        storeConnectionId: connection.id,
        agentDefinitionId: PRODUCT_INTELLIGENCE_AGENT.id,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      enabledTools: platformCtx.enabledTools
    };

    // Execute tool ONLY via unified Tool Gateway execution gate
    const gatewayRes = await executeTool(requestedTool, toolArgs, context);

    if (gatewayRes.status === "failed") {
      const failMsg = "I cannot perform this action because the required tool or access is missing.";
      writeLog(
        PRODUCT_INTELLIGENCE_AGENT.name,
        "AGENT_CHAT_RESPONSE",
        `Tool call '${requestedTool}' execution failed inside the Gateway.`,
        { toolName: requestedTool }
      );

      return {
        ok: true,
        agentId,
        provider: provider.name,
        message: failMsg,
        toolCalls
      };
    }

    // Recursive sanitization of the tool result to prevent secrets leakage
    const sanitizedResult = sanitizeResult(gatewayRes.result);

    // Call AI provider again with the sanitized tool result for the final answer (bounded to exactly one round-trip)
    const secondResponse = await provider.generate({
      agentId,
      shop: cleanShop,
      message,
      allowedTools: PRODUCT_INTELLIGENCE_AGENT.allowedTools,
      toolResults: [
        {
          toolName: requestedTool,
          result: sanitizedResult
        }
      ]
    });

    let finalMessage = "";
    if (secondResponse.type === "final") {
      finalMessage = secondResponse.message;
    } else {
      // Bounded tool call: block subsequent or nested tool call requests
      finalMessage = "I cannot fulfill this request because subsequent nested tool calls are blocked.";
    }

    writeLog(
      PRODUCT_INTELLIGENCE_AGENT.name,
      "AGENT_CHAT_RESPONSE",
      `Formulated final answer after gateway call: "${finalMessage.slice(0, 60)}..."`,
      { ok: true }
    );

    return {
      ok: true,
      agentId,
      provider: provider.name,
      message: finalMessage,
      toolCalls
    };
  }

  // Default fallback
  return {
    ok: true,
    agentId,
    provider: provider.name,
    message: "I am a Product Intelligence Agent. You can ask me catalog questions, such as asking for a product summary.",
    toolCalls: []
  };
}
