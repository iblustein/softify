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
    "catalog.products.update"
  ],
  requiredScopes: ["read_products"],
  riskLevel: "Low",
  avatarColor: "bg-teal-600 text-white",
  createdAt: "2026-05-23T12:00:00.000Z",
  updatedAt: "2026-05-23T12:00:00.000Z"
};

export function getAgentDefinition(agentId: string): AgentDefinition | undefined {
  if (agentId === AGENT_PRODUCT_INTELLIGENCE.id) {
    return AGENT_PRODUCT_INTELLIGENCE;
  }
  return undefined;
}
