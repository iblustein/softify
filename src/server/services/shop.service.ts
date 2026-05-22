import { ShopifyStore } from "../../types.js";
import { getShopifyStore, setShopifyStore } from "../data/mock-store.js";
import { writeLog } from "./audit-log.service.js";

import { getRepositories } from "../repositories/repository-provider.js";
import { isShopifyOAuthConfigured } from "../config/shopify.config.js";

// TODO: Migrate getShop, connectShop, and disconnectShop to StoreRepository under src/server/repositories/store.repository.ts
// In the future, shop connections and status will be persisted in a relational database instead of in-memory mock-store data.
export async function getShop(shopDomain?: string): Promise<ShopifyStore> {
  const current = getShopifyStore();
  if (isShopifyOAuthConfigured()) {
    try {
      const repos = getRepositories();
      let connectedStore = null;
      if (shopDomain) {
        const cleanShop = shopDomain.trim().toLowerCase();
        connectedStore = await repos.stores.getStoreConnectionByUrl(cleanShop);
      }
      if (!connectedStore) {
        const connections = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
        connectedStore = connections.find(c => c.status === "CONNECTED") || 
                         connections.find(c => c.status === "REAUTH_REQUIRED") ||
                         connections.find(c => c.status === "DISCONNECTED") ||
                         connections[0] || null;
      }
      if (connectedStore) {
        const shopName = connectedStore.storeUrl.split(".")[0].replace(/[-_]/g, ' ')
                          .replace(/\b\w/g, (c) => c.toUpperCase());
        const synced: ShopifyStore = {
          url: connectedStore.storeUrl,
          name: shopName || "Shopify Store",
          connected: connectedStore.status === "CONNECTED",
          connectedAt: connectedStore.connectedAt,
          plan: connectedStore.plan,
          currency: connectedStore.currency,
          scopes: connectedStore.scopes,
          status: connectedStore.status as any
        };
        // Update local mock store cache so subsequent tools/services match
        setShopifyStore(synced);
        return synced;
      }
    } catch (e) {
      console.warn("[SHOP SERVICE] OAuth repository sync warning:", e);
    }
  }
  return current;
}

// TODO: Connect real Shopify OAuth Handshake simulation for production
// TODO: Hook up Shopify GraphQL Admin API or REST API to fetch store information
export function connectShop(url: string, scopes?: string[]): { success: boolean; store: ShopifyStore } {
  if (!url) {
    throw new Error("Store URL is required");
  }

  const cleanUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '').trim();
  const shopName = cleanUrl.split('.')[0].replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase());

  const updatedStore: ShopifyStore = {
    url: cleanUrl.endsWith(".myshopify.com") ? cleanUrl : `${cleanUrl}.myshopify.com`,
    name: shopName || "My Store",
    connected: true,
    connectedAt: new Date().toISOString(),
    plan: "Standard Plan",
    currency: "USD",
    scopes: scopes || [
      "read_products", 
      "write_products", 
      "read_orders", 
      "read_customers"
    ]
  };

  setShopifyStore(updatedStore);

  writeLog(
    "Shop Owner", 
    "SHOP_CONNECTED", 
    `Connected Shopify store '${updatedStore.url}' with selected capabilities. Ready to delegate tools.`,
    { url: updatedStore.url, scopes: updatedStore.scopes }
  );

  return { success: true, store: updatedStore };
}

export async function disconnectShop(): Promise<{ success: boolean; store: ShopifyStore }> {
  const prevUrl = getShopifyStore().url;
  
  if (isShopifyOAuthConfigured()) {
    try {
      const repos = getRepositories();
      const connections = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
      for (const conn of connections) {
        if (conn.status === "CONNECTED") {
          await repos.stores.updateStoreConnection(conn.id, { status: "DISCONNECTED" });
        }
      }
    } catch (e) {
      console.warn("[SHOP SERVICE] OAuth repository disconnect warning:", e);
    }
  }

  const disconnectedStore: ShopifyStore = {
    url: "",
    name: "",
    connected: false,
    scopes: []
  };

  setShopifyStore(disconnectedStore);

  writeLog(
    "Shop Owner", 
    "SHOP_DISCONNECTED", 
    `Shopify integration severed. Offline controls enabled. Store: '${prevUrl}'`
  );

  return { success: true, store: disconnectedStore };
}
