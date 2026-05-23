import { ToolDefinition } from "../domain/types.js";

export const ENABLED_TOOLS: ToolDefinition[] = [
  {
    name: "shopify.getShopInfo",
    description: "Retrieve comprehensive shop general settings, configurations, name, currency, policies, and domain context.",
    parameters: "{}",
    requiredScope: "read_content",
    riskLevel: "Low"
  },
  {
    name: "shopify.getProducts",
    description: "Fetch product catalog items including IDs, descriptions, pricing, inventory levels, tags, and status information.",
    parameters: "{}",
    requiredScope: "read_products",
    riskLevel: "Low"
  },
  {
    name: "shopify.getOrders",
    description: "Inspect customer orders, fulfillment statuses, line items, timestamps, and payment tracking statistics.",
    parameters: "{}",
    requiredScope: "read_orders",
    riskLevel: "Low"
  },
  {
    name: "shopify.getSalesSummary",
    description: "Analyze weekly/monthly sales aggregated reports, orders count, and key-performance store index data.",
    parameters: "{}",
    requiredScope: "read_analytics",
    riskLevel: "Low"
  },
  {
    name: "shopify.prepareProductUpdate",
    description: "Draft structural updates (e.g. SEO descriptions or pricing fields) for products, queuing items in the human-in-the-loop Approval interface.",
    parameters: '{"productId": "number", "fields": "object", "summary": "string"}',
    requiredScope: "write_products",
    riskLevel: "Medium"
  },
  {
    name: "shopify.prepareThemePatch",
    description: "Draft custom layout theme patches or CSS rule modifications, queuing items in the human-in-the-loop Approval interface.",
    parameters: '{"themeId": "string", "patch": "string", "summary": "string"}',
    requiredScope: "write_themes",
    riskLevel: "High"
  },
  {
    name: "shopify.shop.read",
    description: "Read real general shop settings, plan, currency, and scopes using live Shopify Admin API.",
    parameters: '{"shopDomain": "string?"}',
    requiredScope: "",
    riskLevel: "Low"
  },
  {
    name: "shopify.products.read",
    description: "Read real products list, statuses, pricing, and tags using live Shopify Admin API.",
    parameters: '{"shopDomain": "string?", "limit": "number?", "query": "string?", "after": "string?"}',
    requiredScope: "read_products",
    riskLevel: "Low"
  },
  {
    name: "catalog.products.status",
    description: "Read catalog product snapshot sync status.",
    parameters: '{"shop": "string"}',
    requiredScope: "read_products",
    riskLevel: "Low"
  },
  {
    name: "catalog.products.summary",
    description: "Get product sync count and timestamps summary.",
    parameters: '{"shop": "string"}',
    requiredScope: "read_products",
    riskLevel: "Low"
  },
  {
    name: "catalog.products.read",
    description: "Read synced catalog product snapshot list.",
    parameters: '{"shop": "string", "limit": "number?"}',
    requiredScope: "read_products",
    riskLevel: "Low"
  },
  {
    name: "catalog.products.list",
    description: "List synced catalog product snapshots.",
    parameters: '{"shop": "string", "limit": "number?"}',
    requiredScope: "read_products",
    riskLevel: "Low"
  }
];
