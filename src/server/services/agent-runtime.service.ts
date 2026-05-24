import { getAiProvider } from "../ai/ai-provider.factory.js";
import { executeTool, sanitizeResult } from "../tools/tool-gateway.js";
import { writeLog, writeAuditEvent } from "./audit-log.service.js";
import { PlatformContext } from "./platform-context.service.js";
import { ToolExecutionContext } from "./tool-execution-context.service.js";
import { AuditEventNames } from "../domain/types.js";

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
    await writeAuditEvent({
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallations[0]?.id,
      agentId,
      agentDefinitionId: agentDefinition.id,
      initiator: "system",
      event: AuditEventNames.GATEWAY_VALIDATION_BLOCKED,
      description: `Tenant isolation violation: Request shop '${cleanShop}' does not match context shop '${contextShop}'.`,
      decision: "blocked",
      reason: "tenant_isolation_violation",
      metadata: {
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        decision: "blocked",
        reason: "tenant_isolation_violation",
        requestShop: cleanShop,
        contextShop: contextShop
      }
    });
    throw new Error(`Tenant isolation violation: Request shop '${cleanShop}' does not match context shop '${contextShop}'.`);
  }

  // 3. Load provider through AI factory
  const provider = getAiProvider();

  // Audit initial chat request - MASKED telemetry only
  await writeAuditEvent({
    organizationId: context.currentOrganization.id,
    storeConnectionId: context.storeConnection.id,
    agentInstallationId: context.agentInstallations[0]?.id,
    agentId,
    agentDefinitionId: agentDefinition.id,
    initiator: "user",
    event: AuditEventNames.AGENT_CHAT_REQUEST,
    description: `Received customer catalog query for store ${cleanShop}`,
    metadata: {
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallations[0]?.id,
      agentId,
      messageLength: message.length
    }
  });

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
    await writeAuditEvent({
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallations[0]?.id,
      agentId,
      agentDefinitionId: agentDefinition.id,
      initiator: agentDefinition.name,
      event: AuditEventNames.PROVIDER_FINAL_RESPONSE,
      description: `Formulated final answer directly`,
      decision: "completed",
      provider: provider.name,
      metadata: {
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        messageLength: message.length,
        provider: provider.name,
        toolCallCount: 0,
        decision: "completed"
      }
    });

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
      await writeAuditEvent({
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        agentDefinitionId: agentDefinition.id,
        toolName: requestedTool,
        initiator: agentDefinition.name,
        event: AuditEventNames.RUNTIME_ALLOWED_TOOLS_BLOCK,
        description: `Refused tool call '${requestedTool}' as it is not in the allowed list`,
        decision: "blocked",
        reason: "tool_not_allowed_by_agent_definition",
        metadata: {
          organizationId: context.currentOrganization.id,
          storeConnectionId: context.storeConnection.id,
          agentInstallationId: context.agentInstallations[0]?.id,
          agentId,
          toolName: requestedTool,
          decision: "blocked",
          reason: "tool_not_allowed_by_agent_definition"
        }
      });

      return {
        ok: true,
        agentId,
        provider: provider.name,
        message: refusal,
        toolCalls
      };
    }

    // Log the AI Provider's tool call request
    await writeAuditEvent({
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallations[0]?.id,
      agentId,
      agentDefinitionId: agentDefinition.id,
      toolName: requestedTool,
      initiator: agentDefinition.name,
      event: AuditEventNames.PROVIDER_TOOL_CALL,
      description: `AI Provider requested tool call: ${requestedTool}`,
      decision: "allowed",
      provider: provider.name,
      metadata: {
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        toolName: requestedTool,
        provider: provider.name,
        decision: "allowed"
      }
    });

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
      await writeAuditEvent({
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        agentDefinitionId: agentDefinition.id,
        toolName: requestedTool,
        initiator: agentDefinition.name,
        event: AuditEventNames.GATEWAY_TOOL_EXECUTION,
        description: `Tool call execution failed inside the Gateway`,
        decision: "failed",
        reason: "gateway_execution_failed",
        metadata: {
          organizationId: context.currentOrganization.id,
          storeConnectionId: context.storeConnection.id,
          agentInstallationId: context.agentInstallations[0]?.id,
          agentId,
          toolName: requestedTool,
          decision: "failed",
          reason: "gateway_execution_failed"
        }
      });

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
      await writeAuditEvent({
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        agentDefinitionId: agentDefinition.id,
        initiator: agentDefinition.name,
        event: AuditEventNames.NESTED_TOOL_CALL_BLOCKED,
        description: "Subsequent nested tool call request was blocked by runtime boundary policies",
        decision: "blocked",
        reason: "subsequent_tool_calls_blocked",
        metadata: {
          organizationId: context.currentOrganization.id,
          storeConnectionId: context.storeConnection.id,
          agentInstallationId: context.agentInstallations[0]?.id,
          agentId,
          decision: "blocked",
          reason: "subsequent_tool_calls_blocked"
        }
      });
    }

    await writeAuditEvent({
      organizationId: context.currentOrganization.id,
      storeConnectionId: context.storeConnection.id,
      agentInstallationId: context.agentInstallations[0]?.id,
      agentId,
      agentDefinitionId: agentDefinition.id,
      initiator: agentDefinition.name,
      event: AuditEventNames.PROVIDER_FINAL_RESPONSE,
      description: `Formulated final answer after gateway call`,
      decision: "completed",
      provider: provider.name,
      metadata: {
        organizationId: context.currentOrganization.id,
        storeConnectionId: context.storeConnection.id,
        agentInstallationId: context.agentInstallations[0]?.id,
        agentId,
        messageLength: message.length,
        provider: provider.name,
        toolCallCount: toolCalls.length,
        decision: "completed"
      }
    });

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
