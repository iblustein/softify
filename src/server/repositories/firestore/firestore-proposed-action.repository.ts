import { ProposedAction } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";

/**
 * FIRESTORE COMPOSITE INDEX REQUIREMENTS:
 * Collection: proposed_actions
 * 
 * Index 1:
 * - organizationId: ASC
 * - status: ASC
 * - createdAt: DESC
 */

function getCollection() {
  const firestore = getFirestoreClient();
  return firestore.collection("proposed_actions");
}

function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): ProposedAction | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id || doc.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    agentRunId: data.agentRunId,
    agentId: data.agentId,
    recommendationId: data.recommendationId,
    targetType: data.targetType || 'PRODUCT',
    targetId: data.targetId,
    title: data.title,
    description: data.description,
    actionType: data.actionType,
    riskLevel: data.riskLevel,
    executionMode: data.executionMode,
    changes: data.changes || {},
    approvalRequestId: data.approvalRequestId,
    status: data.status,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

export async function getProposedActionById(id: string): Promise<ProposedAction | null> {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists) return null;
  return mapDocument(doc);
}

export async function getProposedActionsByOrganizationId(organizationId: string): Promise<ProposedAction[]> {
  const querySnap = await getCollection()
    .where("organizationId", "==", organizationId)
    .orderBy("status", "asc")
    .orderBy("createdAt", "desc")
    .get();

  return querySnap.docs.map(mapDocument).filter(r => r !== null) as ProposedAction[];
}

export async function createProposedAction(action: ProposedAction): Promise<ProposedAction> {
  const collection = getCollection();
  const id = action.id || `ACT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const newAction: ProposedAction = {
    ...action,
    id
  };

  await collection.doc(id).set(newAction);
  return newAction;
}

export async function updateProposedAction(
  id: string,
  updates: Partial<Omit<ProposedAction, "id" | "organizationId" | "storeConnectionId">>
): Promise<ProposedAction | null> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  await docRef.update({
    ...updates,
    updatedAt: new Date().toISOString()
  });
  const updated = await docRef.get();
  return mapDocument(updated);
}

export async function deleteProposedAction(id: string): Promise<boolean> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

export async function clearProposedActions(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Violation: clearProposedActions is disabled in production.");
  }
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
