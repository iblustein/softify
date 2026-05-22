import { ProductSnapshot } from "../../domain/types.js";

let productSnapshots: ProductSnapshot[] = [];

export async function upsertProductSnapshot(product: ProductSnapshot): Promise<ProductSnapshot> {
  const index = productSnapshots.findIndex(p => p.id === product.id);
  const now = new Date().toISOString();
  const snapshot: ProductSnapshot = {
    ...product,
    syncedAt: product.syncedAt || now
  };
  
  if (index !== -1) {
    productSnapshots[index] = snapshot;
  } else {
    productSnapshots.push(snapshot);
  }
  return snapshot;
}

export async function listProductSnapshotsByShop(shopDomain: string, limit?: number): Promise<ProductSnapshot[]> {
  const cleanShop = shopDomain.trim().toLowerCase();
  const filtered = productSnapshots.filter(p => p.shopDomain.toLowerCase() === cleanShop);
  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }
  return filtered;
}

export async function countProductSnapshotsByShop(shopDomain: string): Promise<number> {
  const cleanShop = shopDomain.trim().toLowerCase();
  return productSnapshots.filter(p => p.shopDomain.toLowerCase() === cleanShop).length;
}

export async function getLatestProductSyncAt(shopDomain: string): Promise<string | null> {
  const cleanShop = shopDomain.trim().toLowerCase();
  const filtered = productSnapshots.filter(p => p.shopDomain.toLowerCase() === cleanShop);
  if (filtered.length === 0) return null;
  
  const sorted = [...filtered].sort((a, b) => new Date(b.syncedAt).getTime() - new Date(a.syncedAt).getTime());
  return sorted[0].syncedAt;
}

export async function deleteProductSnapshotsByShop(shopDomain: string): Promise<void> {
  const cleanShop = shopDomain.trim().toLowerCase();
  productSnapshots = productSnapshots.filter(p => p.shopDomain.toLowerCase() !== cleanShop);
}

export async function clearProductSnapshots(): Promise<void> {
  productSnapshots = [];
}
