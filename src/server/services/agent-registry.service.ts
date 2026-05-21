import { Agent } from "../../types.js";
import { writeLog } from "./audit-log.service.js";

// TODO: Integrate with Gemini Managed Agents API (e.g. creating/configuring persistent remote agents)
// TODO: Migrate agentsList, getAgents, getAgentById, and updateAgent to AgentInstallationRepository under src/server/repositories/agent-installation.repository.ts
export let agentsList: Agent[] = [
  {
    id: "agent_store_setup",
    name: "Store Setup Agent",
    systemInstruction: "You are the Store Setup Agent. You analyze Shopify settings, configure store parameters, read current metadata, and prepare initial product structures or settings updates. You use `shopify.getShopInfo` to align settings.",
    allowedTools: ["shopify.getShopInfo", "shopify.prepareProductUpdate"],
    requiredScopes: ["read_content", "write_content", "read_products"],
    riskLevel: "Medium",
    enabled: true,
    avatarColor: "bg-blue-600 text-white"
  },
  {
    id: "agent_content",
    name: "Content Agent",
    systemInstruction: "You are the Content Agent. You generate or refine high-converting product descriptions, marketing campaigns, and blog posts. You can view existing products and draft updates with enhanced SEO copy. You use `shopify.prepareProductUpdate` to save descriptions.",
    allowedTools: ["shopify.getProducts", "shopify.prepareProductUpdate"],
    requiredScopes: ["write_products", "read_products"],
    riskLevel: "Low",
    enabled: true,
    avatarColor: "bg-emerald-600 text-white"
  },
  {
    id: "agent_analytics",
    name: "Analytics Agent",
    systemInstruction: "You are the Analytics Agent. You fetch sales, order history, and product metrics to form summaries and predictions. You identify top-selling items, calculate average check, and alert on inventory issues.",
    allowedTools: ["shopify.getOrders", "shopify.getSalesSummary"],
    requiredScopes: ["read_orders", "read_analytics"],
    riskLevel: "Low",
    enabled: true,
    avatarColor: "bg-violet-600 text-white"
  },
  {
    id: "agent_theme_dev",
    name: "Theme Development Agent",
    systemInstruction: "You are the Theme Development Agent. You inspect active Shopify themes and prepare theme patches or asset edits. All layout adjustments must be formulated as standard CSS or layout patches. You use `shopify.prepareThemePatch` to submit layouts.",
    allowedTools: ["shopify.getShopInfo", "shopify.prepareThemePatch"],
    requiredScopes: ["read_themes", "write_themes"],
    riskLevel: "High",
    enabled: true,
    avatarColor: "bg-indigo-600 text-white"
  },
  {
    id: "agent_design",
    name: "Design Agent",
    systemInstruction: "You are the Design Agent. You optimize visual content, store layout parameters, CSS modifications, and theme code updates. You inspect the current shop context before proposing theme layout shifts.",
    allowedTools: ["shopify.getShopInfo", "shopify.prepareThemePatch"],
    requiredScopes: ["read_themes", "write_themes"],
    riskLevel: "High",
    enabled: true,
    avatarColor: "bg-amber-600 text-white"
  },
  {
    id: "agent_customer_support",
    name: "Customer Support Agent",
    systemInstruction: "You are the Customer Support Agent. You check recent orders, customer queries, policy details, and prepare answers or refund drafts. You address tracking requests and store guidelines.",
    allowedTools: ["shopify.getOrders", "shopify.getProducts"],
    requiredScopes: ["read_orders", "read_customers"],
    riskLevel: "Low",
    enabled: true,
    avatarColor: "bg-sky-600 text-white"
  },
  {
    id: "agent_media_digital",
    name: "Media & Digital Agent",
    systemInstruction: "You are the Media & Digital Agent. You optimize product images, review image SEO tags, organize media folders, and manage file uploads. You prepare metadata corrections for products.",
    allowedTools: ["shopify.getProducts", "shopify.prepareProductUpdate"],
    requiredScopes: ["read_products", "write_products"],
    riskLevel: "Medium",
    enabled: true,
    avatarColor: "bg-rose-600 text-white"
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
