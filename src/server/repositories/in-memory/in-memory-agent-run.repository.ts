import { AgentRun } from "../../domain/types.js";

let runs: AgentRun[] = [];

export async function getAgentRunById(id: string): Promise<AgentRun | null> {
  const run = runs.find(r => r.id === id);
  return run || null;
}

export async function getAgentRunsByOrganizationId(organizationId: string): Promise<AgentRun[]> {
  return runs.filter(r => r.organizationId === organizationId);
}

export async function createAgentRun(run: Omit<AgentRun, "recommendationCount" | "proposedActionCount">): Promise<AgentRun> {
  const newRun: AgentRun = {
    ...run,
    recommendationCount: 0,
    proposedActionCount: 0
  };
  runs.unshift(newRun);
  return newRun;
}

export async function updateAgentRun(
  id: string,
  updates: Partial<Omit<AgentRun, "id" | "organizationId" | "storeConnectionId">>
): Promise<AgentRun | null> {
  const idx = runs.findIndex(r => r.id === id);
  if (idx === -1) return null;

  runs[idx] = {
    ...runs[idx],
    ...updates
  };
  return runs[idx];
}

export async function deleteAgentRun(id: string): Promise<boolean> {
  const len = runs.length;
  runs = runs.filter(r => r.id !== id);
  return runs.length < len;
}

export async function clearAgentRuns(): Promise<void> {
  runs = [];
}
