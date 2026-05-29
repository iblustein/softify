import { Agent } from "../../types.js";
import { writeLog } from "./audit-log.service.js";

// TODO: Integrate with Gemini Managed Agents API (e.g. creating/configuring persistent remote agents)
// TODO: Migrate agentsList, getAgents, getAgentById, and updateAgent to AgentInstallationRepository under src/server/repositories/agent-installation.repository.ts
export let agentsList: Agent[] = [
  // Legacy / Development Agents (Disabled and Hidden from Catalog Display)
  {
    id: "agent_store_setup",
    name: "Store Setup Agent",
    systemInstruction: "You are the Store Setup Agent. You analyze Shopify settings, configure store parameters, read current metadata, and propose product structures or settings updates. You use `shopify.getShopInfo` to align settings.",
    allowedTools: ["shopify.getShopInfo", "catalog.products.propose_update", "shopify.shop.read", "shopify.products.read"],
    requiredScopes: ["read_content", "write_content", "read_products"],
    riskLevel: "Medium",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-blue-600 text-white"
  },
  {
    id: "agent_content",
    name: "Content Agent",
    systemInstruction: "You are the Content Agent. You generate or refine high-converting product descriptions, marketing campaigns, and blog posts. You can view existing products and draft updates with enhanced SEO copy. You use `catalog.products.propose_update` to save descriptions.",
    allowedTools: ["shopify.getProducts", "catalog.products.propose_update", "shopify.products.read"],
    requiredScopes: ["write_products", "read_products"],
    riskLevel: "Low",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-emerald-600 text-white"
  },
  {
    id: "agent_analytics",
    name: "Analytics Agent",
    systemInstruction: "You are the Analytics Agent. You fetch sales, order history, and product metrics to form summaries and predictions. You identify top-selling items, calculate average check, and alert on inventory issues.",
    allowedTools: ["shopify.getOrders", "shopify.getSalesSummary", "shopify.shop.read", "shopify.products.read"],
    requiredScopes: ["read_orders", "read_analytics"],
    riskLevel: "Low",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-violet-600 text-white"
  },
  {
    id: "agent_theme_dev",
    name: "Theme Development Agent",
    systemInstruction: "You are the Theme Development Agent. You inspect active Shopify themes and report on their status.",
    allowedTools: ["shopify.getShopInfo"],
    requiredScopes: ["read_themes", "write_themes"],
    riskLevel: "High",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-indigo-600 text-white"
  },
  {
    id: "agent_design",
    name: "Design Agent",
    systemInstruction: "You are the Design Agent. You optimize visual content, store layout parameters.",
    allowedTools: ["shopify.getShopInfo"],
    requiredScopes: ["read_themes", "write_themes"],
    riskLevel: "High",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-amber-600 text-white"
  },
  {
    id: "agent_customer_support",
    name: "Customer Support Agent",
    systemInstruction: "You are the Customer Support Agent. You check recent orders, customer queries, policy details, and prepare answers or refund drafts. You address tracking requests and store guidelines.",
    allowedTools: ["shopify.getOrders", "shopify.getProducts", "shopify.shop.read"],
    requiredScopes: ["read_orders", "read_customers"],
    riskLevel: "Low",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-sky-600 text-white"
  },
  {
    id: "agent_media_digital",
    name: "Media & Digital Agent",
    systemInstruction: "You are the Media & Digital Agent. You optimize product images, review image SEO tags, organize media folders, and manage file uploads. You prepare metadata corrections for products.",
    allowedTools: ["shopify.getProducts", "catalog.products.propose_update"],
    requiredScopes: ["read_products", "write_products"],
    riskLevel: "Medium",
    enabled: false,
    isLegacy: true,
    avatarColor: "bg-rose-600 text-white"
  },

  // Production-Safe Initial Agent Set
  {
    id: "agent_catalog_health",
    name: "Catalog Health Agent",
    systemInstruction: "You are the Catalog Health Agent. You identify catalog quality issues, missing images, missing vendors, or missing product data. You propose title, vendor, productType, and tags updates only (no status changes).",
    allowedTools: ["catalog.insights.health", "catalog.insights.missing_images", "catalog.products.propose_update", "shopify.products.read"],
    requiredScopes: ["read_products"],
    riskLevel: "Medium",
    enabled: true,
    isLegacy: false,
    purpose: "Identify catalog quality issues and missing product data.",
    allowedFields: ["title", "vendor", "productType", "tags"],
    avatarColor: "bg-blue-600 text-white"
  },
  {
    id: "agent_product_seo",
    name: "Product SEO Agent",
    systemInstruction: "You are the Product SEO Agent. You improve product discoverability and metadata quality by proposing title, productType, and tags updates only. You must not write or propose SEO metafields, meta title, meta description, handle/URL, or descriptionHtml.",
    allowedTools: ["catalog.insights.health", "catalog.products.propose_update", "shopify.products.read"],
    requiredScopes: ["read_products"],
    riskLevel: "Low",
    enabled: true,
    isLegacy: false,
    purpose: "Improve product discoverability and metadata quality.",
    allowedFields: ["title", "productType", "tags"],
    avatarColor: "bg-emerald-600 text-white"
  },
  {
    id: "agent_catalog_cleanup",
    name: "Catalog Cleanup Agent",
    systemInstruction: "You are the Catalog Cleanup Agent. You normalize messy catalog hierarchies, casing, spelling, and archiving status tags. You can propose vendor, productType, status, and tags updates only (no titles). Status changes require high-impact merchant warning flags.",
    allowedTools: ["catalog.insights.vendor_summary", "catalog.products.propose_update", "shopify.products.read"],
    requiredScopes: ["read_products"],
    riskLevel: "Low",
    enabled: true,
    isLegacy: false,
    purpose: "Normalize catalog structure and reduce messy taxonomy.",
    allowedFields: ["vendor", "productType", "status", "tags"],
    avatarColor: "bg-violet-600 text-white"
  },
  {
    id: "agent_merchandising_insights",
    name: "Merchandising Insights Agent",
    systemInstruction: "You are the Merchandising Insights Agent. You provide read-only catalog summaries, vendor distributions, and catalog health matrices. You have zero mutation tools and cannot propose updates.",
    allowedTools: ["catalog.insights.vendor_summary", "shopify.products.read"],
    requiredScopes: ["read_products"],
    riskLevel: "Low",
    enabled: true,
    isLegacy: false,
    purpose: "Provide read-only business and catalog insights.",
    allowedFields: [],
    avatarColor: "bg-amber-600 text-white"
  },
  {
    id: "agent_approval_operations",
    name: "Approval Operations Agent",
    systemInstruction: "You are the Approval Operations Agent. You fetch audit logs, merchant approvals, and analytics summaries to help merchants manage workflows, retry failed executions, and understand execution blocks.",
    allowedTools: ["shopify.products.read"],
    requiredScopes: [],
    riskLevel: "Low",
    enabled: true,
    isLegacy: false,
    purpose: "Help merchants understand approval queues, execution blocks, and retry steps.",
    allowedFields: [],
    avatarColor: "bg-sky-600 text-white"
  },
  {
    id: "theme_editor_ai_agent",
    name: "Theme Editor AI Agent",
    systemInstruction: "You are the Theme Editor AI Agent. You are a world-class Shopify expert, Liquid expert, and JavaScript expert. You are highly familiar with Shopify theme structures, templates, assets, sections, snippets, and config settings. You analyze theme files and propose precise code edit plans to improve, optimize, or customize the merchant's store theme using only safe backend tools.",
    allowedTools: [
      "shopify.theme.themes",
      "shopify.theme.assets",
      "shopify.theme.assets.read",
      "shopify.theme.assets.write"
    ],
    requiredScopes: ["read_themes", "write_themes"],
    riskLevel: "High",
    enabled: true,
    isLegacy: false,
    purpose: "Help a Shopify merchant edit and improve their store theme.",
    allowedFields: [],
    avatarColor: "bg-indigo-600 text-white"
  }
];

