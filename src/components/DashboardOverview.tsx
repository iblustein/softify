import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Link2, 
  Unlink,
  CheckCircle, 
  Cpu, 
  FileCheck, 
  Activity, 
  Database,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Coins
} from 'lucide-react';
import { DashboardStats, ShopifyStore } from '../types';

interface DashboardOverviewProps {
  stats: DashboardStats;
  store: ShopifyStore;
  onConnect: (url: string, scopes: string[]) => void;
  onDisconnect: () => void;
  onReset: () => void;
  isLoading: boolean;
  isOAuthConfigured?: boolean;
  testShop?: string | null;
}

const ALL_AVAILABLE_SCOPES = [
  { id: 'read_products', label: 'Read Products (Catalog & inventory audits)', required: true },
  { id: 'write_products', label: 'Write Products (Description overhauls & tag optimization)' },
  { id: 'read_orders', label: 'Read Orders (Sales analytics & fulfillment triggers)', required: true },
  { id: 'read_customers', label: 'Read Customers (Contextual support responses)' },
  { id: 'write_themes', label: 'Write Themes (CSS layout patches & visual assets edits)' },
  { id: 'read_analytics', label: 'Read Analytics (General statistics calculation)' }
];

const LOCAL_SALES_REPORT = {
  conversionRate: "2.42%",
  totalWeekRevenue: 5340,
  activeSessions: 1840,
  popularProducts: [
    { name: "Eco Linen Warm Shirt", salesCount: 14, revenue: 1092 },
    { name: "Silk Contour Sleep Mask", salesCount: 18, revenue: 432 },
    { name: "Solid Walnut Headphone Stand", salesCount: 6, revenue: 390 }
  ]
};

function resolveStoreInputValue(
  store: ShopifyStore,
  isOAuthConfigured?: boolean,
  testShop?: string | null
) {
  if (store.connected) return store.url;

  if (isOAuthConfigured) {
    return store.url || testShop || "";
  }

  return store.url || "glowthread-apparel.myshopify.com";
}

