import { ProposedAction } from "../../domain/types.js";

let actions: ProposedAction[] = [];

export async function getProposedActionById(id: string): Promise<ProposedAction | null> {
  const act = actions.find(a => a.id === id);
  return act || null;
}

export async function getProposedActionsByOrganizationId(organizationId: string): Promise<ProposedAction[]> {
  return actions.filter(a => a.organizationId === organizationId);
}

export async function createProposedAction(action: ProposedAction): Promise<ProposedAction> {
  actions.unshift(action);
  return action;
}

export async function updateProposedAction(
  id: string,
  updates: Partial<Omit<ProposedAction, "id" | "organizationId" | "storeConnectionId">>
): Promise<ProposedAction | null> {
  const idx = actions.findIndex(a => a.id === id);
  if (idx === -1) return null;

  actions[idx] = {
    ...actions[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return actions[idx];
}

export async function deleteProposedAction(id: string): Promise<boolean> {
  const len = actions.length;
  actions = actions.filter(a => a.id !== id);
  return actions.length < len;
}

export async function clearProposedActions(): Promise<void> {
  actions = [];
}
