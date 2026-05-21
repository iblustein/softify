import { ApprovalRequest } from "../../domain/types.js";

// TODO: In production, store approvals in a persistent transactional database with indexes on organizationId.
// Add validation to verify that only authorized organization members can approve/reject requests (using RBAC).
let approvals: ApprovalRequest[] = [];

export async function getApprovalById(id: string): Promise<ApprovalRequest | null> {
  const ap = approvals.find(a => a.id === id);
  return ap || null;
}

export async function getApprovalsByOrganizationId(organizationId: string): Promise<ApprovalRequest[]> {
  return approvals.filter(a => a.organizationId === organizationId);
}

export async function createApprovalRequest(req: Omit<ApprovalRequest, 'requestedAt'>): Promise<ApprovalRequest> {
  const newReq: ApprovalRequest = {
    ...req,
    requestedAt: new Date().toISOString()
  };
  approvals.unshift(newReq); // Newest first
  return newReq;
}

export async function updateApprovalRequest(
  id: string,
  updates: Partial<Omit<ApprovalRequest, 'id' | 'requestedAt' | 'organizationId'>>
): Promise<ApprovalRequest | null> {
  const idx = approvals.findIndex(a => a.id === id);
  if (idx === -1) return null;

  approvals[idx] = {
    ...approvals[idx],
    ...updates
  };
  return approvals[idx];
}

export async function deleteApprovalRequest(id: string): Promise<boolean> {
  const len = approvals.length;
  approvals = approvals.filter(a => a.id !== id);
  return approvals.length < len;
}

export async function clearApprovals(): Promise<void> {
  approvals = [];
}
