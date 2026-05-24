import { AgentInstallation } from "../../domain/types.js";

let agentInstallations: AgentInstallation[] = [];

export async function getByShopAndAgent(shopDomain: string, agentId: string): Promise<AgentInstallation | null> {
  const normalizedShop = shopDomain.trim().toLowerCase();
  
  const inst = agentInstallations.find(ai => {
    const recordShop = ai.shopDomain ? ai.shopDomain.trim().toLowerCase() : null;
    if (!recordShop || recordShop !== normalizedShop) {
      return false;
    }
    
    const checkAgentId = ai.agentId || ai.agentDefinitionId;
    return checkAgentId === agentId;
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
