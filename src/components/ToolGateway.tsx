import React, { useState } from 'react';
import { 
  Terminal, 
  Activity, 
  Play, 
  ArrowRight, 
  Database,
  Lock,
  FileCode,
  Info,
  RefreshCw,
  Eye
} from 'lucide-react';

interface ToolGatewayProps {
  isLoading: boolean;
}

interface ToolInfo {
  name: string;
  description: string;
  scope: string;
  endpoints: string;
  parameters: { name: string; type: string; desc: string; required: boolean }[];
  outputSample: any;
}

const GATEWAY_TOOLS: ToolInfo[] = [
  {
    name: "shopify.getShopInfo",
    description: "Queries general Shopify settings index including host URL, plan levels, shop currency, and creation timestamps.",
    scope: "read_content, read_products",
    endpoints: "GET /api/shop",
    parameters: [],
    outputSample: {
      url: "luminary-essentials.myshopify.com",
      name: "Luminary Essentials",
      connected: true,
      connectedAt: "2026-05-18T12:00:00Z",
      plan: "Shopify Plus",
      currency: "USD",
      scopes: ["read_products", "write_products", "read_orders", "read_customers", "write_themes", "read_analytics"]
    }
  },
  {
    name: "shopify.getProducts",
    description: "Fetches full sandbox product listings for description drafts, inventory calculations, and catalog optimization.",
    scope: "read_products",
    endpoints: "GET /api/products",
    parameters: [],
    outputSample: [
      { id: 101, title: "Eco Linen Warm Shirt", price: 78.00, inventory: 42, description: "A comfortable linen shirt..." },
      { id: 102, title: "Double-walled Ceramic Mug", price: 32.00, inventory: 15, description: "Keeps drinks warm..." }
    ]
  },
  {
    name: "shopify.getOrders",
    description: "Returns unfulfilled or fulfilled customer checkout records enabling support analysis and shipment triggers.",
    scope: "read_orders",
    endpoints: "GET /api/orders",
    parameters: [],
    outputSample: [
      { id: 4001, customer_name: "Sarah Jenkins", total: 110.00, items: "Eco Linen Warm Shirt (1)", status: "Fulfilled" }
    ]
  },
  {
    name: "shopify.getSalesSummary",
    description: "Aggregates revenue tracking matrices, active web session summaries, and conversion rate reports.",
    scope: "read_analytics",
    endpoints: "GET /api/sales-summary",
    parameters: [],
    outputSample: {
      totalWeekRevenue: 5340,
      conversionRate: "2.42%",
      activeSessions: 1840,
      popularProducts: [{ name: "Eco Linen Warm Shirt", salesCount: 14, revenue: 1092 }]
    }
  },
  {
    name: "shopify.prepareProductUpdate",
    description: "Drafts a product specification adjustment block, pausing changes in the security gate Approvals Queue.",
    scope: "write_products",
    endpoints: "POST /api/approvals (PRODUCT_UPDATE)",
    parameters: [
      { name: "productId", type: "number", desc: "The target catalog product key ID", required: true },
      { name: "fields", type: "object", desc: "Fields to update (e.g. description, price, inventory)", required: true }
    ],
    outputSample: {
      status: "requires_approval",
      approvalId: "APV-001",
      result: {
        status: "Awaiting owner authentication",
        approvalId: "APV-001"
      }
    }
  },
  {
    name: "shopify.prepareThemePatch",
    description: "Submits visual customization stylesheet blocks for storefront adjustments, pausing files inside the Approvals Queue.",
    scope: "write_themes",
    endpoints: "POST /api/approvals (THEME_PATCH)",
    parameters: [
      { name: "themeId", type: "string", desc: "Always set to 'main_theme'", required: true },
      { name: "patch", type: "string", desc: "Raw CSS layout overrides", required: true }
    ],
    outputSample: {
      status: "requires_approval",
      approvalId: "APV-002",
      result: {
        status: "Awaiting theme verification",
        approvalId: "APV-002"
      }
    }
  }
];

