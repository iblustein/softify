import { getShopifyStore } from "../data/mock-store.js";
import { getMockProducts } from "../data/mock-products.js";
import { getMockOrders } from "../data/mock-orders.js";
import { getMockSalesReport } from "../data/mock-sales.js";

export function getShopInfo() {
  return getShopifyStore();
}

export function getProducts() {
  const products = getMockProducts();
  return {
    productCount: products.length,
    sample: products.slice(0, 2),
    products: products
  };
}

export function getOrders() {
  return {
    orders: getMockOrders()
  };
}

export function getSalesSummary() {
  return getMockSalesReport();
}

export function prepareProductUpdate(productId: number, fields: any) {
  return {
    productId,
    fields
  };
}

export function prepareThemePatch(themeId: string, patch: string) {
  return {
    themeId,
    patch
  };
}
