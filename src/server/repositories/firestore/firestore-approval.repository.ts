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
    status: data.status,
    riskLevel: data.riskLevel,
    targetType: data.targetType || 'PRODUCT_PROPOSAL',
    targetId: data.targetId,
    proposedChangesSummary: data.proposedChangesSummary || '',
    diffSummary: data.diffSummary || '',
    sanitizedPayload: data.sanitizedPayload || {},
    allowedFields: data.allowedFields || []
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