export default function DashboardOverview({
  stats,
  store,
  onConnect,
  onDisconnect,
  onReset,
  isLoading,
  isOAuthConfigured,
  testShop
}: DashboardOverviewProps) {
  const [storeInput, setStoreInput] = useState(() =>
    resolveStoreInputValue(store, isOAuthConfigured, testShop)
  );
  const [selectedScopes, setSelectedScopes] = useState<string[]>(
    store.scopes.length > 0 ? store.scopes : ['read_products', 'read_orders']
  );
  const [showConnectForm, setShowConnectForm] = useState(!store.connected);

  useEffect(() => {
    if (!store.connected) {
      setStoreInput(resolveStoreInputValue(store, isOAuthConfigured, testShop));
    }
  }, [store.url, store.connected, isOAuthConfigured, testShop]);

  const handleScopeToggle = (scopeId: string) => {
    if (scopeId === 'read_products' || scopeId === 'read_orders') return; // mandatory for routing mockup
    setSelectedScopes(prev => 
      prev.includes(scopeId) ? prev.filter(s => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeInput.trim()) return;

    onConnect(storeInput, selectedScopes);
    setShowConnectForm(false);
  };

  return (
    <div className="space-y-6">
      {/* SaaS Dashboard Title & Handshake Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">SaaS Central Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor connected storefront indexes, supervise concurrent agent instances, and verify write approvals.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Reset Prototype DB
          </button>
        </div>
      </div>

      {/* Connection Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${store.connected ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-none">Shopify Store Credentials</h2>
              <p className="text-xs text-slate-500 mt-1.5">
                {store.connected ? `Successfully authenticated using Managed Agents OAuth API` : 'Storefront link inactive'}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            {store.connected ? (
              <button
                onClick={onDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition border border-red-100 cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                Disconnect Store
              </button>
            ) : (
              <button
                onClick={() => setShowConnectForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition border border-indigo-100 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                Initialize Handshake
              </button>
            )}
          </div>
        </div>

        {/* Store Detail Metadata */}
        {!showConnectForm && store.connected ? (
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Connected Storefront</span>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="font-bold text-slate-900 text-lg">{store.name}</span>
              </div>
              <p className="text-xs font-mono text-slate-500">{store.url}</p>
            </div>

            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shopify Tier & Auth Settings</span>
              <div className="text-xs text-slate-600 space-y-1.5">
                <div><span className="text-slate-400 font-medium">Merchant Plan:</span> <span className="font-bold text-slate-800">{store.plan}</span></div>
                <div><span className="text-slate-400 font-medium">Local Currency:</span> <span className="font-bold text-slate-800 font-mono">{store.currency}</span></div>
                <div><span className="text-slate-400 font-medium">Authenticated:</span> <span className="font-mono text-slate-800">{store.connectedAt ? new Date(store.connectedAt).toLocaleDateString() : 'N/A'}</span></div>
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Authorized Scopes ({store.scopes.length})</span>
              <div className="flex flex-wrap gap-1">
                {store.scopes.map(scope => (
                  <span key={scope} className="inline-flex items-center px-2.5 py-1 text-[10px] font-mono font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Connect Store via Simulated OAuth</h3>
            <form onSubmit={handleConnectSubmit} className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Shopify Store domain (.myshopify.com)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-xs font-mono pointer-events-none">
                    https://
                  </span>
                  <input
                    type="text"
                    value={storeInput}
                    onChange={(e) => setStoreInput(e.target.value)}
                    placeholder="your-shop-name.myshopify.com"
                    className="w-full pl-18 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  No real credentials required. Handshake simulates Shopify REST Admin credentials injection.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Requested Scopes (Required capabilities for Agent tool gateways)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  {ALL_AVAILABLE_SCOPES.map(scope => {
                    const checked = selectedScopes.includes(scope.id);
                    return (
                      <div 
                        key={scope.id} 
                        onClick={() => handleScopeToggle(scope.id)}
                        className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                          checked 
                            ? 'bg-indigo-50/50 border-indigo-400 text-indigo-950 shadow-2xs' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}} // handled by parent div
                          disabled={scope.required}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-350 pointer-events-none"
                        />
                        <div>
                          <p className="font-bold leading-none text-slate-900">{scope.id}</p>
                          <p className="text-[10px] text-slate-505 mt-1.5 leading-normal">{scope.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4.5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition duration-150 cursor-pointer"
                >
                  Confirm Permissions & Establish Hook
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Grid statistics metrics panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Agent Workers</span>
            <div className="p-1.5 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100/50">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-display">{stats.activeAgentsCount}</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>All specialized instances online</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Approval Queue</span>
            <div className={`p-1.5 rounded-xl border ${stats.pendingApprovalsCount > 0 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-display">{stats.pendingApprovalsCount}</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
            <span className={stats.pendingApprovalsCount > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}>
              {stats.pendingApprovalsCount > 0 ? 'Requires shop owner review' : 'Security buffer is empty'}
            </span>
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Catalog Database</span>
            <div className="p-1.5 bg-blue-50 rounded-xl text-blue-600 border border-blue-100/50">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-display">{stats.totalProductsCount}</p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5 flex-wrap">
            <span>5 structured sandbox listings ready</span>
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Actions</span>
            <div className="p-1.5 bg-violet-50 rounded-xl text-violet-600 border border-violet-100/50">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2 font-display">{stats.totalLogsCount}</p>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-1.5 font-semibold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>100% telemetry coverage</span>
          </div>
        </div>
      </div>

      {/* Split pane for mini summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sandbox Store Mock Database Insight card */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-500" />
              Connected Shopify Sandbox
            </h3>
            <span className="text-[10px] font-mono text-slate-400 font-semibold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">Sync status: Live Mock</span>
          </div>

          {!store.connected ? (
            <div className="py-10 text-center text-slate-400 max-w-sm mx-auto">
              <Unlink className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">Shopify Connection offline</p>
              <p className="text-xs text-slate-400 mt-1">Please connect your store or use the sample config to run queries.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 bg-slate-50/70 p-4 rounded-xl text-center border border-slate-100">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Conversion Rate</span>
                  <span className="text-base font-bold text-slate-800 mt-1 block font-mono">{LOCAL_SALES_REPORT.conversionRate}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Est. Weekly Revenue</span>
                  <span className="text-base font-bold text-indigo-600 mt-1 block font-mono">${LOCAL_SALES_REPORT.totalWeekRevenue}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block font-bold">Active Web Sessions</span>
                  <span className="text-base font-bold text-slate-800 mt-1 block font-mono">{LOCAL_SALES_REPORT.activeSessions}</span>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">High performance SKU metrics</h4>
                <div className="space-y-2">
                  {LOCAL_SALES_REPORT.popularProducts.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-slate-50/40 hover:bg-slate-50/95 rounded-xl border border-slate-150 text-xs transition-colors">
                      <div className="font-bold text-slate-800">{p.name}</div>
                      <div className="flex items-center gap-4 text-slate-500 font-mono text-3xs">
                        <div>Sales: <span className="font-bold text-slate-805">{p.salesCount}</span></div>
                        <div>Revenue: <span className="font-bold text-emerald-600">${p.revenue}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Guided Overview panel */}
        <div className="bg-slate-900 text-slate-300 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <div className="w-32 h-32 border-4 border-white rounded-full"></div>
          </div>
          <div className="space-y-4 z-10">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-indigo-300 border border-slate-700">
              Agent Registry V1.2
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight font-display leading-snug">
              Gemini Managed Agents Paradigm
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans mt-2">
              Based on the newest Gemini architecture, the <strong className="text-indigo-300">Super Agent Orchestrator</strong> reads store instructions, routes queries to specialized units, and schedules safe parameters actions through a central <strong className="text-indigo-300">Tool Gateway</strong>.
            </p>
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2 text-3xs text-slate-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>Sandbox databases operate on stateful mocks</span>
              </div>
              <div className="flex items-center gap-2 text-3xs text-slate-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                <span>Real-time safety approval queue gates</span>
              </div>
              <div className="flex items-center gap-2 text-3xs text-slate-300 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span>Full metadata logging for live audits</span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-6 flex items-center justify-between text-[10px] text-slate-500 font-mono z-10">
            <span>Shopify OAuth Hook Layer Ready</span>
            <Coins className="w-4 h-4 text-indigo-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
