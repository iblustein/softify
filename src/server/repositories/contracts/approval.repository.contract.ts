import { ApprovalRequest } from "../../domain/types.js";

export interface ApprovalRepository {
  getApprovalById(id: string): Promise<ApprovalRequest | null>;
  getApprovalsByOrganizationId(organizationId: string): Promise<ApprovalRequest[]>;
  createApprovalRequest(req: Omit<ApprovalRequest, "requestedAt">): Promise<ApprovalRequest>;
  updateApprovalRequest(
    id: string,
    updates: Partial<Omit<ApprovalRequest, "id" | "requestedAt" | "organizationId">>
  ): Promise<ApprovalRequest | null>;
  deleteApprovalRequest(id: string): Promise<boolean>;
  clearApprovals(): Promise<void>;
}
