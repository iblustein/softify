import {
  User,
  Organization,
  ShopifyStoreConnection,
  AgentDefinition,
  AgentInstallation,
  ToolDefinition
} from "../domain/types.js";

// TODO: In production, the platform context will be dynamically resolved based on:
// - The currently authenticated session user (via JWT / OAuth session cookie)
// - The active selected tenant Organization (organizationId)
// - Encrypted OAuth connection settings to retrieve active Shopify store tokens
// - Organization role policies (RBAC/ABAC) to verify agent permissions
// - Tenant billing subscription plans to restrict allowed agents or tool invocation throughput

export interface PlatformContext {
  currentUser: User;
  currentOrganization: Organization;
  storeConnection: ShopifyStoreConnection;
  agentDefinitions: AgentDefinition[];
  agentInstallations: AgentInstallation[];
  enabledTools: ToolDefinition[];
}

export function getDemoPlatformContext(): PlatformContext {
  const currentUser: User = {
    id: "usr_demo",
    email: "demo@softify.ai",
    name: "Demo Store Owner",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };

  const currentOrganization: Organization = {
    id: "org_demo",
    name: "Demo Enterprise Organization",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z"
  };

  const storeConnection: ShopifyStoreConnection = {
    id: "conn_demo",
    organizationId: "org_demo",
    storeUrl: "luminary-essentials.myshopify.com",
    scopes: [
      "read_products",
      "write_products",
      "read_orders",
      "read_customers",
      "write_themes",
      "read_analytics"
    ],
    connectedAt: "2026-05-18T12:00:00.000Z",
    status: "CONNECTED",
    plan: "Standard Plan",
    currency: "USD",
    createdAt: "2026-05-18T12:00:00.000Z",
    updatedAt: "2026-05-18T12:00:00.000Z"
  };

  // Demo agent definitions
  const agentDefinitions: AgentDefinition[] = [
    {
      id: "agent_store_setup",
      name: "Store Setup Agent",
      description: "Analyzes Shopify settings, configures store parameters, reads current metadata.",
      systemInstruction: "You are the Store Setup Agent. You analyze Shopify settings, configure store parameters, read current metadata, and prepare initial product structures or settings updates.",
      allowedTools: ["shopify.getShopInfo", "shopify.prepareProductUpdate", "shopify.shop.read"],
      requiredScopes: ["read_content", "write_content", "read_products"],
      riskLevel: "Medium",
      avatarColor: "bg-blue-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    },
    {
      id: "agent_content",
      name: "Content Agent",
      description: "Generates or refines high-converting product descriptions, marketing campaigns, and blog posts.",
      systemInstruction: "You are the Content Agent. You generate or refine high-converting product descriptions, marketing campaigns, and blog posts.",
      allowedTools: ["shopify.getProducts", "shopify.prepareProductUpdate"],
      requiredScopes: ["write_products", "read_products"],
      riskLevel: "Low",
      avatarColor: "bg-emerald-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    },
    {
      id: "agent_analytics",
      name: "Analytics Agent",
      description: "Fetches sales, order history, and product metrics to form summaries and predictions.",
      systemInstruction: "You are the Analytics Agent. You fetch sales, order history, and product metrics to form summaries and predictions.",
      allowedTools: ["shopify.getOrders", "shopify.getSalesSummary", "shopify.shop.read"],
      requiredScopes: ["read_orders", "read_analytics"],
      riskLevel: "Low",
      avatarColor: "bg-violet-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    },
    {
      id: "agent_theme_dev",
      name: "Theme Development Agent",
      description: "Inspects active Shopify themes and prepares theme patches or asset edits.",
      systemInstruction: "You are the Theme Development Agent. You inspect active Shopify themes and prepare theme patches or asset edits.",
      allowedTools: ["shopify.getShopInfo", "shopify.prepareThemePatch"],
      requiredScopes: ["read_themes", "write_themes"],
      riskLevel: "High",
      avatarColor: "bg-indigo-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    },
    {
      id: "agent_design",
      name: "Design Agent",
      description: "Optimizes visual content, store layout parameters, CSS modifications, and theme code updates.",
      systemInstruction: "You are the Design Agent. You optimize visual content, store layout parameters, CSS modifications, and theme code updates.",
      allowedTools: ["shopify.getShopInfo", "shopify.prepareThemePatch"],
      requiredScopes: ["read_themes", "write_themes"],
      riskLevel: "High",
      avatarColor: "bg-amber-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    },
    {
      id: "agent_customer_support",
      name: "Customer Support Agent",
      description: "Checks recent orders, customer queries, policy details, and prepares answers or refund drafts.",
      systemInstruction: "You are the Customer Support Agent. You check recent orders, customer queries, policy details, and prepare answers or refund drafts.",
      allowedTools: ["shopify.getOrders", "shopify.getProducts", "shopify.shop.read"],
      requiredScopes: ["read_orders", "read_customers"],
      riskLevel: "Low",
      avatarColor: "bg-sky-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    },
    {
      id: "agent_media_digital",
      name: "Media & Digital Agent",
      description: "Optimizes product images, reviews image SEO tags, organizes media folders, and manages file uploads.",
      systemInstruction: "You are the Media & Digital Agent. You optimize product images, review image SEO tags, organize media folders, and manage file uploads.",
      allowedTools: ["shopify.getProducts", "shopify.prepareProductUpdate"],
      requiredScopes: ["read_products", "write_products"],
      riskLevel: "Medium",
      avatarColor: "bg-rose-600 text-white",
      createdAt: "2026-05-18T12:00:00.000Z",
      updatedAt: "2026-05-18T12:00:00.000Z"
    }
  ];

  // Currently installed agents map agentDefinitions to this store / organization
  const agentInstallations: AgentInstallation[] = agentDefinitions.map(def => ({
    id: `inst_${def.id}`,
    organizationId: "org_demo",
    storeConnectionId: "conn_demo",
    agentDefinitionId: def.id,
    enabled: true,
    createdAt: "2026-05-18T12:05:00.000Z",
    updatedAt: "2026-05-18T12:05:00.000Z"
  }));

  // Tools currently enabled on the platform Gateway
  const enabledTools: ToolDefinition[] = [
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
    }
  ];

  return {
    currentUser,
    currentOrganization,
    storeConnection,
    agentDefinitions,
    agentInstallations,
    enabledTools
  };
}
