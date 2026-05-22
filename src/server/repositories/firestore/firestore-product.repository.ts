import { ProductSnapshot } from "../../domain/types.js";
import { getFirestoreClient } from "../../services/firestore-client.service.js";
import { getFirestoreConfig } from "../../config/firestore.config.js";

function getCollection() {
  const firestore = getFirestoreClient();
  const config = getFirestoreConfig();
  return firestore.collection(config.productSnapshotsCollection || "product_snapshots");
}

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

function mapDocument(doc: FirebaseFirestore.DocumentSnapshot): ProductSnapshot | null {
  const data = doc.data();
  if (!data) return null;

  return {
    id: data.id,
    organizationId: data.organizationId,
    storeConnectionId: data.storeConnectionId,
    shopDomain: data.shopDomain,
    shopifyProductId: data.shopifyProductId,
    title: data.title,
    handle: data.handle,
    status: data.status,
    vendor: data.vendor,
    productType: data.productType,
    tags: data.tags || [],
    variantsCount: data.variantsCount,
    imagesCount: data.imagesCount,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    syncedAt: data.syncedAt
  };
}

export function removeUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(removeUndefinedValues) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedValues(v)])
    ) as T;
  }

  return value;
}

export async function upsertProductSnapshot(product: ProductSnapshot): Promise<ProductSnapshot> {
  const collection = getCollection();
  const cleanShop = normalizeShopDomain(product.shopDomain);
  const docId = `${cleanShop}_${product.shopifyProductId}`;
  const docRef = collection.doc(docId);

  const now = new Date().toISOString();
  const snapshot: ProductSnapshot = {
    ...product,
    shopDomain: cleanShop,
    syncedAt: product.syncedAt || now
  };

  await docRef.set(removeUndefinedValues(snapshot));
  return snapshot;
}

export async function listProductSnapshotsByShop(shopDomain: string, limit?: number): Promise<ProductSnapshot[]> {
  const collection = getCollection();
  const cleanShop = normalizeShopDomain(shopDomain);
  
  let query = collection.where("shopDomain", "==", cleanShop);
  if (limit && limit > 0) {
    query = query.limit(limit);
  }

  const querySnap = await query.get();
  const results: ProductSnapshot[] = [];
  querySnap.forEach(doc => {
    const p = mapDocument(doc);
    if (p) {
      results.push(p);
    }
  });
  return results;
}

export async function countProductSnapshotsByShop(shopDomain: string): Promise<number> {
  const collection = getCollection();
  const cleanShop = normalizeShopDomain(shopDomain);
  
  const querySnap = await collection.where("shopDomain", "==", cleanShop).get();
  return querySnap.size;
}

export async function getLatestProductSyncAt(shopDomain: string): Promise<string | null> {
  const collection = getCollection();
  const cleanShop = normalizeShopDomain(shopDomain);
  
  try {
    const querySnap = await collection
      .where("shopDomain", "==", cleanShop)
      .orderBy("syncedAt", "desc")
      .limit(1)
      .get();

    if (querySnap.empty) {
      return null;
    }
    
    const doc = querySnap.docs[0];
    const p = mapDocument(doc);
    return p ? p.syncedAt : null;
  } catch (error) {
    // If the index isn't ready or it throws, fallback to in-memory filter and sort
    const querySnap = await collection.where("shopDomain", "==", cleanShop).get();
    if (querySnap.empty) {
      return null;
    }
    const products: ProductSnapshot[] = [];
    querySnap.forEach(doc => {
      const p = mapDocument(doc);
      if (p) products.push(p);
    });
    
    const sorted = products.sort((a, b) => new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime());
    return sorted[0].syncedAt;
  }
}

export async function deleteProductSnapshotsByShop(shopDomain: string): Promise<void> {
  const collection = getCollection();
  const cleanShop = normalizeShopDomain(shopDomain);
  
  const querySnap = await collection.where("shopDomain", "==", cleanShop).get();
  const batch = collection.firestore.batch();
  querySnap.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}

export async function clearProductSnapshots(): Promise<void> {
  const collection = getCollection();
  const querySnap = await collection.get();
  const batch = collection.firestore.batch();
  querySnap.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
}
