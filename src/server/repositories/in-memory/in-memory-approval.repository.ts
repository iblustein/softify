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

export async function claimApprovalForExecution(approvalId: string, organizationId: string): Promise<ApprovalRequest> {
  const idx = approvals.findIndex(a => a.id === approvalId);
  if (idx === -1) {
    throw new Error("Approval request not found.");
  }
  const approval = approvals[idx];
  if (approval.organizationId !== organizationId) {
    throw new Error("Access denied. Approval request does not belong to this organization.");
  }
  if (approval.status !== "APPROVED") {
    throw new Error(`Concurrency block: expected status APPROVED, got ${approval.status}`);
  }
  approvals[idx] = {
    ...approval,
    status: "EXECUTING"
  };
  return approvals[idx];
}

export async function resetFailedApproval(params: {
  approvalId: string;
  organizationId: string;
  storeConnectionId?: string;
  performedBy: string;
}): Promise<ApprovalRequest> {
  const { approvalId, organizationId, storeConnectionId, performedBy } = params;
  const idx = approvals.findIndex(a => a.id === approvalId);
  if (idx === -1) {
    throw new Error("Approval request not found.");
  }
  const approval = approvals[idx];
  if (approval.organizationId !== organizationId) {
    throw new Error("Access denied. Approval request does not belong to this organization.");
  }
  if (storeConnectionId && approval.storeConnectionId !== storeConnectionId) {
    throw new Error("Access denied. Store connection mismatch.");
  }
  if (approval.status !== "FAILED") {
    throw new Error(`Invalid status: expected FAILED state, got ${approval.status}.`);
  }
  approvals[idx] = {
    ...approval,
    status: "APPROVED",
    lastExecutionStatus: "FAILED",
    lastExecutedBy: performedBy
  };
  return approvals[idx];
}

export async function markStuckExecutingAsFailed(params: {
  approvalId: string;
  organizationId: string;
  storeConnectionId?: string;
  timeoutMs: number;
  performedBy: string;
  reason: "execution_timeout" | "operator_marked_stuck" | "manual_recovery";
}): Promise<ApprovalRequest> {
  const { approvalId, organizationId, storeConnectionId, timeoutMs, performedBy, reason } = params;
  const allowlist = ["execution_timeout", "operator_marked_stuck", "manual_recovery"];
  if (!allowlist.includes(reason)) {
    throw new Error(`Invalid recovery reason: ${reason}`);
  }
  const idx = approvals.findIndex(a => a.id === approvalId);
  if (idx === -1) {
    throw new Error("Approval request not found.");
  }
  const approval = approvals[idx];
  if (approval.organizationId !== organizationId) {
    throw new Error("Access denied. Approval request does not belong to this organization.");
  }
  if (storeConnectionId && approval.storeConnectionId !== storeConnectionId) {
    throw new Error("Access denied. Store connection mismatch.");
  }
  if (approval.status !== "EXECUTING") {
    throw new Error(`Invalid status: expected EXECUTING state, got ${approval.status}.`);
  }
  if (!approval.executionStartedAt) {
    throw new Error("Execution started timestamp is missing.");
  }
  const elapsed = Date.now() - Date.parse(approval.executionStartedAt);
  if (elapsed < timeoutMs) {
    throw new Error(`Execution is not stuck: only ${Math.round(elapsed / 1000)}s elapsed.`);
  }

  approvals[idx] = {
    ...approval,
    status: "FAILED",
    lastExecutionStatus: "EXECUTING",
    lastFailureReason: reason,
    lastFailureCode: "EXECUTION_TIMEOUT",
    executionFinishedAt: new Date().toISOString(),
    lastExecutedBy: performedBy
  };
  return approvals[idx];
}
