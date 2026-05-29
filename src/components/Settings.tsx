import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Link2, 
  Unlink, 
  CheckCircle, 
  Cpu, 
  AlertCircle, 
  Sparkles, 
  Shield, 
  Server, 
  Check, 
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { ShopifyStore } from '../types';

interface SettingsProps {
  store: ShopifyStore;
  isOAuthConfigured: boolean;
  testShop: string | null;
  onConnect: (url: string, scopes: string[]) => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

interface AgentSetting {
  agentId: string;
  name: string;
  description: string;
  enabled: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  requiredPermissions: string[];
  engineId: string;
  model: string;
  activeModel?: string;
}

interface AIEngineSetting {
  engineId: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  configured: boolean;
  defaultModel: string;
  supportedModels: string[];
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed' | null;
  credentialSource: 'env' | 'secret_manager' | 'not_configured';
}

export default function Settings({
  store,
  isOAuthConfigured,
  testShop,
  onConnect,
  onDisconnect,
  onRefresh,
  isLoading
}: SettingsProps) {
  const [agents, setAgents] = useState<AgentSetting[]>([]);
  const [engines, setEngines] = useState<AIEngineSetting[]>([]);
  const [storeStatus, setStoreStatus] = useState<any>(null);
  
  const [storeInput, setStoreInput] = useState(store.url || testShop || "");
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingEngines, setLoadingEngines] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // States for Agent Assignment editing
  const [tempEngineId, setTempEngineId] = useState<string>("gemini");
  const [tempModel, setTempModel] = useState<string>("gemini-1.5-flash");
  const [savingAssignment, setSavingAssignment] = useState(false);

