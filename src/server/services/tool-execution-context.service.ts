import {
  User,
  Organization,
  ShopifyStoreConnection,
  AgentDefinition,
  AgentInstallation,
  ToolDefinition
} from "../domain/types.js";
import { getDemoPlatformContext } from "./platform-context.service.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { getShopifyStore } from "../data/mock-store.js";

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

/**
 * Normalizes the shop domain to a lowercase, protocol-free, path-free identifier ending in .myshopify.com.
 */
function cleanDomain(shop: string): string {
  if (!shop) return "";
  let domain = shop.trim().toLowerCase();
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  domain = domain.split("/")[0];
  if (!domain.endsWith(".myshopify.com") && domain.length > 0) {
    domain = `${domain}.myshopify.com`;
  }
  return domain;
}

/**
 * Retrieve the active tool execution context for a given agentId and real shop domain.
 * Loads the connection dynamically from StoreRepository (backed by Firestore/Memory).
 * Falls back to local sandbox mock store state if requested domain matches.
 */
export async function getToolExecutionContextForShop(
  agentId: string,
  shopDomain: string
): Promise<ToolExecutionContext> {
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

  const cleanShop = cleanDomain(shopDomain);
  const repos = getRepositories();
  let storeConnection = cleanShop ? await repos.stores.getStoreConnectionByUrl(cleanShop) : null;

  // Fallback to legacy mock store state only if no repository connection exists AND requested domain matches
  if (!storeConnection) {
    const mockStore = getShopifyStore();
    const cleanMockUrl = cleanDomain(mockStore.url);
    if (cleanShop === cleanMockUrl) {
      storeConnection = {
        id: "conn_demo",
        organizationId: "org_demo",
        storeUrl: cleanShop,
        scopes: mockStore.scopes || [],
        connectedAt: mockStore.connectedAt || new Date().toISOString(),
        status: mockStore.connected ? "CONNECTED" : "DISCONNECTED",
        plan: mockStore.plan || "Standard Plan",
        currency: mockStore.currency || "USD",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }
  }

  // If still no store connection exists or it's disconnected, return a default DISCONNECTED context
  if (!storeConnection) {
    storeConnection = {
      id: `conn_disconnected_${Date.now()}`,
      organizationId: "org_demo",
      storeUrl: cleanShop || "glowthread-apparel.myshopify.com",
      scopes: [],
      connectedAt: "",
      status: "DISCONNECTED",
      plan: "None",
      currency: "USD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  return {
    currentUser: platformContext.currentUser,
    currentOrganization: platformContext.currentOrganization,
    storeConnection,
    agentDefinition,
    agentInstallation,
    enabledTools: platformContext.enabledTools
  };
}
