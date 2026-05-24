import { normalizeShopDomain } from "./shopify-oauth.service.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { getAgentDefinition } from "../agents/agent-definitions.js";
import { ENABLED_TOOLS } from "../tools/tool-definitions.js";
import { PlatformContextError } from "./platform-context-error.js";
import { PlatformContext } from "./platform-context.service.js";
import { User, Organization, AgentInstallation } from "../domain/types.js";

/**
 * Resolves the authenticated, tenant-safe platform context for the active agent runtime.
 * Guarantees strict isolation, connection checks, scope validations, and dev bypass enforcement.
 */
export async function resolvePlatformContext(params: {
  shop: any;
  agentId: any;
  request: any;
}): Promise<PlatformContext> {
  const { shop, agentId, request } = params;

  // 1. Validate shop parameter
  if (!shop || typeof shop !== "string") {
    throw new PlatformContextError(
      "UNKNOWN_SHOP",
      "Missing or invalid shop domain.",
      404
    );
  }

  const cleanShop = normalizeShopDomain(shop);

  // 2. Load active store connection
  const repos = getRepositories();
  const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);

  if (!storeConnection) {
    throw new PlatformContextError(
      "UNKNOWN_SHOP",
      `Shop connection not found for domain: ${cleanShop}`,
      404
    );
  }

  // 3. Reject disconnected store connection status
  if (storeConnection.status !== "CONNECTED") {
    throw new PlatformContextError(
      "DISCONNECTED_SHOP",
      `Shop connection is not connected. Status: ${storeConnection.status}`,
      409
    );
  }

  // 4. Resolve static agent definition from registry
  if (!agentId || typeof agentId !== "string") {
    throw new PlatformContextError(
      "UNKNOWN_AGENT",
      "Missing or invalid agent ID.",
      404
    );
  }

  const agentDefinition = getAgentDefinition(agentId);
  if (!agentDefinition) {
    throw new PlatformContextError(
      "UNKNOWN_AGENT",
      `Unknown agent ID: ${agentId}`,
      404
    );
  }

  // 5. Scope Check: Check that storeConnection.scopes includes every agentDefinition.requiredScopes entry
  const missingScopes = agentDefinition.requiredScopes.filter(
    scope => !storeConnection.scopes.includes(scope)
  );
  if (missingScopes.length > 0) {
    throw new PlatformContextError(
      "MISSING_REQUIRED_SCOPES",
      `Store connection is missing required agent scopes: ${missingScopes.join(", ")}`,
      403
    );
  }

  // 6. Dev Bypass validation: Require BOTH process.env.SOFTIFY_ALLOW_AGENT_DEV_BYPASS === "true" AND
  // request header X-Softify-Dev-Bypass matching process.env.SOFTIFY_AGENT_DEV_BYPASS_SECRET
  const bypassAllowed = process.env.SOFTIFY_ALLOW_AGENT_DEV_BYPASS === "true";
  const bypassSecret = process.env.SOFTIFY_AGENT_DEV_BYPASS_SECRET;
  const bypassHeader =
    request.headers["x-softify-dev-bypass"] ||
    request.headers["X-Softify-Dev-Bypass"];

  if (!bypassAllowed || !bypassSecret || bypassHeader !== bypassSecret) {
    throw new PlatformContextError(
      "UNAUTHORIZED",
      "Missing or invalid development bypass authorization.",
      401
    );
  }

  // 7. Derive currentOrganization.id directly from storeConnection.organizationId when dev bypass is used
  const currentOrganization: Organization = {
    id: storeConnection.organizationId || "org_demo",
    name: "Enterprise Organization",
    createdAt: storeConnection.createdAt || new Date().toISOString(),
    updatedAt: storeConnection.updatedAt || new Date().toISOString()
  };

  const currentUser: User = {
    id: "usr_demo",
    email: "demo@softify.ai",
    name: "Demo Store Owner",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 8. Resolve agent installation by shop/store + agentId
  const installation = await repos.agentInstallations.getByShopAndAgent(cleanShop, agentDefinition.id);
  if (!installation) {
    throw new PlatformContextError(
      "AGENT_NOT_INSTALLED",
      `Agent ${agentDefinition.name} is not installed for this shop.`,
      403
    );
  }

  if (installation.enabled !== true) {
    throw new PlatformContextError(
      "AGENT_DISABLED",
      `Agent ${agentDefinition.name} is disabled for this shop.`,
      403
    );
  }

  // Validate allowedTools subset constraint
  const allowedToolsSet = new Set(agentDefinition.allowedTools);
  const instAllowedTools = installation.allowedTools || [];
  const invalidTools = instAllowedTools.filter(t => !allowedToolsSet.has(t));
  if (invalidTools.length > 0) {
    throw new PlatformContextError(
      "AGENT_INSTALLATION_INVALID",
      `Agent installation allowedTools contains tools not supported by the static definition: ${invalidTools.join(", ")}`,
      409
    );
  }

  // Intersect runtime allowed tools
  const runtimeAllowedTools = agentDefinition.allowedTools.filter(t => instAllowedTools.includes(t));

  const resolvedAgentDefinition = {
    ...agentDefinition,
    allowedTools: runtimeAllowedTools
  };

  const agentInstallations: AgentInstallation[] = [installation];

  return {
    currentUser,
    currentOrganization,
    storeConnection,
    agentDefinitions: [resolvedAgentDefinition],
    agentInstallations,
    enabledTools: ENABLED_TOOLS
  };
}