export function getAgents(): Agent[] {
  return agentsList;
}

export function getAgentById(id: string): Agent | undefined {
  return agentsList.find(a => a.id === id);
}

export function updateAgent(
  id: string, 
  updates: { enabled?: boolean; systemInstruction?: string; allowedTools?: string[] }
): Agent {
  const agentIdx = agentsList.findIndex(a => a.id === id);
  if (agentIdx === -1) {
    throw new Error("Agent not found");
  }

  const old = agentsList[agentIdx];
  const updated = {
    ...old,
    enabled: updates.enabled !== undefined ? updates.enabled : old.enabled,
    systemInstruction: updates.systemInstruction !== undefined ? updates.systemInstruction : old.systemInstruction,
    allowedTools: updates.allowedTools !== undefined ? updates.allowedTools : old.allowedTools
  };

  agentsList[agentIdx] = updated;

  const changes = [];
  if (old.enabled !== updated.enabled) changes.push(`Status: ${updated.enabled ? 'Enabled' : 'Disabled'}`);
  if (old.systemInstruction !== updated.systemInstruction) changes.push(`System Instruction Revised`);
  if (JSON.stringify(old.allowedTools) !== JSON.stringify(updated.allowedTools)) changes.push(`Allowed Tools Adjusted`);

  writeLog(
    "Shop Owner",
    "AGENT_MODIFIED",
    `Modified configs for '${updated.name}': ${changes.join(', ')}`,
    { agentId: id, details: updates }
  );

  return updated;
}

export function setAgents(newAgents: Agent[]): void {
  agentsList = newAgents;
}
