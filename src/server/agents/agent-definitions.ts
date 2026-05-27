import { AgentDefinition } from "../domain/types.js";

export const AGENT_PRODUCT_INTELLIGENCE: AgentDefinition = {
  id: "agent_product_intelligence",
  name: "Product Intelligence Agent",
  description: "Analyzes Shopify product snapshots.",
  systemInstruction: "You are the Product Intelligence Agent. You analyze the store's product catalog snapshots and answer questions using only allowed tools.",
  allowedTools: [
    "catalog.products.status",
    "catalog.products.summary",
    "catalog.products.list",
    "catalog.products.read",
    "catalog.insights.health",
    "catalog.insights.missing_images",
    "catalog.insights.missing_vendor",
    "catalog.insights.missing_product_type",
    "catalog.insights.vendor_summary",
    "catalog.insights.product_type_summary",
    "catalog.insights.stale_snapshots",
    "catalog.products.propose_update"
  ],
  requiredScopes: ["read_products"],
  riskLevel: "Low",
  avatarColor: "bg-teal-600 text-white",
  createdAt: "2026-05-23T12:00:00.000Z",
  updatedAt: "2026-05-23T12:00:00.000Z"
};

export const AGENT_CATALOG_HEALTH: AgentDefinition = {
  id: "agent_catalog_health",
  name: "Catalog Health Agent",
  description: "Identifies catalog quality deficiencies, missing images, missing vendors, or missing classification tags.",
  systemInstruction: "You are the Catalog Health Agent. You identify catalog quality issues, missing images, missing vendors, or missing product data. You propose title, vendor, productType, and tags updates only (no status changes).",
  allowedTools: [
    "catalog.insights.health",
    "catalog.insights.missing_images",
    "catalog.products.propose_update",
    "shopify.products.read"
  ],
  requiredScopes: ["read_products"],
  riskLevel: "Medium",
  avatarColor: "bg-blue-600 text-white",
  createdAt: "2026-05-27T12:00:00.000Z",
  updatedAt: "2026-05-27T12:00:00.000Z"
};

export const AGENT_PRODUCT_SEO: AgentDefinition = {
  id: "agent_product_seo",
  name: "Product SEO Agent",
  description: "Standardizes product titles, types, and classification tags to boost search engine semantic discoverability.",
  systemInstruction: "You are the Product SEO Agent. You improve product discoverability and metadata quality by proposing title, productType, and tags updates only. You must not write or propose SEO metafields, meta title, meta description, handle/URL, or descriptionHtml.",
  allowedTools: [
    "catalog.insights.health",
    "catalog.products.propose_update",
    "shopify.products.read"
  ],
  requiredScopes: ["read_products"],
  riskLevel: "Low",
  avatarColor: "bg-emerald-600 text-white",
  createdAt: "2026-05-27T12:00:00.000Z",
  updatedAt: "2026-05-27T12:00:00.000Z"
};

export const AGENT_CATALOG_CLEANUP: AgentDefinition = {
  id: "agent_catalog_cleanup",
  name: "Catalog Cleanup Agent",
  description: "Surfaces spelling, casing, vendor, and status inconsistencies to clean messy taxonomy structures.",
  systemInstruction: "You are the Catalog Cleanup Agent. You normalize messy catalog hierarchies, casing, spelling, and archiving status tags. You can propose vendor, productType, status, and tags updates only (no titles). Status changes require high-impact merchant warning flags.",
  allowedTools: [
    "catalog.insights.vendor_summary",
    "catalog.products.propose_update",
    "shopify.products.read"
  ],
  requiredScopes: ["read_products"],
  riskLevel: "Low",
  avatarColor: "bg-violet-600 text-white",
  createdAt: "2026-05-27T12:00:00.000Z",
  updatedAt: "2026-05-27T12:00:00.000Z"
};

export const AGENT_MERCHANDISING_INSIGHTS: AgentDefinition = {
  id: "agent_merchandising_insights",
  name: "Merchandising Insights Agent",
  description: "Provides read-only business summaries, product distributions, and taxonomy structural insights.",
  systemInstruction: "You are the Merchandising Insights Agent. You provide read-only catalog summaries, vendor distributions, and catalog health matrices. You have zero mutation tools and cannot propose updates.",
  allowedTools: [
    "catalog.insights.vendor_summary",
    "shopify.products.read"
  ],
  requiredScopes: ["read_products"],
  riskLevel: "Low",
  avatarColor: "bg-amber-600 text-white",
  createdAt: "2026-05-27T12:00:00.000Z",
  updatedAt: "2026-05-27T12:00:00.000Z"
};

export const AGENT_APPROVAL_OPERATIONS: AgentDefinition = {
  id: "agent_approval_operations",
  name: "Approval Operations Agent",
  description: "Analyzes merchant approval queues, operational telemetry, blocked status diagnostics, and retry recovery steps.",
  systemInstruction: "You are the Approval Operations Agent. You fetch audit logs, merchant approvals, and analytics summaries to help merchants manage workflows, retry failed executions, and understand execution blocks.",
  allowedTools: [
    "shopify.products.read"
  ],
  requiredScopes: [],
  riskLevel: "Low",
  avatarColor: "bg-sky-600 text-white",
  createdAt: "2026-05-27T12:00:00.000Z",
  updatedAt: "2026-05-27T12:00:00.000Z"
};

export function getAgentDefinition(agentId: string): AgentDefinition | undefined {
  switch (agentId) {
    case "agent_product_intelligence":
      return AGENT_PRODUCT_INTELLIGENCE;
    case "agent_catalog_health":
      return AGENT_CATALOG_HEALTH;
    case "agent_product_seo":
      return AGENT_PRODUCT_SEO;
    case "agent_catalog_cleanup":
      return AGENT_CATALOG_CLEANUP;
    case "agent_merchandising_insights":
      return AGENT_MERCHANDISING_INSIGHTS;
    case "agent_approval_operations":
      return AGENT_APPROVAL_OPERATIONS;
    default:
      return undefined;
  }
}
