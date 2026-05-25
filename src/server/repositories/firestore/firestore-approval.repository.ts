import { ApprovalRequest } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";

/**
 * FIRESTORE COMPOSITE INDEX REQUIREMENTS:
 * Collection: merchant_approvals
 * 
 * Index 1:
 * - organizationId: ASC
 * - requestedAt: DESC
 */

/**
 * Helper to retrieve the Firestore CollectionReference configured for merchant approvals.
 */
function getCollection() {
  const firestore = getFirestoreClient();
  return firestore.collection("merchant_approvals");
}

/**
 * Maps a Firestore document snapshot to the redesigned ApprovalRequest domain model,
 * strictly excluding any raw/legacy fields from Firestore persistence.
 */
function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): ApprovalRequest | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id || doc.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    agentInstallationId: data.agentInstallationId,
    agentId: data.agentId,
    toolName: data.toolName as "catalog.products.propose_update",
    requestedBy: data.requestedBy,
    requestedAt: data.requestedAt,
    decidedAt: data.decidedAt,
    decidedBy: data.decidedBy,
    executedAt: data.executedAt,
    executedBy: data.executedBy,
    failureReason: data.failureReason,
    status: data.status,
    riskLevel: data.riskLevel,
    targetType: data.targetType || 'PRODUCT_PROPOSAL',
    targetId: data.targetId,
    proposedChangesSummary: data.proposedChangesSummary || '',
    diffSummary: data.diffSummary || '',
    sanitizedPayload: data.sanitizedPayload || {},
    allowedFields: data.allowedFields || [],
    executionStartedAt: data.executionStartedAt,
    executionFinishedAt: data.executionFinishedAt,
    executionAttemptCount: data.executionAttemptCount,
    lastExecutionStatus: data.lastExecutionStatus,
    lastFailureReason: data.lastFailureReason,
    lastFailureCode: data.lastFailureCode,
    lastBlockedReason: data.lastBlockedReason,
    lastExecutedBy: data.lastExecutedBy,
    lastExecutionCorrelationId: data.lastExecutionCorrelationId
  };
}

export async function getApprovalById(id: string): Promise<ApprovalRequest | null> {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists) return null;
  return mapDocument(doc);
}

export async function getApprovalsByOrganizationId(organizationId: string): Promise<ApprovalRequest[]> {
  const querySnap = await getCollection()
    .where("organizationId", "==", organizationId)
    .orderBy("requestedAt", "desc")
    .get();

  return querySnap.docs.map(mapDocument).filter(a => a !== null) as ApprovalRequest[];
}

export async function createApprovalRequest(req: Omit<ApprovalRequest, "requestedAt">): Promise<ApprovalRequest> {
  const collection = getCollection();
  const id = req.id || `APV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const requestedAt = new Date().toISOString();

  const newApproval: ApprovalRequest = {
    ...req,
    id,
    requestedAt
  };

  await collection.doc(id).set(newApproval);
  return newApproval;
}

export async function updateApprovalRequest(
  id: string,
  updates: Partial<Omit<ApprovalRequest, "id" | "requestedAt" | "organizationId">>
): Promise<ApprovalRequest | null> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  await docRef.update(updates);
  const updated = await docRef.get();
  return mapDocument(updated);
}

export async function deleteApprovalRequest(id: string): Promise<boolean> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

export async function clearApprovals(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Violation: clearApprovals is strictly disabled in production environments.");
  }
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

export async function claimApprovalForExecution(approvalId: string, organizationId: string): Promise<ApprovalRequest> {
  const firestore = getFirestoreClient();
  const docRef = getCollection().doc(approvalId);

  await firestore.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists) {
      throw new Error("Approval request not found.");
    }
    const data = docSnap.data();
    if (!data) {
      throw new Error("Approval request data is empty.");
    }
    if (data.organizationId !== organizationId) {
      throw new Error("Access denied. Approval request does not belong to this organization.");
    }
    if (data.status !== "APPROVED") {
      throw new Error(`Concurrency block: expected status APPROVED, got ${data.status}`);
    }

    transaction.update(docRef, { status: "EXECUTING" });
  });

  const updatedDoc = await docRef.get();
  const result = mapDocument(updatedDoc);
  if (!result) {
    throw new Error("Failed to map updated claimed document.");
  }
  return result;
}

export async function resetFailedApproval(params: {
  approvalId: string;
  organizationId: string;
  storeConnectionId?: string;
  performedBy: string;
}): Promise<ApprovalRequest> {
  const { approvalId, organizationId, storeConnectionId, performedBy } = params;
  const firestore = getFirestoreClient();
  const docRef = getCollection().doc(approvalId);

  await firestore.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists) {
      throw new Error("Approval request not found.");
    }
    const data = docSnap.data();
    if (!data) {
      throw new Error("Approval request data is empty.");
    }
    if (data.organizationId !== organizationId) {
      throw new Error("Access denied. Approval request does not belong to this organization.");
    }
    if (storeConnectionId && data.storeConnectionId !== storeConnectionId) {
      throw new Error("Access denied. Store connection mismatch.");
    }
    if (data.status !== "FAILED") {
      throw new Error(`Invalid status: expected FAILED state, got ${data.status}.`);
    }

    transaction.update(docRef, {
      status: "APPROVED",
      lastExecutionStatus: "FAILED",
      lastExecutedBy: performedBy
    });
  });

  const updatedDoc = await docRef.get();
  const result = mapDocument(updatedDoc);
  if (!result) {
    throw new Error("Failed to map updated reset document.");
  }
  return result;
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

  const firestore = getFirestoreClient();
  const docRef = getCollection().doc(approvalId);

  await firestore.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);
    if (!docSnap.exists) {
      throw new Error("Approval request not found.");
    }
    const data = docSnap.data();
    if (!data) {
      throw new Error("Approval request data is empty.");
    }
    if (data.organizationId !== organizationId) {
      throw new Error("Access denied. Approval request does not belong to this organization.");
    }
    if (storeConnectionId && data.storeConnectionId !== storeConnectionId) {
      throw new Error("Access denied. Store connection mismatch.");
    }
    if (data.status !== "EXECUTING") {
      throw new Error(`Invalid status: expected EXECUTING state, got ${data.status}.`);
    }
    if (!data.executionStartedAt) {
      throw new Error("Execution started timestamp is missing.");
    }
    const elapsed = Date.now() - Date.parse(data.executionStartedAt);
    if (elapsed < timeoutMs) {
      throw new Error(`Execution is not stuck: only ${Math.round(elapsed / 1000)}s elapsed.`);
    }

    transaction.update(docRef, {
      status: "FAILED",
      lastExecutionStatus: "EXECUTING",
      lastFailureReason: reason,
      lastFailureCode: "EXECUTION_TIMEOUT",
      executionFinishedAt: new Date().toISOString(),
      lastExecutedBy: performedBy
    });
  });

  const updatedDoc = await docRef.get();
  const result = mapDocument(updatedDoc);
  if (!result) {
    throw new Error("Failed to map updated stuck-execution-failed document.");
  }
  return result;
}
