import { ShopifyStore } from "../../types.js";

export let shopifyStore: ShopifyStore = {
  url: "luminary-essentials.myshopify.com",
  name: "Luminary Essentials",
  connected: true,
  connectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  plan: "Shopify Plus",
  currency: "USD",
  scopes: [
    "read_products", 
    "write_products", 
    "read_orders", 
    "read_customers", 
    "write_themes", 
    "read_analytics"
  ]
};

export function getShopifyStore(): ShopifyStore {
  return shopifyStore;
}

export function setShopifyStore(newStore: ShopifyStore): void {
  shopifyStore = newStore;
}