export default function ToolGateway({ isLoading }: ToolGatewayProps) {
  const [selectedTool, setSelectedTool] = useState<ToolInfo>(GATEWAY_TOOLS[0]);
  const [consoleOutput, setConsoleOutput] = useState<string>("// Interactive Payload display\n// Click 'Execute Mock Run' to query server DB...");
  const [isConsoleRunning, setIsConsoleRunning] = useState<boolean>(false);

  const handleToolSelect = (tool: ToolInfo) => {
    setSelectedTool(tool);
    setConsoleOutput("// Interactive Payload display\n// Click 'Execute Mock Run' to fetch stateful values.");
  };

  const handleExecuteMock = async () => {
    setIsConsoleRunning(true);
    setConsoleOutput("// Fetching stateful databases from Express server REST hooks...");

    // Determine mock api endpoints
    let endpoint = "";
    if (selectedTool.name === "shopify.getShopInfo") endpoint = "/api/shop";
    else if (selectedTool.name === "shopify.getProducts") endpoint = "/api/products";
    else if (selectedTool.name === "shopify.getOrders") endpoint = "/api/orders";
    else if (selectedTool.name === "shopify.getSalesSummary") endpoint = "/api/sales-summary";
    else if (selectedTool.name === "shopify.prepareProductUpdate") endpoint = "/api/approvals";
    else if (selectedTool.name === "shopify.prepareThemePatch") endpoint = "/api/approvals";

    try {
      // Small timeout for simulation kinetics
      await new Promise(r => setTimeout(r, 600));
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error("HTTP error on read handshake");
      const json = await response.json();

      let finalData = json;
      // Fit write tools custom responses
      if (selectedTool.name === "shopify.prepareProductUpdate") {
        finalData = {
          status: "requires_approval",
          message: "Write gateway is locked. Formulated PRODUCT_UPDATE for Approvals database.",
          lastApprovalItem: json[0] || selectedTool.outputSample
        };
      } else if (selectedTool.name === "shopify.prepareThemePatch") {
        finalData = {
          status: "requires_approval",
          message: "Write gateway is locked. Formulated THEME_PATCH for Approvals database.",
          lastApprovalItem: json.find((j: any) => j.actionType === "THEME_PATCH") || selectedTool.outputSample
        };
      }

      setConsoleOutput(JSON.stringify(finalData, null, 2));
    } catch (err: any) {
      setConsoleOutput(`// Connection warning:\n// Failed to read state details.\n// Fallback representation applied:\n${JSON.stringify(selectedTool.outputSample, null, 2)}`);
    } finally {
      setIsConsoleRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-205 pb-4">
        <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 uppercase">
          <Terminal className="w-5 h-5 text-indigo-650 text-indigo-600" />
          Tool Gateway Explorer
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Each agent is assigned granular Shopify API tools strictly partitioned by OAuth scope boundaries. All write routines are gated into a stateful approval queue.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Side: Tool List */}
        <div className="lg:col-span-2 space-y-2">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 shadow-3xs">
            Available Gateway Classes
          </span>
          
          <div className="space-y-1.55 space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {GATEWAY_TOOLS.map((tool) => {
              const isSelected = selectedTool.name === tool.name;
              const isWrite = tool.name.startsWith("shopify.prepare");
              return (
                <div
                  key={tool.name}
                  onClick={() => handleToolSelect(tool)}
                  className={`p-3.5 rounded-2xl border text-xs cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-indigo-50/45 border-indigo-400 ring-2 ring-indigo-500/10 shadow-sm' 
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex justify-between items-center font-mono font-bold text-slate-800">
                    <span>{tool.name}</span>
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase tracking-wider ${
                      isWrite ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    }`}>
                      {isWrite ? 'WRITE' : 'READ_ONLY'}
                    </span>
                  </div>
                  <p className="text-3xs text-slate-500 mt-1.5 line-clamp-1 leading-snug font-sans">
                    {tool.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Tool Details & Sandbox Console */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          
          {/* Detailed parameters Card */}
          <div className="bg-white border border-slate-205 rounded-2xl p-4.5 flex flex-col justify-between shadow-sm">
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3 flex justify-between items-start">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 font-mono tracking-tight">{selectedTool.name}</h3>
                  <span className="text-4xs text-slate-400 block font-mono mt-0.5 uppercase tracking-wider">{selectedTool.endpoints}</span>
                </div>
                
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full text-4xs text-red-700 font-mono font-bold">
                  <Lock className="w-2.5 h-2.5" />
                  Scope: {selectedTool.scope.split(', ')[0]}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-4xs font-bold text-slate-400 uppercase tracking-widest leading-none">
                  Description
                </span>
                <p className="text-3xs text-slate-600 leading-relaxed italic">
                  "{selectedTool.description}"
                </p>
              </div>

              {selectedTool.parameters.length > 0 ? (
                <div className="space-y-2">
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Required Arguments
                  </span>
                  
                  <div className="space-y-2 border border-slate-150 bg-slate-50/55 rounded-xl p-3 max-h-40 overflow-y-auto">
                    {selectedTool.parameters.map((param) => (
                      <div key={param.name} className="flex justify-between items-start text-3xs border-b border-slate-100 last:border-b-0 pb-1.5 last:pb-0">
                        <div>
                          <span className="font-bold text-slate-800 font-mono">{param.name}</span>
                          <span className="text-4xs text-slate-400 font-mono ml-1.5">{param.type}</span>
                          <p className="text-slate-505 mt-0.5">{param.desc}</p>
                        </div>
                        {param.required && (
                          <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-[8px] font-bold uppercase border border-red-100">
                            Required
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-200 bg-slate-50/50 rounded-xl text-center text-4xs text-slate-400">
                  <Info className="w-4 h-4 mx-auto text-slate-300 mb-1" />
                  No arguments required. Executed using global connected store session keys.
                </div>
              )}
            </div>

            <div className="pt-3.5 border-t border-slate-100 flex items-center justify-between text-2xs mt-4">
              <span className="text-slate-400 flex items-center gap-1 font-mono uppercase tracking-widest text-[9px]">
                OAuth passed
              </span>
              <button
                onClick={handleExecuteMock}
                disabled={isConsoleRunning || isLoading}
                className="inline-flex items-center gap-1.5 px-4.5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-xl shadow-xs transition cursor-pointer text-3xs"
              >
                {isConsoleRunning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Execute Mock Run
              </button>
            </div>
          </div>

          {/* Execution Terminal display */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4.5 flex flex-col h-full text-xs font-mono shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-2 text-2xs text-slate-450 text-slate-400">
              <span className="flex items-center gap-1.5 font-bold uppercase">
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                JSON Output Terminal
              </span>
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/40 px-2.5 py-0.5 rounded-full">
                SIM_SHELL
              </span>
            </div>

            <div className="flex-1 overflow-auto text-[10px] leading-relaxed text-slate-200 bg-slate-950 p-3 rounded-xl border border-slate-850 min-h-48">
              <pre className="whitespace-pre-wrap">{consoleOutput}</pre>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
