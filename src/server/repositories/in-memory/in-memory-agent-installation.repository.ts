import { AgentInstallation } from "../../domain/types.js";

// TODO: Implement relational constraints (FK constraints on org and store connections) using a real DB.
// In the future, this repository will support checking tenant-level billing plan limits before enabling an agent.
let agentInstallations: AgentInstallation[] = [];

export async function getAgentInstallationById(id: string): Promise<AgentInstallation | null> {
  const inst = agentInstallations.find(ai => ai.id === id);
  return inst || null;
}

export async function getAgentInstallationsByOrganizationId(organizationId: string): Promise<AgentInstallation[]> {
  return agentInstallations.filter(ai => ai.organizationId === organizationId);
}

export async function getAgentInstallationsByStoreConnectionId(storeConnectionId: string): Promise<AgentInstallation[]> {
  return agentInstallations.filter(ai => ai.storeConnectionId === storeConnectionId);
}

export async function createAgentInstallation(inst: Omit<AgentInstallation, 'createdAt' | 'updatedAt'>): Promise<AgentInstallation> {
  const newInst: AgentInstallation = {
    ...inst,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  agentInstallations.push(newInst);
  return newInst;
}

export async function updateAgentInstallation(
  id: string,
  updates: Partial<Omit<AgentInstallation, 'id' | 'createdAt' | 'organizationId'>>
): Promise<AgentInstallation | null> {
  const idx = agentInstallations.findIndex(ai => ai.id === id);
  if (idx === -1) return null;

  agentInstallations[idx] = {
    ...agentInstallations[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return agentInstallations[idx];
}

export async function deleteAgentInstallation(id: string): Promise<boolean> {
  const len = agentInstallations.length;
  agentInstallations = agentInstallations.filter(ai => ai.id !== id);
  return agentInstallations.length < len;
}

export async function clearAgentInstallations(): Promise<void> {
  agentInstallations = [];
}
