import { ProductSnapshot } from "../../domain/types.js";

export interface ProductRepository {
  upsertProductSnapshot(product: ProductSnapshot): Promise<ProductSnapshot>;
  listProductSnapshotsByShop(shopDomain: string, limit?: number): Promise<ProductSnapshot[]>;
  countProductSnapshotsByShop(shopDomain: string): Promise<number>;
  getLatestProductSyncAt(shopDomain: string): Promise<string | null>;
  deleteProductSnapshotsByShop(shopDomain: string): Promise<void>;
}
