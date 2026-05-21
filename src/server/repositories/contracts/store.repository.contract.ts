import { ShopifyStoreConnection } from "../../domain/types.js";

export interface StoreRepository {
  getStoreConnectionById(id: string): Promise<ShopifyStoreConnection | null>;
  getStoreConnectionByUrl(storeUrl: string): Promise<ShopifyStoreConnection | null>;
  getStoreConnectionsByOrganizationId(organizationId: string): Promise<ShopifyStoreConnection[]>;
  createStoreConnection(conn: Omit<ShopifyStoreConnection, "createdAt" | "updatedAt">): Promise<ShopifyStoreConnection>;
  updateStoreConnection(
    id: string,
    updates: Partial<Omit<ShopifyStoreConnection, "id" | "createdAt" | "organizationId">>
  ): Promise<ShopifyStoreConnection | null>;
  deleteStoreConnection(id: string): Promise<boolean>;
  clearStoreConnections(): Promise<void>;
}
