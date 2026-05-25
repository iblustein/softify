import { AgentRun } from "../../domain/types.js";

export interface AgentRunRepository {
  getAgentRunById(id: string): Promise<AgentRun | null>;
  getAgentRunsByOrganizationId(organizationId: string): Promise<AgentRun[]>;
  createAgentRun(run: Omit<AgentRun, "recommendationCount" | "proposedActionCount">): Promise<AgentRun>;
  updateAgentRun(
    id: string,
    updates: Partial<Omit<AgentRun, "id" | "organizationId" | "storeConnectionId">>
  ): Promise<AgentRun | null>;
  deleteAgentRun(id: string): Promise<boolean>;
  clearAgentRuns(): Promise<void>;
}
