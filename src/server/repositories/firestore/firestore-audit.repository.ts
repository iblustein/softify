import { AuditEvent } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";

/**
 * FIRESTORE COMPOSITE INDEX REQUIREMENTS:
 * Collection: agent_audit_logs
 * 
 * Index 1:
 * - organizationId: ASC
 * - timestamp: DESC
 * 
 * Index 2 (Optional but highly recommended for fast store-scoped query execution):
 * - organizationId: ASC
 * - storeConnectionId: ASC
 * - timestamp: DESC
 */

/**
 * Helper to retrieve the Firestore CollectionReference configured for agent audit logs.
 */
function getCollection() {
  const firestore = getFirestoreClient();
  return firestore.collection("agent_audit_logs");
}

/**
 * Maps a Firestore document snapshot to the AuditEvent domain model.
 */
function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): AuditEvent | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id || doc.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    timestamp: data.timestamp,
    initiator: data.initiator,
    event: data.event,
    description: data.description,
    metadata: data.metadata,
    // Phase 10.5 structured fields
    agentId: data.agentId,
    agentDefinitionId: data.agentDefinitionId,
    agentInstallationId: data.agentInstallationId,
    toolName: data.toolName,
    provider: data.provider,
    decision: data.decision,
    reason: data.reason,
    correlationId: data.correlationId
  };
}

export async function getAuditEventById(id: string): Promise<AuditEvent | null> {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists) return null;
  return mapDocument(doc);
}

export async function getAuditEventsByOrganizationId(organizationId: string): Promise<AuditEvent[]> {
  const querySnap = await getCollection()
    .where("organizationId", "==", organizationId)
    .orderBy("timestamp", "desc")
    .get();

  return querySnap.docs.map(mapDocument).filter(e => e !== null) as AuditEvent[];
}

export async function createAuditEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { id?: string }): Promise<AuditEvent> {
  const collection = getCollection();
  const id = event.id || `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newEvent: AuditEvent = {
    ...event,
    id,
    timestamp: now
  };

  await collection.doc(id).set(newEvent);
  return newEvent;
}

export async function getAllAuditEvents(): Promise<AuditEvent[]> {
  const querySnap = await getCollection()
    .orderBy("timestamp", "desc")
    .get();

  return querySnap.docs.map(mapDocument).filter(e => e !== null) as AuditEvent[];
}

export async function clearAuditEvents(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Violation: clearAuditEvents is strictly disabled in production environments.");
  }
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
