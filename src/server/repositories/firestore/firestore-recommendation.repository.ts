import { Recommendation } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";

/**
 * FIRESTORE COMPOSITE INDEX REQUIREMENTS:
 * Collection: recommendations
 * 
 * Index 1:
 * - organizationId: ASC
 * - status: ASC
 * - createdAt: DESC
 */

function getCollection() {
  const firestore = getFirestoreClient();
  return firestore.collection("recommendations");
}

function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): Recommendation | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id || doc.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    agentRunId: data.agentRunId,
    agentId: data.agentId,
    resourceType: data.resourceType,
    resourceId: data.resourceId,
    recommendationType: data.recommendationType,
    title: data.title,
    summary: data.summary,
    reasoningSummary: data.reasoningSummary,
    impactLevel: data.impactLevel,
    riskLevel: data.riskLevel,
    confidence: data.confidence || 0,
    status: data.status,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

export async function getRecommendationById(id: string): Promise<Recommendation | null> {
  const doc = await getCollection().doc(id).get();
  if (!doc.exists) return null;
  return mapDocument(doc);
}

export async function getRecommendationsByOrganizationId(organizationId: string): Promise<Recommendation[]> {
  const querySnap = await getCollection()
    .where("organizationId", "==", organizationId)
    .orderBy("status", "asc")
    .orderBy("createdAt", "desc")
    .get();

  return querySnap.docs.map(mapDocument).filter(r => r !== null) as Recommendation[];
}

export async function createRecommendation(rec: Recommendation): Promise<Recommendation> {
  const collection = getCollection();
  const id = rec.id || `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const newRec: Recommendation = {
    ...rec,
    id
  };

  await collection.doc(id).set(newRec);
  return newRec;
}

export async function updateRecommendation(
  id: string,
  updates: Partial<Omit<Recommendation, "id" | "organizationId" | "storeConnectionId">>
): Promise<Recommendation | null> {
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

export async function deleteRecommendation(id: string): Promise<boolean> {
  const docRef = getCollection().doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

export async function clearRecommendations(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Violation: clearRecommendations is disabled in production.");
  }
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
