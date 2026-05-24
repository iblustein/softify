import { AgentInstallation } from "../../domain/types.js";

let agentInstallations: AgentInstallation[] = [];

export async function getByShopAndAgent(shopDomain: string, agentId: string): Promise<AgentInstallation | null> {
  const normalizedShop = shopDomain.trim().toLowerCase();
  
  const inst = agentInstallations.find(ai => {
    if (ai.shopDomain && ai.agentId) {
      return ai.shopDomain.trim().toLowerCase() === normalizedShop && ai.agentId === agentId;
    }
    // Legacy fallback check
    const checkAgentId = ai.agentId || ai.agentDefinitionId;
    if (checkAgentId === agentId) {
      return true;
    }
    return false;
  });
  
  return inst || null;
}

export async function upsertInstallation(input: AgentInstallation): Promise<AgentInstallation> {
  const idx = agentInstallations.findIndex(ai => ai.id === input.id);
  
  const updatedRecord: AgentInstallation = {
    ...input,
    updatedAt: new Date().toISOString()
  };
  
  if (idx !== -1) {
    // Preserve legacy fields for non-destructive update
    agentInstallations[idx] = {
      ...agentInstallations[idx],
      ...updatedRecord
    };
    return agentInstallations[idx];
  } else {
    agentInstallations.push(updatedRecord);
    return updatedRecord;
  }
}

export async function clearAgentInstallations(): Promise<void> {
  agentInstallations = [];
}
