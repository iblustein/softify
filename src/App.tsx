import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Cpu, 
  Terminal, 
  FileCheck, 
  Activity, 
  Coins, 
  RefreshCw,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { 
  ShopifyStore, 
  Agent, 
  ApprovalItem, 
  AuditLog, 
  DashboardStats, 
  OrchestrationMessage 
} from './types';
import DashboardOverview from './components/DashboardOverview';
import AgentRegistry from './components/AgentRegistry';
import SuperAgentUI from './components/SuperAgentUI';
import ToolGateway from './components/ToolGateway';
import ApprovalQueue from './components/ApprovalQueue';
import AuditLogViewer from './components/AuditLogViewer';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'orchestrator' | 'gateway' | 'approvals' | 'logs'>('dashboard');
  
  // Data States
  const [store, setStore] = useState<ShopifyStore | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [messages, setMessages] = useState<OrchestrationMessage[]>([]);
  
  // Loading & Error States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Fetch core parameters
  const fetchAllData = async () => {
    setIsLoading(true);
    setErrorText(null);
    try {
      const [shopRes, agentsRes, approvalsRes, logsRes, statsRes] = await Promise.all([
        fetch('/api/shop'),
        fetch('/api/agents'),
        fetch('/api/approvals'),
        fetch('/api/audit-logs'),
        fetch('/api/dashboard-stats')
      ]);

      if (!shopRes.ok || !agentsRes.ok || !approvalsRes.ok || !logsRes.ok || !statsRes.ok) {
        throw new Error('Server handshakes warning (some tables failed loading)');
      }

      const shopData = await shopRes.json();
      const agentsData = await agentsRes.json();
      const approvalsData = await approvalsRes.json();
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();

      setStore(shopData);
      setAgents(agentsData);
      setApprovals(approvalsData);
      setLogs(logsData);
      setStats(statsData);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || 'Failed to sync dashboard status.');
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger initial synchronization
  useEffect(() => {
    fetchAllData();

    // Handle query params on redirection callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("shopify_connected") === "true") {
      const shop = urlParams.get("shop") || "Store";
      window.history.replaceState({}, document.title, window.location.pathname);
      console.log(`[Shopify OAuth] Store ${shop} connected successfully via OAuth!`);
    }
  }, []);

  // Sync state stats after approvals/updates
  const syncStatsAndLogs = async () => {
    try {
      const [statsRes, logsRes, approvalsRes, productsRes] = await Promise.all([
        fetch('/api/dashboard-stats'),
        fetch('/api/audit-logs'),
        fetch('/api/approvals'),
        fetch('/api/products')
      ]);
      if (statsRes.ok && logsRes.ok && approvalsRes.ok) {
        setStats(await statsRes.json());
        setLogs(await logsRes.json());
        setApprovals(await approvalsRes.json());
      }
    } catch (error) {
      console.error("Async state sync warning: ", error);
    }
  };

  // Connect Storefront Handler
  const handleConnectStore = async (url: string, scopes: string[]) => {
    setIsActionLoading(true);
    setErrorText(null);
    try {
      const res = await fetch('/api/shop/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, scopes })
      });
      if (!res.ok) throw new Error('Simulated OAuth handshake failed.');
      const data = await res.json();
      setStore(data.store);
      await syncStatsAndLogs();
    } catch (err: any) {
      setErrorText(err.message || 'Connection handshake failed.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Disconnect Storefront Handler
  const handleDisconnectStore = async () => {
    setIsActionLoading(true);
    setErrorText(null);
    try {
      const res = await fetch('/api/shop/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to sever Shopify connection hook.');
      const data = await res.json();
      setStore(data.store);
      await syncStatsAndLogs();
    } catch (err: any) {
      setErrorText(err.message || 'Disconnect failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Update Agent parameters (Toggle Enabled / Edit Instructions / Tools)
  const handleUpdateAgent = async (id: string, updates: Partial<Agent>) => {
    setIsActionLoading(true);
    setErrorText(null);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to post parameters updates to agent ' + id);
      const updatedAgent = await res.json();
      
      setAgents(prev => prev.map(a => a.id === id ? updatedAgent : a));
      await syncStatsAndLogs();
    } catch (err: any) {
      setErrorText(err.message || 'Saving configuration parameter adjustments failed.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Decide Approval Queue Item
  const handleDecideApproval = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    setIsActionLoading(true);
    setErrorText(null);
    try {
      const res = await fetch(`/api/approvals/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      if (!res.ok) throw new Error('Authorization post failure');
      const updatedItem = await res.json();

      setApprovals(prev => prev.map(item => item.id === id ? updatedItem : item));
      await syncStatsAndLogs();
    } catch (err: any) {
      setErrorText(err.message || 'Finalizing approval request failed.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Core Request Orchestration
  const handleSendOrchestratorMessage = async (prompt: string, selectedAgentId?: string) => {
    const userMessage: OrchestrationMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsActionLoading(true);
    setErrorText(null);

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, selectedAgentId })
      });
      if (!res.ok) throw new Error('Orchestrator request failed.');
      const data = await res.json();
      
      // Append matching pipeline logs/replies
      if (data.messages && Array.isArray(data.messages)) {
        setMessages(prev => [...prev, ...data.messages]);
      }
      await syncStatsAndLogs();
    } catch (err: any) {
      setErrorText(err.message || 'Super Agent failed to fulfill your request.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Reset Demo Database Data
  const handleResetDatabase = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch('/api/reset-data', { method: 'POST' });
      if (res.ok) {
        setMessages([]);
        await fetchAllData();
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Render Loader screen
  if (isLoading || !store || !stats) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-900 font-sans">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-tight">Syncing Agent Gateway Telemetries...</p>
        <p className="text-xs text-slate-400 mt-1">Authenticating connected databases in workspace.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden text-slate-900 bg-slate-50 font-sans">
      
      {/* 1. SaaS Lateral Sidebar Navigation */}
      <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col justify-between border-r border-slate-900 shrink-0">
        <div className="flex flex-col flex-1 min-h-0">
          
          {/* Logo Brand Title */}
          <div className="p-5 border-b border-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                <Coins className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold tracking-tight text-white font-display uppercase leading-none">Shopify AI Agent</h1>
                <p className="text-[10px] text-indigo-400 font-mono tracking-widest leading-none mt-1">Control Center</p>
              </div>
            </div>
            {store.connected && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400 shrink-0 animate-pulse"></span>
            )}
          </div>

          {/* Quick Stats Panel */}
          <div className="p-4 bg-slate-900/50 border-b border-slate-900">
            <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-semibold font-display">
              <span>Merchant Identity</span>
              <span className="font-mono text-indigo-400 text-3xs">Sandbox</span>
            </div>
            <p className="text-xs text-white font-bold mt-1.5 truncate leading-none">
              {store.connected ? store.name : "Unconnected Store"}
            </p>
            <p className="text-3xs text-slate-500 font-mono mt-0.5 truncate leading-none">
              {store.connected ? store.url : "offline.myshopify.com"}
            </p>
          </div>

          {/* Tabs Menu List */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'dashboard' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span>Store Dashboard</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'agents' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 shrink-0" />
                <span>Agent Registry</span>
              </div>
              <span className="text-4xs font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-400">
                {stats.activeAgentsCount} Active
              </span>
            </button>

            <button
              onClick={() => setActiveTab('orchestrator')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'orchestrator' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Cpu className="w-4 h-4 shrink-0" />
                <span>Super Agent Chat</span>
              </div>
              <span className="text-4xs font-mono bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5" />
                Run
              </span>
            </button>

            <button
              onClick={() => setActiveTab('gateway')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'gateway' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 shrink-0" />
                <span>Tool Gateway</span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'approvals' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-4 h-4 shrink-0" />
                <span>Write Approvals</span>
              </div>
              {stats.pendingApprovalsCount > 0 && (
                <span className="text-4xs font-bold bg-amber-600 text-amber-50 px-1.5 py-0.5 rounded-full ring-2 ring-slate-950 animate-pulse">
                  {stats.pendingApprovalsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition cursor-pointer ${
                activeTab === 'logs' ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-slate-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 shrink-0" />
                <span>Control Audit Logs</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Workspace Connection Info */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 text-3xs text-slate-500 font-mono text-center">
          <div>Handshake OAuth API Ready</div>
          <div className="text-[9px] mt-1 text-slate-600">Secure Managed Gateway</div>
        </div>
      </aside>

      {/* 2. Main content container */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden">
        {/* Alerts Center Widget */}
        {errorText && (
          <div className="bg-amber-50 border-b border-amber-200 p-3.5 flex items-center justify-between gap-3 text-xs text-amber-800 animate-fade-in shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{errorText}</span>
            </div>
            <button
              onClick={() => setErrorText(null)}
              className="text-amber-550 hover:text-amber-700 font-bold px-2 rounded hover:bg-amber-100 transition leading-none py-1 text-3xs uppercase cursor-pointer"
            >
              Acknowledge
            </button>
          </div>
        )}

        {/* Active Route Wrapper */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {activeTab === 'dashboard' && (
              <DashboardOverview 
                stats={stats} 
                store={store} 
                onConnect={handleConnectStore} 
                onDisconnect={handleDisconnectStore} 
                onReset={handleResetDatabase}
                isLoading={isActionLoading}
              />
            )}

            {activeTab === 'agents' && (
              <AgentRegistry 
                agents={agents} 
                onUpdateAgent={handleUpdateAgent}
                isLoading={isActionLoading}
              />
            )}

            {activeTab === 'orchestrator' && (
              <SuperAgentUI 
                agents={agents} 
                messages={messages} 
                onSendMessage={handleSendOrchestratorMessage}
                isLoading={isActionLoading}
                onNavigateToApprovals={() => setActiveTab('approvals')}
              />
            )}

            {activeTab === 'gateway' && (
              <ToolGateway isLoading={isActionLoading} />
            )}

            {activeTab === 'approvals' && (
              <ApprovalQueue 
                approvals={approvals} 
                onDecide={handleDecideApproval}
                isLoading={isActionLoading}
              />
            )}

            {activeTab === 'logs' && (
              <AuditLogViewer logs={logs} />
            )}
          </div>
        </div>
      </main>

    </div>
  );
}
