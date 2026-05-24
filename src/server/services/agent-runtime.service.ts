import { getAiProvider } from "../ai/ai-provider.factory.js";
import { executeTool, sanitizeResult } from "../tools/tool-gateway.js";
import { writeLog } from "./audit-log.service.js";
import { PlatformContext } from "./platform-context.service.js";
import { ToolExecutionContext } from "./tool-execution-context.service.js";

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

/**
 * Handles read-only chat turn with a pre-validated platform context.
 * Performs request validation, authoritative shop override, allowed tools enforcement,
 * and secure logging to guarantee zero token or PII leakage.
 */
export async function runAgentChat(params: {
  shop: string;
  agentId: string;
  message: string;
  context: PlatformContext;
}): Promise<AgentChatResult> {
  const { agentId, message, context } = params;

  // 1. Resolve agent from pre-validated context
  const agentDefinition = context.agentDefinitions.find(a => a.id === agentId);
  if (!agentDefinition) {
    throw new Error(`Agent not found in context: '${agentId}'`);
  }

  // Ensure real installation exists
  if (!context.agentInstallations || context.agentInstallations.length === 0 || !context.agentInstallations[0]) {
    throw new Error(`Agent installation is missing for agentId: '${agentId}'`);
  }

  // 2. Validate request-level shop domain against context store connection
  const cleanShop = normalizeShopDomain(params.shop);
  if (!cleanShop) {
    throw new Error("Shop domain parameter is required.");
  }

  const contextShop = normalizeShopDomain(context.storeConnection.storeUrl);
  if (cleanShop !== contextShop) {
    throw new Error(`Tenant isolation violation: Request shop '${cleanShop}' does not match context shop '${contextShop}'.`);
  }

  // 3. Load provider through AI factory
  const provider = getAiProvider();

  // Audit initial chat request - MASKED telemetry only
  writeLog(
    agentDefinition.name,
    "AGENT_CHAT_REQUEST",
    `Received customer catalog query for store ${cleanShop}`,
    { 
      agentId, 
      messageLength: message.length
    }
  );

  // 4. Invoke the pluggable AI provider
  const response = await provider.generate({
    agentId,
    shop: cleanShop,
    message,
    allowedTools: agentDefinition.allowedTools
  });

  const toolCalls: Array<{ toolName: string; arguments: Record<string, unknown> }> = [];

  // 5. Handle AI Response type
  if (response.type === "final") {
    // Audit trace logging - MASKED telemetry only
    writeLog(
      agentDefinition.name,
      "AGENT_CHAT_RESPONSE",
      `Formulated final answer directly`,
      { 
        agentId,
        messageLength: message.length,
        provider: provider.name,
        toolCallCount: 0
      }
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
    if (!agentDefinition.allowedTools.includes(requestedTool)) {
      const refusal = "I cannot perform this action because the requested capability is not available to this agent.";
      writeLog(
        agentDefinition.name,
        "AGENT_CHAT_RESPONSE",
        `Refused tool call '${requestedTool}' as it is not in the allowed list`,
        { 
          agentId,
          toolName: requestedTool
        }
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

    // Map active platform context back to singular ToolExecutionContext for unified Tool Gateway execution gate
    const toolExecContext: ToolExecutionContext = {
      currentUser: context.currentUser,
      currentOrganization: context.currentOrganization,
      storeConnection: context.storeConnection,
      agentDefinition: agentDefinition,
      agentInstallation: context.agentInstallations[0],
      enabledTools: context.enabledTools
    };

    // Execute tool ONLY via unified Tool Gateway execution gate using the resolved platform context
    const gatewayRes = await executeTool(requestedTool, toolArgs, toolExecContext);

    if (gatewayRes.status === "failed") {
      const failMsg = "I cannot perform this action because the required tool or access is missing.";
      writeLog(
        agentDefinition.name,
        "AGENT_CHAT_RESPONSE",
        `Tool call execution failed inside the Gateway`,
        { 
          agentId,
          toolName: requestedTool
        }
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
      allowedTools: agentDefinition.allowedTools,
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
      agentDefinition.name,
      "AGENT_CHAT_RESPONSE",
      `Formulated final answer after gateway call`,
      { 
        agentId,
        messageLength: message.length,
        provider: provider.name,
        toolCallCount: toolCalls.length
      }
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
