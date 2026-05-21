import {
  User,
  Organization,
  ShopifyStoreConnection,
  AgentDefinition,
  AgentInstallation,
  ToolDefinition
} from "../domain/types.js";
import { getDemoPlatformContext } from "./platform-context.service.js";

// TODO: In production, the tool execution context will be dynamically resolved based on:
// - Tenant-aware context resolution (matching the organization and store URLs from routing headers)
// - Authenticated user session (verifying JWT / cookie session context of the executing user)
// - Selected active organization / store context validation
// - Database-backed AgentInstallation loading (fetching store-specific configurations dynamically)
// - Shopify OAuth token loading (loading encrypted API credentials from secure storage)
// - Billing / plan enforcement (validating quotas and active tiers prior to tool deployment)

export interface ToolExecutionContext {
  currentUser: User;
  currentOrganization: Organization;
  storeConnection: ShopifyStoreConnection;
  agentDefinition: AgentDefinition;
  agentInstallation: AgentInstallation;
  enabledTools: ToolDefinition[];
}

/**
 * Retrieve the active tool execution context for a given agentId.
 * For this prototype sandbox, it fetches state via the demo platform context and validates
 * template definition and store installation existence.
 */
export function getDemoToolExecutionContext(agentId: string): ToolExecutionContext {
  const platformContext = getDemoPlatformContext();

  // Find requested AgentDefinition by agentId
  const agentDefinition = platformContext.agentDefinitions.find(def => def.id === agentId);
  if (!agentDefinition) {
    throw new Error(`Agent definition not found for agentId: ${agentId}`);
  }

  // Find the matching AgentInstallation by agentDefinitionId
  const agentInstallation = platformContext.agentInstallations.find(inst => inst.agentDefinitionId === agentId);
  if (!agentInstallation) {
    throw new Error(`Agent installation not found for agentId: ${agentId}`);
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
