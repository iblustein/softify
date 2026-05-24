import { AgentInstallation } from "../../domain/types.js";

export interface AgentInstallationRepository {
  getByShopAndAgent(shopDomain: string, agentId: string): Promise<AgentInstallation | null>;
  upsertInstallation(input: AgentInstallation): Promise<AgentInstallation>;
  clearAgentInstallations?(): Promise<void>;
}
