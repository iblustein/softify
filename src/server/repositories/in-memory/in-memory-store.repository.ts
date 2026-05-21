import { ShopifyStoreConnection } from "../../domain/types.js";

// TODO: Replace with encrypted database fields for Shopify API access tokens.
// Access tokens should never be stored in plain text. Use AES-256-GCM or a KMS (Key Management Service).
let storeConnections: ShopifyStoreConnection[] = [];

export async function getStoreConnectionById(id: string): Promise<ShopifyStoreConnection | null> {
  const store = storeConnections.find(s => s.id === id);
  return store || null;
}

export async function getStoreConnectionByUrl(storeUrl: string): Promise<ShopifyStoreConnection | null> {
  const cleanUrl = storeUrl.trim().toLowerCase();
  return storeConnections.find(s => s.storeUrl.toLowerCase() === cleanUrl) || null;
}

export async function getStoreConnectionsByOrganizationId(organizationId: string): Promise<ShopifyStoreConnection[]> {
  return storeConnections.filter(s => s.organizationId === organizationId);
}

export async function createStoreConnection(conn: Omit<ShopifyStoreConnection, 'createdAt' | 'updatedAt'>): Promise<ShopifyStoreConnection> {
  const newConn: ShopifyStoreConnection = {
    ...conn,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  storeConnections.push(newConn);
  return newConn;
}

export async function updateStoreConnection(
  id: string,
  updates: Partial<Omit<ShopifyStoreConnection, 'id' | 'createdAt' | 'organizationId'>>
): Promise<ShopifyStoreConnection | null> {
  const idx = storeConnections.findIndex(s => s.id === id);
  if (idx === -1) return null;

  storeConnections[idx] = {
    ...storeConnections[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  return storeConnections[idx];
}

export async function deleteStoreConnection(id: string): Promise<boolean> {
  const len = storeConnections.length;
  storeConnections = storeConnections.filter(s => s.id !== id);
  return storeConnections.length < len;
}

export async function clearStoreConnections(): Promise<void> {
  storeConnections = [];
}
