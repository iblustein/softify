import { AgentInstallation } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";

/**
 * Helper to retrieve the Firestore CollectionReference configured for agent installations.
 */
function getCollection() {
  const firestore = getFirestoreClient();
  return firestore.collection("agent_installations");
}

/**
 * Normalizes the shop domain to a lowercase, protocol-free, path-free identifier ending in .myshopify.com.
 */
function normalizeShopDomain(shop: string): string {
  if (!shop) return "";
  let domain = shop.trim().toLowerCase();
  
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  domain = domain.split("/")[0];
  
  if (!domain.endsWith(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  
  return domain;
}

/**
 * Maps a Firestore document snapshot to the AgentInstallation domain model.
 */
function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): AgentInstallation | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id || doc.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    shopDomain: data.shopDomain,
    agentId: data.agentId || data.agentDefinitionId,
    allowedTools: data.allowedTools,
    enabled: data.enabled,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    // Legacy fields
    agentDefinitionId: data.agentDefinitionId,
    customSettings: data.customSettings
  };
}

/**
 * Fetches an Agent Installation by its shop domain and agent ID.
 */
export async function getByShopAndAgent(shopDomain: string, agentId: string): Promise<AgentInstallation | null> {
  const collection = getCollection();
  const normalized = normalizeShopDomain(shopDomain);

  // 1. Try querying with the direct document ID fallback
  const directId = `${normalized}_${agentId}`;
  const directSnap = await collection.doc(directId).get();
  if (directSnap.exists) {
    const inst = mapDocument(directSnap);
    if (inst) return inst;
  }

  // 2. Query where the new fields match
  const querySnap = await collection
    .where("shopDomain", "==", normalized)
    .where("agentId", "==", agentId)
    .limit(1)
    .get();

  if (!querySnap.empty) {
    return mapDocument(querySnap.docs[0]);
  }

  // 3. Fallback: query where the legacy fields match
  const legacySnap = await collection
    .where("shopDomain", "==", normalized)
    .where("agentDefinitionId", "==", agentId)
    .limit(1)
    .get();

  if (!legacySnap.empty) {
    return mapDocument(legacySnap.docs[0]);
  }

  return null;
}

/**
 * Persists or updates an Agent Installation in Firestore.
 * Preserves legacy fields in the document for non-destructive read compatibility.
 */
export async function upsertInstallation(input: AgentInstallation): Promise<AgentInstallation> {
  const collection = getCollection();
  const normalizedShop = normalizeShopDomain(input.shopDomain || "");
  const checkAgentId = input.agentId || input.agentDefinitionId || "";
  
  const docId = input.storeConnectionId 
    ? `${input.storeConnectionId}_${checkAgentId}`
    : `${normalizedShop}_${checkAgentId}`;
    
  const docRef = collection.doc(docId);
  const snap = await docRef.get();
  const now = new Date().toISOString();

  let docData: any = {
    ...input,
    shopDomain: normalizedShop,
    agentId: checkAgentId,
    updatedAt: now
  };

  if (snap.exists) {
    const existing = snap.data();
    docData = {
      ...existing,
      ...docData
    };
  } else {
    docData.createdAt = docData.createdAt || now;
  }

  await docRef.set(docData);
  const updatedSnap = await docRef.get();
  const result = mapDocument(updatedSnap);
  if (!result) {
    throw new Error("Failed to retrieve upserted AgentInstallation from Firestore");
  }
  return result;
}

/**
 * Clears all agent installations from the collection (useful for prototype resets/development).
 */
export async function clearAgentInstallations(): Promise<void> {
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
