import { AgentInstallation } from "../../domain/types.js";

export interface AgentInstallationRepository {
  getAgentInstallationById(id: string): Promise<AgentInstallation | null>;
  getAgentInstallationsByOrganizationId(organizationId: string): Promise<AgentInstallation[]>;
  getAgentInstallationsByStoreConnectionId(storeConnectionId: string): Promise<AgentInstallation[]>;
  createAgentInstallation(inst: Omit<AgentInstallation, "createdAt" | "updatedAt">): Promise<AgentInstallation>;
  updateAgentInstallation(
    id: string,
    updates: Partial<Omit<AgentInstallation, "id" | "createdAt" | "organizationId">>
  ): Promise<AgentInstallation | null>;
  deleteAgentInstallation(id: string): Promise<boolean>;
  clearAgentInstallations(): Promise<void>;
}