  // States for Connection Testing
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const fetchSettingsData = async () => {
    if (!store.url) return;
    setLoadingAgents(true);
    setLoadingEngines(true);
    setLoadingStatus(true);
    setActionError(null);
    try {
      const q = `?shop=${encodeURIComponent(store.url)}`;
      const [agentsRes, enginesRes, statusRes] = await Promise.all([
        fetch(`/api/settings/agents${q}`),
        fetch(`/api/settings/ai-engines${q}`),
        fetch(`/api/settings/store-status${q}`)
      ]);

      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData);
      }
      if (enginesRes.ok) {
        const enginesData = await enginesRes.json();
        setEngines(enginesData);
      }
      if (statusRes.ok) setStoreStatus(await statusRes.json());
    } catch (err: any) {
      console.error(err);
      setActionError("Failed to fetch settings configuration metadata.");
    } finally {
      setLoadingAgents(false);
      setLoadingEngines(false);
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, [store.url]);

  useEffect(() => {
    const themeAgent = agents.find(a => a.agentId === "theme_editor_ai_agent");
    if (themeAgent) {
      setTempEngineId(themeAgent.engineId || "gemini");
      setTempModel(themeAgent.model || "gemini-1.5-flash");
    }
  }, [agents]);

  const handleToggleAgent = async (agentId: string, currentEnabled: boolean) => {
    setActionError(null);
    try {
      const q = `?shop=${encodeURIComponent(store.url)}`;
      const res = await fetch(`/api/settings/agents/${agentId}${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          enabled: !currentEnabled,
          engineId: tempEngineId,
          model: tempModel
        })
      });

      if (!res.ok) {
        throw new Error('Failed to update agent installation status.');
      }
      
      const result = await res.json();
      setAgents(prev => prev.map(a => a.agentId === agentId ? { ...a, enabled: result.enabled, status: result.status } : a));
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || "Failed to toggle agent.");
    }
  };

  const handleSaveAssignment = async (agentId: string) => {
    setActionError(null);
    setSavingAssignment(true);
    try {
      const q = `?shop=${encodeURIComponent(store.url)}`;
      const res = await fetch(`/api/settings/agents/${agentId}${q}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engineId: tempEngineId,
          model: tempModel
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update agent assignment.');
      }
      
      const result = await res.json();
      setAgents(prev => prev.map(a => a.agentId === agentId ? { ...a, engineId: result.engineId, model: result.model } : a));
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || "Failed to save engine assignment.");
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleTestConnection = async (engineId: string) => {
    setTestingConnection(engineId);
    setTestResult(null);
    try {
      const q = `?shop=${encodeURIComponent(store.url)}`;
      const res = await fetch(`/api/settings/ai-engines/${engineId}/test${q}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
        fetchSettingsData();
      } else {
        throw new Error("Failed to execute connection test.");
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        statusMessage: err.message || "Connection test failed."
      });
    } finally {
      setTestingConnection(null);
    }
  };

  const handleConnectStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeInput.trim()) return;
    onConnect(storeInput, ["read_themes", "write_themes", "read_products", "read_orders"]);
  };

  // Onboarding progress calculation
  const hasStoreConnected = store.connected;
  const hasThemeScopes = store.connected && store.scopes.includes("read_themes") && store.scopes.includes("write_themes");
  const geminiEngine = engines.find(e => e.engineId === "gemini");
  const isGeminiConfigured = geminiEngine?.configured || false;
  const isAgentEnabled = agents.find(a => a.agentId === "theme_editor_ai_agent")?.enabled || false;

  const steps = [
    { title: "Connect Shopify Store", desc: "Link your Shopify store securely via OAuth connection.", completed: hasStoreConnected },
    { title: "Authorize Theme Permissions", desc: "Grant read_themes and write_themes API scopes.", completed: hasThemeScopes },
    { title: "Configure backend AI Engine", desc: "Inject Gemini API key securely in the server context.", completed: isGeminiConfigured },
    { title: "Enable Theme Editor Agent", desc: "Activate Theme Editor AI Agent under settings.", completed: isAgentEnabled }
  ];

  const completedStepsCount = steps.filter(s => s.completed).length;
  const completionPercentage = Math.round((completedStepsCount / steps.length) * 100);

  // Dynamic Status Resolvers
  const getAgentStatus = (agent: AgentSetting) => {
    if (!agent.enabled) return "Agent disabled";
    if (!hasThemeScopes) return "Missing Shopify permissions";
    if (agent.engineId === "gemini" && !isGeminiConfigured) return "Engine not configured";
    return "Ready";
  };

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "Ready":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Engine not configured":
        return "bg-amber-50 text-amber-700 border-amber-200 animate-pulse";
      case "Missing Shopify permissions":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-500 border-slate-200";
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md">
              <SettingsIcon className="w-5 h-5" />
            </div>
            Merchant Control Center Settings
          </h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Configure secure credentials, manage specialized AI agents, and monitor connection health interfaces.
          </p>
        </div>
      </div>

      {actionError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-xs text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold block">Settings Action Alert</span>
            <p className="mt-1 font-medium">{actionError}</p>
          </div>
        </div>
      )}

      {/* Onboarding & Setup Progress (Glassmorphism & harmonic layout) */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
          <Sparkles className="w-32 h-32 text-indigo-400" />
        </div>
        
        <div className="max-w-2xl space-y-5 relative z-10">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
              Onboarding Checklist
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {completedStepsCount} of {steps.length} completed
            </span>
          </div>

          <h2 className="text-lg font-bold tracking-tight text-white leading-snug">
            Setup Theme Editor AI Agent MVP
          </h2>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
              <span>Overall Completion Status</span>
              <span className="text-indigo-400 font-bold">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-2 rounded-full transition-all duration-500" 
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
          </div>

          {/* Onboarding Checklist Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3">
            {steps.map((step, idx) => (
              <div 
                key={idx} 
                className={`p-3.5 rounded-xl border flex gap-3 text-left transition-all ${
                  step.completed 
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-100' 
                    : 'bg-slate-850/40 border-slate-800 text-slate-400 opacity-75'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                  step.completed 
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950' 
                    : 'border-slate-700 text-slate-500'
                }`}>
                  {step.completed ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : (
                    <span className="text-[10px] font-bold font-mono">{idx + 1}</span>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-bold leading-tight">{step.title}</h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Connection Credentials (Left Column - Spans 2) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Store Connection Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${
                  store.connected 
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                    : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 leading-none">Shopify Store Credentials</h2>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {store.connected 
                      ? 'Secure active OAuth store link.' 
                      : 'Provide your Shopify URL to initiate connection.'}
                  </p>
                </div>
              </div>

              {store.connected && (
                <button
                  onClick={onDisconnect}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition border border-rose-100 cursor-pointer disabled:opacity-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              )}
            </div>

            {store.connected ? (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shop Name</span>
                    <span className="text-sm font-bold text-slate-800 mt-1 block">{store.name}</span>
                    <span className="text-[11px] font-mono text-slate-500 block mt-0.5">{store.url}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Auth Status</span>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-xs font-bold text-slate-800">CONNECTED (OAuth)</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-1">
                      Installed: {store.connectedAt ? new Date(store.connectedAt).toLocaleDateString() : 'Active'}
                    </span>
                  </div>
                </div>

                {/* API Scope Verification */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Authorized API Permissions / Scopes
                  </span>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {store.scopes.map(scope => {
                      const isThemeScope = scope === "read_themes" || scope === "write_themes";
                      return (
                        <span 
                          key={scope} 
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono font-bold rounded-full border ${
                            isThemeScope 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-indigo-50 text-indigo-700 border-indigo-150'
                          }`}
                        >
                          {isThemeScope && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                          {scope}
                        </span>
                      );
                    })}
                  </div>
                  
                  {!hasThemeScopes && (
                    <div className="bg-rose-50 border border-rose-150 rounded-xl p-3.5 flex items-start gap-2.5 mt-3 text-xs text-rose-800 leading-normal">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Action Required: Missing Theme Editing Scopes!</strong>
                        <p className="text-[11px] text-rose-700 mt-1">
                          The current store connection does not have permission to read/write theme files. To enable Theme Editor AI Agent MVP editing actions, please re-authenticate to request the scopes.
                        </p>
                        <a 
                          href={`/api/shopify/oauth/install?shop=${encodeURIComponent(store.url)}`}
                          className="inline-flex items-center gap-1 mt-2.5 text-[10px] font-bold bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 transition"
                        >
                          Request Theme Scopes
                          <Link2 className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6">
                <form onSubmit={handleConnectStore} className="space-y-4 max-w-xl">
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
                        placeholder="test-store.myshopify.com"
                        className="w-full pl-18 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-slate-900"
                        required
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      Enter your myshopify store domain. This initiates a secure OAuth token exchange handshake.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="inline-flex items-center gap-2 px-4.5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition duration-150 cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      <span>Initialize Secure Connection</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Dynamic Agent Installation Switches & Assignment */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-sm font-bold text-slate-900 leading-none">Specialized Team Agents</h2>
              <p className="text-xs text-slate-500 mt-1.5">
                Enable or disable agent profiles available for your store. Enabled agents will show in your active navigation list.
              </p>
            </div>

            {loadingAgents ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                Loading agent installations...
              </div>
            ) : (
              <div className="p-5 divide-y divide-slate-100">
                {agents.map(agent => {
                  const agentStatus = getAgentStatus(agent);
                  return (
                    <div key={agent.agentId} className="py-4 first:pt-0 last:pb-0 space-y-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="space-y-1.5 max-w-xl">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">{agent.name}</span>
                            <span className={`px-2 py-0.5 text-[9px] font-mono font-bold rounded-full ${
                              agent.enabled 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}>
                              {agent.enabled ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-550 leading-relaxed text-slate-500">{agent.description}</p>
                          
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 pt-1">
                            <span className="font-bold">Required scopes:</span>
                            {agent.requiredPermissions.map(p => (
                              <span key={p} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{p}</span>
                            ))}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <button
                            onClick={() => handleToggleAgent(agent.agentId, agent.enabled)}
                            className={`w-12 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 outline-none ${
                              agent.enabled ? 'bg-indigo-600' : 'bg-slate-200'
                            }`}
                          >
                            <div
                              className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ${
                                agent.enabled ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            ></div>
                          </button>
                        </div>
                      </div>

                      {/* Dropdowns and System Engine Assignment Card */}
                      {agent.agentId === "theme_editor_ai_agent" && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Assigned AI Engine
                              </label>
                              <select
                                value={tempEngineId}
                                onChange={(e) => setTempEngineId(e.target.value)}
                                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              >
                                <option value="gemini">Gemini (System Managed)</option>
                              </select>
                            </div>
                            
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                AI Model
                              </label>
                              <select
                                value={tempModel}
                                onChange={(e) => setTempModel(e.target.value)}
                                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              >
                                {geminiEngine?.supportedModels.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status:</span>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold rounded-full border ${getStatusStyles(agentStatus)}`}>
                                {agentStatus}
                              </span>
                            </div>
                            
                            <button
                              onClick={() => handleSaveAssignment(agent.agentId)}
                              disabled={savingAssignment || !hasStoreConnected}
                              className="px-4.5 py-1.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
                            >
                              {savingAssignment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Save Configuration
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* AI Provider & Infrastructure Engine (Right Column - Spans 1) */}
        <div className="space-y-6">
          
          {/* AI Engines Registry Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/70 flex items-center gap-2.5">
              <Cpu className="w-4 h-4 text-indigo-500" />
              <div>
                <h2 className="text-sm font-bold text-slate-900 leading-none">System AI Engines</h2>
                <p className="text-3xs text-slate-400 mt-1 uppercase font-mono tracking-wider">System-Level Registry</p>
              </div>
            </div>

            {loadingEngines ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                Querying engine interfaces...
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {engines.map(e => (
                  <div key={e.engineId} className="space-y-3.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xs font-bold text-slate-800">{e.displayName}</h3>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Default model: {e.defaultModel}</p>
                      </div>
                      
                      <span className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded-full ${
                        e.configured 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-rose-50 text-rose-700 border border-rose-100 animate-pulse'
                      }`}>
                        {e.configured ? 'Configured' : 'Not Configured'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Credentials: Managed by Softify</span>
                        <span>Source: {e.credentialSource}</span>
                      </div>

                      <button
                        onClick={() => handleTestConnection(e.engineId)}
                        disabled={testingConnection === e.engineId || !hasStoreConnected}
                        className="w-full py-2 text-center text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl border border-slate-250 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {testingConnection === e.engineId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                        Test Connection
                      </button>
                    </div>

                    {/* Test Results Display */}
                    {testResult && testResult.provider === e.provider && (
                      <div className={`p-3 rounded-xl border text-[10px] leading-normal flex gap-2 ${
                        testResult.success 
                          ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' 
                          : 'bg-rose-50/50 border-rose-100 text-rose-800'
                      }`}>
                        {testResult.success ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <strong>{testResult.success ? "Test Succeeded:" : "Test Failed:"}</strong>
                          <p className="mt-0.5">{testResult.statusMessage}</p>
                          {testResult.testedAt && (
                            <span className="text-[9px] text-slate-400 font-mono block mt-1">
                              Tested at: {new Date(testResult.testedAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Engine Info Cards */}
                    {e.configured ? (
                      <div className="p-3 bg-emerald-50/30 border border-emerald-100 rounded-xl flex gap-2 text-[10px] text-slate-600 leading-normal">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>
                          <strong>Engine Ready:</strong> Gemini AI credentials injected successfully. Telemetry and prompt gateways are operational.
                        </span>
                      </div>
                    ) : (
                      <div className="p-3 bg-rose-50/30 border border-rose-100 rounded-xl space-y-2 text-[10px] text-rose-800 leading-normal">
                        <div className="flex gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span>
                            <strong>Setup Required:</strong> Backend `GEMINI_API_KEY` credential is missing from Express env parameters.
                          </span>
                        </div>
                        <p className="text-slate-500 leading-normal text-3xs pl-5">
                          Expose `GEMINI_API_KEY` in your workspace `.env` file or environment variables, then reload the server to authorize agent planning scripts.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Secure Boundaries Guard */}
          <div className="bg-slate-900 text-slate-300 rounded-2xl p-5 space-y-4 border border-slate-800 relative overflow-hidden shadow-md">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Safe Boundary Shields
              </h3>
            </div>
            
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Theme Editor operates behind a high-security container. The planning service is strictly decoupled from Shopify writes:
            </p>

            <div className="space-y-3 font-mono text-[9px] pt-1 text-slate-400">
              <div className="flex gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>**Preflight Backups**: Every write registers a full snapshot inside the Firestore `theme_backups` collection.</span>
              </div>
              <div className="flex gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>**Zero Token Leakage**: The AI service never receives raw API access tokens.</span>
              </div>
              <div className="flex gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>**Path Allowlist**: Folder layout checks prevent hidden files and directory traversals (`..`).</span>
              </div>
              <div className="flex gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>**Merchant Confirmation Gate**: Mutations are locked until the owner signs explicit confirmation cards.</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[9px] text-slate-400 italic font-medium leading-relaxed">
              “Softify manages AI engine connections at the system level. Your team only chooses which enabled engine powers each agent. API keys are never shown in the merchant interface.”
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
