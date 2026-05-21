import { ShopifyStore } from "../../types.js";
import { getShopifyStore, setShopifyStore } from "../data/mock-store.js";
import { writeLog } from "./audit-log.service.js";

// TODO: Migrate getShop, connectShop, and disconnectShop to StoreRepository under src/server/repositories/store.repository.ts
// In the future, shop connections and status will be persisted in a relational database instead of in-memory mock-store data.
export function getShop(): ShopifyStore {
  return getShopifyStore();
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

export function disconnectShop(): { success: boolean; store: ShopifyStore } {
  const prevUrl = getShopifyStore().url;
  
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
