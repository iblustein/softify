import { ShopifyStoreConnection } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";
import { getFirestoreConfig } from "../../config/firestore.config.js";

/**
 * Helper to retrieve the Firestore CollectionReference configured for Shopify store connections.
 */
function getCollection() {
  const firestore = getFirestoreClient();
  const config = getFirestoreConfig();
  return firestore.collection(config.storeConnectionsCollection);
}

/**
 * Normalizes the shop domain to a lowercase, protocol-free, path-free identifier ending in .myshopify.com.
 */
function normalizeShopDomain(shop: string): string {
  if (!shop) return "";
  let domain = shop.trim().toLowerCase();
  
  // Remove leading protocol and www
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
  
  // Remove any trailing path/querystring parameters
  domain = domain.split("/")[0];
  
  if (!domain.endsWith(".myshopify.com")) {
    domain = `${domain}.myshopify.com`;
  }
  
  return domain;
}

/**
 * Maps a Firestore document snapshot to the ShopifyStoreConnection domain model.
 */
function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): ShopifyStoreConnection | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id,
    organizationId: data.organizationId,
    storeUrl: data.storeUrl || data.shopDomain || "",
    accessTokenEncrypted: data.accessTokenEncrypted,
    scopes: data.scopes || data.grantedScopes || [],
    connectedAt: data.connectedAt,
    status: data.status,
    plan: data.plan,
    currency: data.currency,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
}

/**
 * Safely resolves a DocumentReference using UUID lookup, direct document path, or normalized fallback.
 */
async function resolveDocRef(collection: FirebaseFirestore.CollectionReference, id: string) {
  // 1. Try treating id directly as the Document ID (normalized shop url)
  const directRef = collection.doc(id);
  const directSnap = await directRef.get();
  if (directSnap.exists) {
    return directRef;
  }

  // 2. Query where the internal "id" field matches the UUID
  const querySnap = await collection.where("id", "==", id).limit(1).get();
  if (!querySnap.empty) {
    return querySnap.docs[0].ref;
  }

  // 3. Fallback: normalize input and attempt direct document retrieval
  const normalized = normalizeShopDomain(id);
  if (normalized !== id) {
    const normRef = collection.doc(normalized);
    const normSnap = await normRef.get();
    if (normSnap.exists) {
      return normRef;
    }
  }

  return null;
}

/**
 * Fetches a Shopify Store Connection by its unique ID (UUID or shop domain).
 */
export async function getStoreConnectionById(id: string): Promise<ShopifyStoreConnection | null> {
  const collection = getCollection();
  const docRef = await resolveDocRef(collection, id);
  if (!docRef) return null;
  const snap = await docRef.get();
  return mapDocument(snap);
}

/**
 * Fetches a Shopify Store Connection by its shop URL.
 */
export async function getStoreConnectionByUrl(storeUrl: string): Promise<ShopifyStoreConnection | null> {
  const collection = getCollection();
  const normalized = normalizeShopDomain(storeUrl);
  const docRef = collection.doc(normalized);
  const snap = await docRef.get();
  if (!snap.exists) {
    // Try querying by storeUrl field in case document id is not normalized shop URL
    const querySnap = await collection.where("storeUrl", "==", storeUrl).limit(1).get();
    if (!querySnap.empty) {
      return mapDocument(querySnap.docs[0]);
    }
    return null;
  }
  return mapDocument(snap);
}

/**
 * Retrieves all store connections linked to a specific organization ID.
 */
export async function getStoreConnectionsByOrganizationId(organizationId: string): Promise<ShopifyStoreConnection[]> {
  // TODO: tenant-aware filtering: implement proper security rules or query scopes for organizations
  const collection = getCollection();
  const querySnap = await collection.where("organizationId", "==", organizationId).get();
  const results: ShopifyStoreConnection[] = [];
  querySnap.forEach(doc => {
    const conn = mapDocument(doc);
    if (conn) {
      results.push(conn);
    }
  });
  return results;
}

/**
 * Persists a new Shopify Store Connection using the normalized domain name as the Document ID.
 */
export async function createStoreConnection(conn: Omit<ShopifyStoreConnection, "createdAt" | "updatedAt">): Promise<ShopifyStoreConnection> {
  const collection = getCollection();
  const normalized = normalizeShopDomain(conn.storeUrl);
  const docRef = collection.doc(normalized);

  const now = new Date().toISOString();
  const docData = {
    ...conn,
    shopDomain: normalized, // Store shopDomain field explicitly inside document
    createdAt: now,
    updatedAt: now
  };

  await docRef.set(docData);
  const snap = await docRef.get();
  const created = mapDocument(snap);
  if (!created) {
    throw new Error("Failed to retrieve created ShopifyStoreConnection from Firestore");
  }
  return created;
}

/**
 * Updates properties of an existing store connection document.
 */
export async function updateStoreConnection(
  id: string,
  updates: Partial<Omit<ShopifyStoreConnection, "id" | "createdAt" | "organizationId">>
): Promise<ShopifyStoreConnection | null> {
  const collection = getCollection();
  const docRef = await resolveDocRef(collection, id);
  if (!docRef) return null;

  const now = new Date().toISOString();
  const firestoreUpdates = {
    ...updates,
    updatedAt: now
  };

  await docRef.update(firestoreUpdates);
  const snap = await docRef.get();
  return mapDocument(snap);
}

/**
 * Deletes an existing store connection document.
 */
export async function deleteStoreConnection(id: string): Promise<boolean> {
  const collection = getCollection();
  const docRef = await resolveDocRef(collection, id);
  if (!docRef) return false;

  await docRef.delete();
  return true;
}

/**
 * Empties all store connections within the collection (useful for prototype resets/development).
 */
export async function clearStoreConnections(): Promise<void> {
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
