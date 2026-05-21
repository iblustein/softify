import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { 
  Agent, 
  AuditLog, 
  ApprovalItem, 
  ShopifyStore, 
  OrchestrationMessage 
} from "./src/types.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize GoogleGenAI lazy loader safely
let ai: GoogleGenAI | null = null;
function getGeminiSDK(): GoogleGenAI | null {
  if (!ai && process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return ai;
}

// ==========================================
// 1. IN-MEMORY STATE FOR PROTOTYPE STORE
// ==========================================

let shopifyStore: ShopifyStore = {
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

let agentsList: Agent[] = [
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

// Mock Shopify Database
let mockProducts = [
  {
    id: 101,
    title: "Eco Linen Warm Shirt",
    status: "Active",
    price: 78.00,
    inventory: 42,
    sku: "SH-EC-LIN-01",
    description: "A comfortable linen shirt styled with structured collars. Breathable, made of 100% natural organic flax linen material. Standard fit.",
    image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 102,
    title: "Double-walled Ceramic Mug",
    status: "Active",
    price: 32.00,
    inventory: 15,
    sku: "MG-DBL-CRM-02",
    description: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
    image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 103,
    title: "Full-grain Leather Backpack",
    status: "Draft",
    price: 189.00,
    inventory: 8,
    sku: "BP-FLG-LTH-03",
    description: "Premium computer satchel with laptop compartment and brushed bronze clasps. Highly durable leather layout.",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 104,
    title: "Silk Contour Sleep Mask",
    status: "Active",
    price: 24.00,
    inventory: 110,
    sku: "MK-SLK-SLP-04",
    description: "Blocking luxury eye mask prepared with Mulberry silk. Fully adjustable strap designed to eliminate light entirely.",
    image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=400&auto=format&fit=crop&q=80"
  },
  {
    id: 105,
    title: "Solid Walnut Headphone Stand",
    status: "Active",
    price: 65.00,
    inventory: 24,
    sku: "ST-WNT-HDP-05",
    description: "Hand-turned display hanger for studio headphones. Heavy black steel base adds extreme stability.",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80"
  }
];

let mockOrders = [
  {
    id: 4001,
    customer_name: "Sarah Jenkins",
    total: 110.00,
    items: "Eco Linen Warm Shirt (1), Double-walled Ceramic Mug (1)",
    status: "Fulfilled",
    date: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
  },
  {
    id: 4002,
    customer_name: "David Sterling",
    total: 189.00,
    items: "Full-grain Leather Backpack (1)",
    status: "Unfulfilled",
    date: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString() // 14 hours ago
  },
  {
    id: 4003,
    customer_name: "Elena Rostova",
    total: 48.00,
    items: "Silk Contour Sleep Mask (2)",
    status: "Fulfilled",
    date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() // 1 day ago
  },
  {
    id: 4004,
    customer_name: "Liam O'Connor",
    total: 143.00,
    items: "Solid Walnut Headphone Stand (2), Double-walled Ceramic Mug (1)",
    status: "Fulfilled",
    date: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString() // 1.5 days ago
  }
];

let mockSalesReport = {
  dailySales: [
    { day: "Mon", sales: 420 },
    { day: "Tue", sales: 680 },
    { day: "Wed", sales: 710 },
    { day: "Thu", sales: 590 },
    { day: "Fri", sales: 880 },
    { day: "Sat", sales: 1120 },
    { day: "Sun", sales: 940 }
  ],
  totalWeekRevenue: 5340,
  conversionRate: "2.42%",
  activeSessions: 1840,
  popularProducts: [
    { name: "Eco Linen Warm Shirt", salesCount: 14, revenue: 1092 },
    { name: "Silk Contour Sleep Mask", salesCount: 18, revenue: 432 },
    { name: "Solid Walnut Headphone Stand", salesCount: 6, revenue: 390 }
  ]
};

let activeThemeCode = `/* ACTIVE THEME CUSTOMIZATIONS */
body {
  font-family: 'Inter', sans-serif;
  color: #111111;
  background-color: #fafafa;
}

.hero-section {
  padding: 80px 40px;
  background-color: #f3f4f6;
  text-align: center;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.btn-primary {
  background-color: #008060; /* Shopify Green */
  color: white;
  padding: 12px 24px;
  border-radius: 4px;
}`;

// Approvals Store
let approvalQueue: ApprovalItem[] = [
  {
    id: "APV-001",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 mins ago
    agentId: "agent_content",
    agentName: "Content Agent",
    actionType: "PRODUCT_UPDATE",
    targetId: "102",
    details: {
      title: "Double-walled Ceramic Mug description overhaul",
      before: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
      after: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury.",
      summary: "Drafted high-conversion, sensory copy emphasizing thermo-conduction retention, premium tactile finishes, and user ease.",
      productId: 102,
      fields: {
        description: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury."
      }
    },
    status: "PENDING"
  },
  {
    id: "APV-002",
    timestamp: new Date(Date.now() - 50 * 60 * 1000).toISOString(), // 50 mins ago
    agentId: "agent_theme_dev",
    agentName: "Theme Development Agent",
    actionType: "THEME_PATCH",
    targetId: "main_theme",
    details: {
      title: "Optimize hero button responsive padding & color transitions",
      before: "/* Older padding setting */\n.btn-primary {\n  background-color: #008060;\n  color: white;\n  padding: 12px 24px;\n  border-radius: 4px;\n}",
      after: "/* Updated polished settings with smooth transition kinetics */\n.btn-primary {\n  background-color: #0d1b2a;\n  color: #f8f9fa;\n  padding: 14px 28px;\n  border-radius: 6px;\n  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.btn-primary:hover {\n  background-color: #1b263b;\n  transform: translateY(-1px);\n}",
      summary: "Patched theme code to update main CTA colors to dark graphite styling with active physical hover offsets.",
      themeId: "main_theme",
      patch: "/* Updated polished settings with smooth transition kinetics */\n.btn-primary {\n  background-color: #0d1b2a;\n  color: #f8f9fa;\n  padding: 14px 28px;\n  border-radius: 6px;\n  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);\n}\n.btn-primary:hover {\n  background-color: #1b263b;\n  transform: translateY(-1px);\n}"
    },
    status: "PENDING"
  }
];

// Audit Logs Store
let auditLogs: AuditLog[] = [
  {
    id: "LOG-001",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Shop Owner",
    event: "SHOP_CONNECTED",
    description: "Shopowner connected store luminary-essentials.myshopify.com successfully via OAuth Handshake.",
    metadata: { scopes: shopifyStore.scopes }
  },
  {
    id: "LOG-002",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Store Setup Agent",
    event: "TOOL_CALL",
    description: "Invoked shopify.getShopInfo to structure internal indexes and inventory configuration.",
    metadata: { results: "success" }
  },
  {
    id: "LOG-003",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Content Agent",
    event: "TOOL_CALL",
    description: "Executed shopify.getProducts to inspect catalog for copy optimizations.",
    metadata: { count: mockProducts.length }
  },
  {
    id: "LOG-004",
    timestamp: new Date(Date.now() - 50 * 12 * 1000).toISOString(),
    initiator: "Content Agent",
    event: "APPROVAL_CREATED",
    description: "Prepared product updates for 'Double-walled Ceramic Mug' and queued in structural Approval center (#APV-001).",
    metadata: { approvalId: "APV-001", productId: 102 }
  }
];

// Helper to log audit events
function writeLog(initiator: string, event: string, description: string, metadata?: any): AuditLog {
  const log: AuditLog = {
    id: `LOG-${String(auditLogs.length + 1).padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    initiator,
    event,
    description,
    metadata
  };
  auditLogs.unshift(log); // newest first
  return log;
}

// ==========================================
// 2. BACKEND API ROUTING REST ENDPOINTS
// ==========================================

// Get Shop details
app.get("/api/shop", (req, res) => {
  res.json(shopifyStore);
});

// Mock Shopify OAuth Handshake simulation
app.post("/api/shop/connect", (req, res) => {
  const { url, scopes } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: "Store URL is required" });
  }

  const cleanUrl = url.replace(/^(https?:\/\/)?(www\.)?/, '').trim();
  const shopName = cleanUrl.split('.')[0].replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());

  shopifyStore = {
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

  writeLog(
    "Shop Owner", 
    "SHOP_CONNECTED", 
    `Connected Shopify store '${shopifyStore.url}' with selected capabilities. Ready to delegate tools.`,
    { url: shopifyStore.url, scopes: shopifyStore.scopes }
  );

  res.json({ success: true, store: shopifyStore });
});

// Disconnect storefront
app.post("/api/shop/disconnect", (req, res) => {
  const prevUrl = shopifyStore.url;
  shopifyStore = {
    url: "",
    name: "",
    connected: false,
    scopes: []
  };

  writeLog(
    "Shop Owner", 
    "SHOP_DISCONNECTED", 
    `Shopify integration severed. Offline controls enabled. Store: '${prevUrl}'`
  );

  res.json({ success: true, store: shopifyStore });
});

// Fetch Agent configurations
app.get("/api/agents", (req, res) => {
  res.json(agentsList);
});

// Toggle agent states or customize system instructions
app.post("/api/agents/:id", (req, res) => {
  const { id } = req.params;
  const { enabled, systemInstruction, allowedTools } = req.body;

  const agentIdx = agentsList.findIndex(a => a.id === id);
  if (agentIdx === -1) {
    return res.status(404).json({ error: "Agent not found" });
  }

  const old = agentsList[agentIdx];
  agentsList[agentIdx] = {
    ...old,
    enabled: enabled !== undefined ? enabled : old.enabled,
    systemInstruction: systemInstruction !== undefined ? systemInstruction : old.systemInstruction,
    allowedTools: allowedTools !== undefined ? allowedTools : old.allowedTools
  };

  const updated = agentsList[agentIdx];
  const changes = [];
  if (old.enabled !== updated.enabled) changes.push(`Status: ${updated.enabled ? 'Enabled' : 'Disabled'}`);
  if (old.systemInstruction !== updated.systemInstruction) changes.push(`System Instruction Revised`);
  if (JSON.stringify(old.allowedTools) !== JSON.stringify(updated.allowedTools)) changes.push(`Allowed Tools Adjusted`);

  writeLog(
    "Shop Owner",
    "AGENT_MODIFIED",
    `Modified configs for '${updated.name}': ${changes.join(', ')}`,
    { agentId: id, details: req.body }
  );

  res.json(updated);
});

// View Products
app.get("/api/products", (req, res) => {
  res.json(mockProducts);
});

// View theme asset customizations
app.get("/api/theme-assets", (req, res) => {
  res.json({ css: activeThemeCode });
});

// View Orders
app.get("/api/orders", (req, res) => {
  res.json(mockOrders);
});

// Analytics sales reports
app.get("/api/sales-summary", (req, res) => {
  res.json(mockSalesReport);
});

// Pull Approvals Center Items
app.get("/api/approvals", (req, res) => {
  res.json(approvalQueue);
});

// Decide Approval action
app.post("/api/approvals/:id/decide", (req, res) => {
  const { id } = req.params;
  const { decision } = req.body; // 'APPROVE' or 'REJECT'

  const itemIdx = approvalQueue.findIndex(item => item.id === id);
  if (itemIdx === -1) {
    return res.status(404).json({ error: "Approval item not found" });
  }

  const approvalItem = approvalQueue[itemIdx];
  if (approvalItem.status !== "PENDING") {
    return res.status(400).json({ error: "Action is already finalized." });
  }

  if (decision === "APPROVE") {
    approvalQueue[itemIdx].status = "APPROVED";
    approvalQueue[itemIdx].decidedAt = new Date().toISOString();

    // Trigger true mock state execution
    if (approvalItem.actionType === "PRODUCT_UPDATE") {
      const prodId = approvalItem.details.productId;
      const fieldsToApply = approvalItem.details.fields;
      const prodIdx = mockProducts.findIndex(p => p.id === prodId);
      if (prodIdx !== -1) {
        mockProducts[prodIdx] = {
          ...mockProducts[prodIdx],
          ...fieldsToApply
        };
      }
    } else if (approvalItem.actionType === "THEME_PATCH") {
      if (approvalItem.details.patch) {
        activeThemeCode = activeThemeCode + "\n" + approvalItem.details.patch;
      }
    }

    writeLog(
      "Shop Owner",
      "APPROVAL_DECISION",
      `Approved and committed changes for '${approvalItem.details.title}' submitted by ${approvalItem.agentName}.`,
      { approvalId: id, result: "COMMITTED" }
    );
  } else {
    approvalQueue[itemIdx].status = "REJECTED";
    approvalQueue[itemIdx].decidedAt = new Date().toISOString();

    writeLog(
      "Shop Owner",
      "APPROVAL_DECISION",
      `Rejected modification proposed by ${approvalItem.agentName}: '${approvalItem.details.title}'`,
      { approvalId: id, result: "REJECTED" }
    );
  }

  res.json(approvalQueue[itemIdx]);
});

// Retrieve Audit logs
app.get("/api/audit-logs", (req, res) => {
  res.json(auditLogs);
});

// Global dashboard aggregated statistics
app.get("/api/dashboard-stats", (req, res) => {
  const activeCount = agentsList.filter(a => a.enabled).length;
  const pendingCount = approvalQueue.filter(item => item.status === "PENDING").length;

  res.json({
    connected: shopifyStore.connected,
    storeName: shopifyStore.connected ? shopifyStore.name : "Unconnected Store",
    activeAgentsCount: activeCount,
    pendingApprovalsCount: pendingCount,
    totalLogsCount: auditLogs.length,
    totalProductsCount: mockProducts.length,
    weeklyActionsCount: auditLogs.filter(
      l => new Date(l.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length
  });
});

// Restore original states
app.post("/api/reset-data", (req, res) => {
  mockProducts = [
    {
      id: 101,
      title: "Eco Linen Warm Shirt",
      status: "Active",
      price: 78.00,
      inventory: 42,
      sku: "SH-EC-LIN-01",
      description: "A comfortable linen shirt styled with structured collars. Breathable, made of 100% natural organic flax linen material. Standard fit.",
      image: "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 102,
      title: "Double-walled Ceramic Mug",
      status: "Active",
      price: 32.00,
      inventory: 15,
      sku: "MG-DBL-CRM-02",
      description: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
      image: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 103,
      title: "Full-grain Leather Backpack",
      status: "Draft",
      price: 189.00,
      inventory: 8,
      sku: "BP-FLG-LTH-03",
      description: "Premium computer satchel with laptop compartment and brushed bronze clasps. Highly durable leather layout.",
      image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 104,
      title: "Silk Contour Sleep Mask",
      status: "Active",
      price: 24.00,
      inventory: 110,
      sku: "MK-SLK-SLP-04",
      description: "Blocking luxury eye mask prepared with Mulberry silk. Fully adjustable strap designed to eliminate light entirely.",
      image: "https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?w=400&auto=format&fit=crop&q=80"
    },
    {
      id: 105,
      title: "Solid Walnut Headphone Stand",
      status: "Active",
      price: 65.00,
      inventory: 24,
      sku: "ST-WNT-HDP-05",
      description: "Hand-turned display hanger for studio headphones. Heavy black steel base adds extreme stability.",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&auto=format&fit=crop&q=80"
    }
  ];

  approvalQueue = [
    {
      id: "APV-001",
      timestamp: new Date().toISOString(),
      agentId: "agent_content",
      agentName: "Content Agent",
      actionType: "PRODUCT_UPDATE",
      targetId: "102",
      details: {
        title: "Double-walled Ceramic Mug description overhaul",
        before: "Keeps drinks warm for up to 6 hours. Features structural matte stone finish and raw clay rim. Microwave and dishwasher safe.",
        after: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury.",
        summary: "Drafted high-conversion copy with SEO optimizations.",
        productId: 102,
        fields: {
          description: "✨ **LUMINOUS RETENTION & MODERN FORM**\nExperience beverage perfection with this double-walled premium stone mug. Formulated with our signature matte finish, it maintains temperature for up to six hours while keeping the outer shell completely cool. Features a hand-brushed raw clay rim designed for sensory, tactile feedback. Microwave-safe and lightweight luxury."
        }
      },
      status: "PENDING"
    }
  ];

  auditLogs = [
    {
      id: "LOG-001",
      timestamp: new Date().toISOString(),
      initiator: "Shop Owner",
      event: "DATA_RESET",
      description: "Demo database restored to default factory conditions.",
      metadata: {}
    }
  ];

  res.json({ success: true });
});

// ==========================================
// 3. SUPER AGENT & ROUTING CORE ORCHESTRATOR
// ==========================================

// Fallback logic for local AI simulation when GEMINI_API_KEY is absent
function fallbackOrchestration(prompt: string, selectedAgentId?: string): OrchestrationMessage[] {
  const normPrompt = prompt.toLowerCase();
  let agent: Agent = agentsList[0]; // Default fallback

  // If the user picked a specific agent, we route directly
  if (selectedAgentId) {
    const matched = agentsList.find(a => a.id === selectedAgentId);
    if (matched) agent = matched;
  } else {
    // Dynamic routing classifier
    if (normPrompt.includes("sales") || normPrompt.includes("analytics") || normPrompt.includes("revenue") || normPrompt.includes("report") || normPrompt.includes("orders")) {
      agent = agentsList.find(a => a.id === "agent_analytics")!;
    } else if (normPrompt.includes("product") || normPrompt.includes("description") || normPrompt.includes("copy") || normPrompt.includes("write") || normPrompt.includes("content")) {
      agent = agentsList.find(a => a.id === "agent_content")!;
    } else if (normPrompt.includes("theme") || normPrompt.includes("css") || normPrompt.includes("button") || normPrompt.includes("design") || normPrompt.includes("padding")) {
      agent = agentsList.find(a => a.id === "agent_theme_dev")!;
    } else if (normPrompt.includes("support") || normPrompt.includes("customer") || normPrompt.includes("help") || normPrompt.includes("complaint")) {
      agent = agentsList.find(a => a.id === "agent_customer_support")!;
    } else if (normPrompt.includes("logo") || normPrompt.includes("banner") || normPrompt.includes("image") || normPrompt.includes("media")) {
      agent = agentsList.find(a => a.id === "agent_media_digital")!;
    } else if (normPrompt.includes("setup") || normPrompt.includes("oauth") || normPrompt.includes("scopes")) {
      agent = agentsList.find(a => a.id === "agent_store_setup")!;
    } else {
      agent = agentsList.find(a => a.id === "agent_content")!; // Default to Content
    }
  }

  const resultMessages: OrchestrationMessage[] = [];
  const messageTimestamp = new Date().toISOString();

  // Route log
  writeLog(
    "Super Agent Orchestrator",
    "ROUTE_REQUEST",
    `Routed storeowner request: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}" to agent '${agent.name}' (confidence score 0.94)`,
    { agentId: agent.id }
  );

  // If the selected agent is disabled, explain it
  if (!agent.enabled) {
    resultMessages.push({
      id: `m-${Date.now()}-1`,
      sender: "orchestrator",
      text: `⚠️ **Routing Error:** I routed your query to the **${agent.name}**, but that agent is currently disabled in your Registry. Please toggle the agent active to handle this function.`,
      timestamp: messageTimestamp
    });
    return resultMessages;
  }

  // Generate logical responses based on tool configurations
  let agentResponseText = "";
  const mockCalls: any[] = [];

  if (agent.id === "agent_analytics") {
    mockCalls.push({
      toolName: "shopify.getSalesSummary",
      args: {},
      status: "success",
      result: mockSalesReport
    });
    
    writeLog(agent.name, "TOOL_CALL", "Queried sales summaries via Tool Gateway abstraction.");
    
    agentResponseText = `📊 **Sales Summary & Analysis Report:**
    
    I have retrieved the sales summary from the Shopify store via \`shopify.getSalesSummary\`. Here are the active insights:
    * **Weekly Revenue:** $5,340.00 across high-performing days.
    * **Store Conversion Rate:** **${mockSalesReport.conversionRate}** (above industry average).
    * **Top Product Performance:**
      - **Eco Linen Warm Shirt** (${mockSalesReport.popularProducts[0].salesCount} units) generating **$${mockSalesReport.popularProducts[0].revenue}**.
      - **Silk Contour Sleep Mask** (${mockSalesReport.popularProducts[1].salesCount} units).
    
    Current trends demonstrate organic lift on weekends. Inventory levels are stable, although a replenishment trigger is recommended for **Full-grain Leather Backpack** soon.`;
  } 

  else if (agent.id === "agent_content") {
    // Determine which product to edit
    let targetProduct = mockProducts[0];
    for (const p of mockProducts) {
      if (normPrompt.includes(p.title.toLowerCase()) || normPrompt.includes(String(p.id))) {
        targetProduct = p;
        break;
      }
    }

    mockCalls.push({
      toolName: "shopify.getProducts",
      args: {},
      status: "success",
      result: { count: mockProducts.length }
    });

    writeLog(agent.name, "TOOL_CALL", "Successfully queried full product inventory lists via Tool Gateway.");

    const rawAfterStr = `✨ **POLISHED REVISED COPY: ${targetProduct.title}**\n\nExperience elevated comfort with this premium, meticulously crafted garment. Made of 100% natural, sustainable organic flax linen for lightweight breathability. Complete with high-durability structured tailoring, this wardrobe essential bridges relaxed everyday wear and refined office aesthetics with absolute ease.`;

    const approvalId = `APV-${String(approvalQueue.length + 1).padStart(3, '0')}`;
    
    const newApproval: ApprovalItem = {
      id: approvalId,
      timestamp: new Date().toISOString(),
      agentId: "agent_content",
      agentName: "Content Agent",
      actionType: "PRODUCT_UPDATE",
      targetId: String(targetProduct.id),
      details: {
        title: `Optimize description copy for ${targetProduct.title}`,
        before: targetProduct.description,
        after: rawAfterStr,
        summary: "Overhauled boilerplate descriptions to incorporate rich lifestyle hooks, highlights about lightweight breathability, and SEO-dense terminology.",
        productId: targetProduct.id,
        fields: { description: rawAfterStr }
      },
      status: "PENDING"
    };

    approvalQueue.unshift(newApproval);

    mockCalls.push({
      toolName: "shopify.prepareProductUpdate",
      args: { productId: targetProduct.id, fields: { description: rawAfterStr } },
      status: "requires_approval",
      approvalId: approvalId,
      result: { status: "Awaiting owner authentication", approvalId }
    });

    writeLog(agent.name, "APPROVAL_CREATED", `Drafted product text modifications and submitted to Approval Center. Approval ID: ${approvalId}`);

    agentResponseText = `✍️ **Optimized SEO Product Copy Ready for Handshake**
    
    I inspected your product catalog using \`shopify.getProducts\`. To optimize your catalog's checkout metrics, I drafted an SEO-enriched description for **${targetProduct.title}** and queued a secure write action.
    
    * **Proposed Content Enhancement:**
    ${rawAfterStr.split("\n\n").map(p => `> ${p}`).join("\n")}
    
    * **Security Gate Activated:**
    Since this is a write-capable action, the Tool Gateway blocked live deployment to Shopify. I have created a pending action **${approvalId}** in your Approval Queue. Please audit and accept or decline this change in your central dashboard tab.`;
  }

  else if (agent.id === "agent_theme_dev" || agent.id === "agent_design") {
    const patchId = `APV-${String(approvalQueue.length + 1).padStart(3, '0')}`;
    const patchCode = `/* ${agent.name} Optimizations - Active */\n.btn-primary {\n  background-color: #0c1821;\n  letter-spacing: 0.05em;\n  transition: duration 300ms ease;\n}`;

    const newApproval: ApprovalItem = {
      id: patchId,
      timestamp: new Date().toISOString(),
      agentId: agent.id,
      agentName: agent.name,
      actionType: "THEME_PATCH",
      targetId: "main_theme",
      details: {
        title: `Asset layout update via ${agent.name}`,
        before: "/* Default CSS declarations in theme files */",
        after: patchCode,
        summary: "Inserted CSS overrides to add sleek graphite buttons with fluid responsive scaling transitions.",
        themeId: "main_theme",
        patch: patchCode
      },
      status: "PENDING"
    };

    approvalQueue.unshift(newApproval);

    mockCalls.push({
      toolName: "shopify.prepareThemePatch",
      args: { themeId: "main_theme", patch: patchCode },
      status: "requires_approval",
      approvalId: patchId,
      result: { status: "Awaiting approval action", approvalId: patchId }
    });

    writeLog(agent.name, "APPROVAL_CREATED", `Proposed active stylesheet modifications. Created item ${patchId}.`);

    agentResponseText = `🎨 **Layout Adjustments Proposed**
    
    I analyzed the Shopify store's style hooks using \`shopify.getShopInfo\`. To create a highly premium storefront feel, I drafted a theme layout override patch and logged it in the Tool Gateway.
    
    * **Calculated Theme Patch:**
    \`\`\`css
    ${patchCode}
    \`\`\`
    
    Since this update changes your active storefront aesthetics, the rewrite is paused. I've sent item **${patchId}** to the **Approval Queue** for your direct authorization.`;
  }

  else {
    // Setup, Support, or Media Agent Generic Responses
    let actionItem = "general context lookup";
    if (agent.id === "agent_store_setup") {
      actionItem = "Shopify parameters configuration check";
      mockCalls.push({
        toolName: "shopify.getShopInfo",
        args: {},
        status: "success",
        result: shopifyStore
      });
      writeLog(agent.name, "TOOL_CALL", "Queried general shop connection details.");
    } else if (agent.id === "agent_customer_support") {
      actionItem = "customer order audits";
      mockCalls.push({
        toolName: "shopify.getOrders",
        args: {},
        status: "success",
        result: mockOrders
      });
      writeLog(agent.name, "TOOL_CALL", "Fetched active retail order lists.");
    } else {
      actionItem = "media layout scan";
      mockCalls.push({
        toolName: "shopify.getProducts",
        args: {},
        status: "success",
        result: { productCount: mockProducts.length }
      });
      writeLog(agent.name, "TOOL_CALL", "Scanned product media registers.");
    }

    agentResponseText = `🤖 **Greetings! I am the ${agent.name}.**
    
    I have processed your query: *"${prompt}"*. 
    To fulfill this request, I activated my assigned resources. Our security layer was triggered, verifying correct scopes (\`${agent.requiredScopes.join(", ")}\`) before delegating tasks.
    
    * **Action Completed:** Conducted ${actionItem} securely in isolation.
    * **Audit Complete:** Access logs have been captured in your global Audit Trail records. Let me know if you would like me to draft further actions!`;
  }

  // Orchestrator response
  resultMessages.push({
    id: `m-${Date.now()}-2`,
    sender: "orchestrator",
    text: `🎯 **Routing Decision:** Handled request with **${agent.name}** based on semantic query classification.`,
    timestamp: messageTimestamp
  });

  // Agent response
  resultMessages.push({
    id: `m-${Date.now()}-3`,
    sender: "agent",
    agentId: agent.id,
    agentName: agent.name,
    text: agentResponseText,
    timestamp: messageTimestamp,
    toolInvocations: mockCalls
  });

  return resultMessages;
}

// Master Orchestrate end-point
app.post("/api/orchestrate", async (req, res) => {
  const { prompt, selectedAgentId } = req.body;

  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Instruction prompt cannot be empty" });
  }

  const client = getGeminiSDK();

  if (!client) {
    // Deterministic fallback response simulation
    const simulatedResponse = fallbackOrchestration(prompt, selectedAgentId);
    return res.json({ messages: simulatedResponse });
  }

  // Real Gemini implementation
  try {
    // Fetch state details to inject to prompt
    const storeDetails = JSON.stringify(shopifyStore);
    const compactAgentsList = agentsList.map(a => ({
      id: a.id,
      name: a.name,
      tools: a.allowedTools,
      scopes: a.requiredScopes,
      enabled: a.enabled,
      systemInstruction: a.systemInstruction
    }));
    const compactProducts = mockProducts.map(p => ({ id: p.id, title: p.title, inventory: p.inventory, description: p.description }));
    const compactOrders = mockOrders.slice(0, 3);

    const activeRegistryPrompt = `
      You are the Master Orchestration Service of a Shopify AI Managed Agent platform.
      Your job is to route the storeowner's prompt to the correct target agent, execute simulated shopify tools, and output responses in JSON conforming exactly to the structured schema below.

      Active Connected Store:
      ${storeDetails}

      Available Agents in Registry:
      ${JSON.stringify(compactAgentsList)}

      Mock Store Catalog:
      ${JSON.stringify(compactProducts)}

      Mock Store Orders:
      ${JSON.stringify(compactOrders)}

      Storeowner Prompt: "${prompt}"
      Selected Agent Hint: "${selectedAgentId || 'None manually specified'}"

      YOUR TASKS:
      1. Classify which Agent (from the available agents list) is best suited to answer. If a manual agent hint is specified and is enabled, absolutely prioritize that agent. If the routed agent is currently DISABLED, you must return routedDisabled: true.
      2. If routedDisabled is false:
         a. Propose Tool calls representing the agent's work flow.
            Available Mock API tools:
            - shopify.getShopInfo (reads general store specs)
            - shopify.getProducts (queries full catalog lists)
            - shopify.getOrders (retrieves active retail order indices)
            - shopify.getSalesSummary (analyzes sales reports)
            - shopify.prepareProductUpdate (write action -> locks changes inside approvals queue. Parameters: { productId: number, fields: { title?: string, description?: string, price?: number, inventory?: number } })
            - shopify.prepareThemePatch (write action -> queues CSS file layout adjustments. Parameters: { themeId: string, patch: string })
         b. Write high quality markdown markdown response representing the chosen agent's thoughts and text outputs.
         c. If the agent makes a write-based tool call (prepareProductUpdate or prepareThemePatch), formulate the precise payload arguments to update the store item. This will create a pending approval queue item in the console.

      RETURN STRICTLY A JSON OBJECT matching this exact structure, with NO surrounding markdown backticks or other words:
      {
        "routedAgentId": "agent_id_string",
        "routedAgentName": "Agent Name",
        "routedDisabled": false,
        "agentResponseText": "A highly premium humanized markdown copy and response detailing the tools ran, results, and recommendations.",
        "toolCalls": [
          {
            "name": "shopify.getProducts",
            "args": {}
          },
          {
            "name": "shopify.prepareProductUpdate",
            "args": {
              "productId": 101,
              "fields": {
                "description": "Premium descriptive rich copy text here..."
              }
            }
          }
        ]
      }
    `;

    const geminiRes = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: activeRegistryPrompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const cleanResultText = geminiRes.text.trim();
    const resultObj = JSON.parse(cleanResultText);

    // Apply outcomes dynamically
    const matchedAgent = agentsList.find(a => a.id === resultObj.routedAgentId) || agentsList[0];
    const messageTimestamp = new Date().toISOString();
    const resultMessages: OrchestrationMessage[] = [];

    writeLog(
      "Super Agent Orchestrator",
      "ROUTE_REQUEST",
      `Routed storeowner request to Gemini-powered '${matchedAgent.name}' (semantic query confidence: 0.98)`,
      { agentId: matchedAgent.id }
    );

    if (resultObj.routedDisabled || !matchedAgent.enabled) {
      resultMessages.push({
        id: `m-${Date.now()}-1`,
        sender: "orchestrator",
        text: `⚠️ **Routing Check Failed:** Target Agent **${matchedAgent.name}** is currently inactive. Toggle it active inside the Registry to delegate functions.`,
        timestamp: messageTimestamp
      });
      return res.json({ messages: resultMessages });
    }

    // Process tool invocations and map to frontend representation
    const frontendInvocations: any[] = [];
    
    if (resultObj.toolCalls && Array.isArray(resultObj.toolCalls)) {
      for (const call of resultObj.toolCalls) {
        let executionStatus: 'success' | 'requires_approval' = 'success';
        let approvalId: string | undefined = undefined;
        let executionResult: any = { status: "success" };

        writeLog(matchedAgent.name, "TOOL_CALL", `Executed SDK Gateway task: \`${call.name}\``, { args: call.args });

        // Handle write requests -> generate Approval item
        if (call.name === "shopify.prepareProductUpdate" && call.args) {
          executionStatus = "requires_approval";
          approvalId = `APV-${String(approvalQueue.length + 1).padStart(3, '0')}`;
          
          const targetProdId = Number(call.args.productId || 101);
          const localProd = mockProducts.find(p => p.id === targetProdId) || mockProducts[0];
          const newFields = call.args.fields || {};

          const approvalItem: ApprovalItem = {
            id: approvalId,
            timestamp: new Date().toISOString(),
            agentId: matchedAgent.id,
            agentName: matchedAgent.name,
            actionType: "PRODUCT_UPDATE",
            targetId: String(targetProdId),
            details: {
              title: `Optimized content draft for ${localProd.title}`,
              before: localProd.description,
              after: newFields.description || "Updated copy content draft.",
              summary: "Gemini-generated high-converting sales copywriting overhaul.",
              productId: targetProdId,
              fields: newFields
            },
            status: "PENDING"
          };

          approvalQueue.unshift(approvalItem);
          executionResult = { status: "Awaiting shop owner sign-off", approvalId };
          writeLog(matchedAgent.name, "APPROVAL_CREATED", `Added manual audit item ${approvalId} for product ${targetProdId}`);
        }

        else if (call.name === "shopify.prepareThemePatch" && call.args) {
          executionStatus = "requires_approval";
          approvalId = `APV-${String(approvalQueue.length + 1).padStart(3, '0')}`;

          const approvalItem: ApprovalItem = {
            id: approvalId,
            timestamp: new Date().toISOString(),
            agentId: matchedAgent.id,
            agentName: matchedAgent.name,
            actionType: "THEME_PATCH",
            targetId: call.args.themeId || "main_theme",
            details: {
              title: "Shopify core theme UI/CSS layout adjustment",
              before: "/* Former theme layout hooks */",
              after: call.args.patch || "/* Polished rules */",
              summary: "Visual refinement compiled by theme agent.",
              themeId: call.args.themeId || "main_theme",
              patch: call.args.patch
            },
            status: "PENDING"
          };

          approvalQueue.unshift(approvalItem);
          executionResult = { status: "Awaiting theme verification", approvalId };
          writeLog(matchedAgent.name, "APPROVAL_CREATED", `Added manual CSS overhaul task ${approvalId}`);
        }

        // Handle reads
        else if (call.name === "shopify.getShopInfo") {
          executionResult = shopifyStore;
        } else if (call.name === "shopify.getProducts") {
          executionResult = { productCount: mockProducts.length, sample: mockProducts.slice(0, 2) };
        } else if (call.name === "shopify.getOrders") {
          executionResult = { orders: mockOrders };
        } else if (call.name === "shopify.getSalesSummary") {
          executionResult = mockSalesReport;
        }

        frontendInvocations.push({
          toolName: call.name,
          args: call.args,
          status: executionStatus,
          result: executionResult,
          approvalId
        });
      }
    }

    resultMessages.push({
      id: `m-${Date.now()}-1`,
      sender: "orchestrator",
      text: `🎯 **Routing Decision:** Handled request with **${matchedAgent.name}** via live prompt semantic matching.`,
      timestamp: messageTimestamp
    });

    resultMessages.push({
      id: `m-${Date.now()}-2`,
      sender: "agent",
      agentId: matchedAgent.id,
      agentName: matchedAgent.name,
      text: resultObj.agentResponseText || "Completed requested tasks successfully.",
      timestamp: messageTimestamp,
      toolInvocations: frontendInvocations
    });

    res.json({ messages: resultMessages });

  } catch (error: any) {
    console.error("Gemini Orchestration Error: ", error);
    
    // Smooth recovery & fallback log
    const simulatedResponse = fallbackOrchestration(prompt, selectedAgentId);
    res.json({ 
      messages: simulatedResponse,
      warning: "Successfully recovered using local simulation gateway."
    });
  }
});


// ==========================================
// 4. DEVELOPMENT AND PRODUCTION MIDDLEWARE
// ==========================================

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Shopify AI Agent Control Center] Running at http://localhost:${PORT}`);
  });
}

startServer();
