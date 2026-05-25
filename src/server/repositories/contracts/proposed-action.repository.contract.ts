import { ProposedAction } from "../../domain/types.js";

export interface ProposedActionRepository {
  getProposedActionById(id: string): Promise<ProposedAction | null>;
  getProposedActionsByOrganizationId(organizationId: string): Promise<ProposedAction[]>;
  createProposedAction(action: ProposedAction): Promise<ProposedAction>;
  updateProposedAction(
    id: string,
    updates: Partial<Omit<ProposedAction, "id" | "organizationId" | "storeConnectionId">>
  ): Promise<ProposedAction | null>;
  deleteProposedAction(id: string): Promise<boolean>;
  clearProposedActions(): Promise<void>;
}
