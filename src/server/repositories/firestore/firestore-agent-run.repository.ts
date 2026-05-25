import { AgentRun } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";

/**
 * FIRESTORE COMPOSITE INDEX REQUIREMENTS:
 * Collection: agent_runs
 * 
 * Index 1:
 * - organizationId: ASC
 * - startedAt: DESC
 * 
 * Index 2:
 * - organizationId: ASC
 * - storeConnectionId: ASC
 * - startedAt: DESC
 */

function getCollection() {
  const firestore = getFirestoreClient();
  return firestore.collection("agent_runs");
}

function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): AgentRun | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id || doc.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    agentId: data.agentId,
    agentVersion: data.agentVersion,
    status: data.status,
    scope: data.scope || {},
    mode: data.mode,
    requestedBy: data.requestedBy,
    startedAt: data.startedAt,
    finishedAt: data.finishedAt,
    summary: data.summary,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage,
    recommendationCount: data.recommendationCount || 0,
    proposedActionCount: data.proposedActionCount || 0,
    auditCorrelationId: data.auditCorrelationId || ""
  };
}

export async function getAgentRunById(id: string): Promise<AgentRun | null> {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists) return null;
  return mapDocument(doc);
}

export async function getAgentRunsByOrganizationId(organizationId: string): Promise<AgentRun[]> {
  const querySnap = await getCollection()
    .where("organizationId", "==", organizationId)
    .orderBy("startedAt", "desc")
    .get();

  return querySnap.docs.map(mapDocument).filter(r => r !== null) as AgentRun[];
}

export async function createAgentRun(run: Omit<AgentRun, "recommendationCount" | "proposedActionCount">): Promise<AgentRun> {
  const collection = getCollection();
  const id = run.id || `RUN-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  const newRun: AgentRun = {
    ...run,
    id,
    recommendationCount: 0,
    proposedActionCount: 0
  };

  await collection.doc(id).set(newRun);
  return newRun;
}

export async function updateAgentRun(
  id: string,
  updates: Partial<Omit<AgentRun, "id" | "organizationId" | "storeConnectionId">>
): Promise<AgentRun | null> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  await docRef.update(updates);
  const updated = await docRef.get();
  return mapDocument(updated);
}

export async function deleteAgentRun(id: string): Promise<boolean> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

export async function clearAgentRuns(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Violation: clearAgentRuns is disabled in production.");
  }
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
