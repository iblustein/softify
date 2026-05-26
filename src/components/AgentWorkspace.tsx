import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Cpu, 
  RefreshCw, 
  AlertCircle, 
  Play, 
  CheckCircle2, 
  Trash2, 
  FileCheck, 
  Info,
  Clock,
  ShieldCheck,
  Terminal
} from 'lucide-react';

interface AgentWorkspaceProps {
  shopQuery: string;
  onRefreshStats: () => Promise<void>;
}

interface Agent {
  agentId: string;
  name: string;
  description: string;
  category: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Low/Medium';
  executionMode: 'APPROVAL_REQUIRED' | 'NOT_EXECUTABLE';
  supportedCapabilities: string[];
  requiredPermissions: string[];
  canRecommend: boolean;
  canDraft: boolean;
  version: string;
}

interface AgentRun {
  id: string;
  agentId: string;
  agentVersion: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  mode: 'RECOMMEND' | 'DRAFT';
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  recommendationCount: number;
  proposedActionCount: number;
}

interface Recommendation {
  id: string;
  agentId: string;
  resourceType: string;
  resourceId: string;
  recommendationType: string;
  title: string;
  summary: string;
  reasoningSummary: string;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  status: 'OPEN' | 'DISMISSED' | 'CONVERTED_TO_ACTION' | 'SUPERSEDED';
  createdAt: string;
}

interface ProposedAction {
  id: string;
  agentId: string;
  recommendationId: string;
  targetType: 'PRODUCT';
  targetId: string;
  title: string;
  description: string;
  actionType: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  executionMode: 'DRAFT_ONLY' | 'APPROVAL_REQUIRED' | 'NOT_EXECUTABLE';
  changes: {
    title?: string;
    vendor?: string;
    productType?: string;
    status?: string;
    tags?: string[];
  };
  approvalRequestId?: string;
  status: 'DRAFT' | 'APPROVAL_ELIGIBLE' | 'APPROVAL_REQUESTED' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'DISMISSED' | 'BLOCKED';
  createdAt: string;
}

export default function AgentWorkspace({ shopQuery, onRefreshStats }: AgentWorkspaceProps) {
  // Navigation tabs: 'control_center' or 'analytics'
  const [activeTab, setActiveTab] = useState<'control_center' | 'analytics'>('control_center');

  // Control Center States
  const [catalog, setCatalog] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [proposedActions, setProposedActions] = useState<ProposedAction[]>([]);
  
  // UI Controls
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<'RECOMMEND' | 'DRAFT'>('RECOMMEND');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeConsoleLog, setActiveConsoleLog] = useState<string>('// Workspace Idle...\n// Choose an agent and click "Launch Diagnostic Scan".');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  // Analytics States
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [runsData, setRunsData] = useState<any>(null);
  const [recsData, setRecsData] = useState<any>(null);
  const [actionsData, setActionsData] = useState<any>(null);
  const [conversionData, setConversionData] = useState<any>(null);
  const [timelineData, setTimelineData] = useState<any[]>([]);

  // Analytics Filter States
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('30d');

  const fetchCatalogAndWorkspaceData = async () => {
    setErrorText(null);
    try {
      const [catRes, runsRes, recsRes, actsRes] = await Promise.all([
        fetch('/api/agents/catalog'),
        fetch(`/api/agent-runs${shopQuery}`),
        fetch(`/api/recommendations${shopQuery}`),
        fetch(`/api/proposed-actions${shopQuery}`)
      ]);

      if (catRes.ok && runsRes.ok && recsRes.ok && actsRes.ok) {
        setCatalog(await catRes.json());
        setRuns(await runsRes.json());
        
        const recList = await recsRes.json();
        setRecommendations(recList.filter((r: any) => r.status === 'OPEN'));

        const actList = await actsRes.json();
        setProposedActions(actList.filter((a: any) => a.status === 'DRAFT' || a.status === 'APPROVAL_ELIGIBLE' || a.status === 'APPROVAL_REQUESTED'));
      }
    } catch (err) {
      console.error(err);
      setErrorText('Failed to sync Workspace catalog data.');
    }
  };

  const fetchAnalyticsData = async () => {
    setAnalyticsLoading(true);
    try {
      // Calculate date filters dynamically
      let dateFrom: string | undefined = undefined;
      const now = new Date();
      if (dateRange === '7d') {
        const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dateFrom = d.toISOString();
      } else if (dateRange === '30d') {
        const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFrom = d.toISOString();
      }

      const dateParams = dateFrom ? `&dateFrom=${encodeURIComponent(dateFrom)}` : '';
      const agentParam = agentFilter ? `&agentId=${encodeURIComponent(agentFilter)}` : '';

      const [summaryRes, runsRes, recsRes, actionsRes, conversionRes, timelineRes] = await Promise.all([
        fetch(`/api/workspace/analytics/summary${shopQuery}${dateParams}`),
        fetch(`/api/workspace/analytics/agent-runs${shopQuery}${dateParams}${agentParam}`),
        fetch(`/api/workspace/analytics/recommendations${shopQuery}${dateParams}${agentParam}`),
        fetch(`/api/workspace/analytics/proposed-actions${shopQuery}${dateParams}${agentParam}`),
        fetch(`/api/workspace/analytics/approval-conversion${shopQuery}${dateParams}${agentParam}`),
        fetch(`/api/workspace/analytics/timeline${shopQuery}${dateParams}${agentParam}&limit=30`)
      ]);

      if (summaryRes.ok && runsRes.ok && recsRes.ok && actionsRes.ok && conversionRes.ok && timelineRes.ok) {
        setSummaryData((await summaryRes.json()).summary);
        setRunsData(await runsRes.json());
        setRecsData(await recsRes.json());
        setActionsData(await actionsRes.json());
        setConversionData(await conversionRes.json());
        setTimelineData((await timelineRes.json()).timeline || []);
      }
    } catch (err) {
      console.error('Failed to load workspace analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogAndWorkspaceData();
  }, [shopQuery]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalyticsData();
    }
  }, [activeTab, agentFilter, dateRange, shopQuery]);

  const handleLaunchRun = async () => {
    if (!selectedAgentId) return;
    setIsRunning(true);
    setErrorText(null);
    setActiveConsoleLog('// Initiating safe, tenant-scoped diagnostic context resolver...\n// Scanner running in RECOMMEND/DRAFT safe isolation bounds.');

    try {
      const targetAgent = catalog.find(a => a.agentId === selectedAgentId);
      setActiveConsoleLog(prev => prev + `\n// Running deterministic heuristic workspace calculations for ${targetAgent?.name}...`);
      
      const res = await fetch(`/api/agent-runs${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          mode: selectedMode,
          scope: { type: 'SHOP' }
        })
      });

      if (!res.ok) throw new Error('Workspace scanner returned error handshake.');
      const newRun = await res.json();
      
      setActiveConsoleLog(prev => prev + `\n// Complete! Status: ${newRun.status}\n// Summary: ${newRun.summary}`);
      await fetchCatalogAndWorkspaceData();
      await onRefreshStats();
    } catch (err: any) {
      setErrorText(err.message || 'Scans connection lost.');
      setActiveConsoleLog(prev => prev + `\n// [ERROR] Diagnostic failed: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleDismissRecommendation = async (id: string) => {
    setErrorText(null);
    try {
      const res = await fetch(`/api/recommendations/${id}/dismiss${shopQuery}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Dismiss handshake failed.');
      setRecommendations(prev => prev.filter(r => r.id !== id));
      await onRefreshStats();
    } catch (err: any) {
      setErrorText(err.message || 'Failed to dismiss recommendation.');
    }
  };

  const handleDismissProposedAction = async (id: string) => {
    setErrorText(null);
    try {
      const res = await fetch(`/api/proposed-actions/${id}/dismiss${shopQuery}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Dismiss proposed action failed.');
      setProposedActions(prev => prev.filter(a => a.id !== id));
      await onRefreshStats();
    } catch (err: any) {
      setErrorText(err.message || 'Failed to dismiss proposed action.');
    }
  };

  const handleRequestApproval = async (id: string) => {
    setErrorText(null);
    setRequestingId(id);
    try {
      const res = await fetch(`/api/proposed-actions/${id}/request-approval${shopQuery}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to request merchant approval.');
      const updated = await res.json();
      setProposedActions(prev => prev.map(a => a.id === id ? updated : a));
      await fetchCatalogAndWorkspaceData();
      await onRefreshStats();
    } catch (err: any) {
      setErrorText(err.message || 'Bridge request failed.');
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 uppercase">
            <Sparkles className="w-5 h-5 text-indigo-600 shrink-0" />
            Product Multi-Agent Workspace
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Analyze catalog compliance warnings and review safe product metadata suggestions in a sandbox environment.
          </p>
        </div>
        <div className="flex gap-2">
          {/* Tab Selection buttons */}
          <div className="bg-slate-100 p-1 rounded-xl flex border border-slate-200">
            <button
              onClick={() => setActiveTab('control_center')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'control_center'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Control Center
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-white text-slate-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Workspace Analytics
            </button>
          </div>
          <button
            onClick={activeTab === 'analytics' ? fetchAnalyticsData : fetchCatalogAndWorkspaceData}
            disabled={activeTab === 'analytics' && analyticsLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-xl text-3xs font-bold shadow-2xs transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeTab === 'analytics' && analyticsLoading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Sandboxed Safety Banner */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm text-slate-300 text-xs flex items-start gap-3 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="p-2 bg-indigo-950 border border-indigo-900 text-indigo-400 rounded-xl shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-white font-bold tracking-tight text-3xs uppercase font-mono mb-0.5">Sandboxed Environment</h4>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Workspace agents suggest changes for your review. No mutations are ever written to your live store without explicit merchant approval and execution.
          </p>
        </div>
      </div>

      {errorText && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{errorText}</span>
        </div>
      )}

      {activeTab === 'control_center' ? (
        <>
          {/* Grid 1: Available Agents Registry Catalog */}
          <div className="space-y-3">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Registered Catalog Agents
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {catalog.map(agent => {
                const isTheme = agent.agentId === 'design_review_agent';
                return (
                  <div key={agent.agentId} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col justify-between relative overflow-hidden">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="p-2 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <span className={`px-2 py-0.5 rounded-full font-mono text-[8px] font-bold uppercase tracking-wider ${
                          isTheme 
                            ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                        }`}>
                          {agent.executionMode}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900">{agent.name}</h3>
                        <p className="text-3xs text-slate-400 font-mono mt-0.5">v{agent.version} • Scopes: {agent.requiredPermissions.join(', ') || 'none'}</p>
                      </div>
                      <p className="text-3xs text-slate-500 leading-snug line-clamp-3">
                        {agent.description}
                      </p>
                    </div>
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-mono mt-3">
                      <span className="flex items-center gap-1 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        {agent.riskLevel} Risk
                      </span>
                      <button
                        onClick={() => {
                          setSelectedAgentId(agent.agentId);
                          setSelectedMode(agent.canDraft ? 'DRAFT' : 'RECOMMEND');
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-bold uppercase cursor-pointer"
                      >
                        Select Agent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid 2: Run Launcher & Log Console */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Launcher controls */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs flex flex-col justify-between relative overflow-hidden">
              {isRunning && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center z-10 space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-900">Diagnostic Scanner Active</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 font-sans font-bold">Scoping store listing catalog...</p>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase">Scanner Settings</h3>
                  <p className="text-3xs text-slate-400 mt-0.5">Launch a dynamic workspace diagnostic run session.</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-3xs font-bold text-slate-400 uppercase">Select Target Agent</label>
                    <select
                      value={selectedAgentId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedAgentId(id);
                        const selected = catalog.find(a => a.agentId === id);
                        if (selected && !selected.canDraft) {
                          setSelectedMode('RECOMMEND');
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400"
                    >
                      <option value="">-- Choose Agent --</option>
                      {catalog.map(a => (
                        <option key={a.agentId} value={a.agentId}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-3xs font-bold text-slate-400 uppercase">Execution Mode</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMode('RECOMMEND')}
                        disabled={!selectedAgentId}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                          selectedMode === 'RECOMMEND'
                            ? 'bg-indigo-650 bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        RECOMMEND
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedMode('DRAFT')}
                        disabled={!selectedAgentId || !(catalog.find(a => a.agentId === selectedAgentId)?.canDraft)}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition ${
                          selectedMode === 'DRAFT'
                            ? 'bg-indigo-650 bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-350'
                        }`}
                      >
                        DRAFT ONLY
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-6 flex justify-between items-center text-3xs">
                <span className="text-slate-400 font-mono">SCOPED: STORE</span>
                <button
                  onClick={handleLaunchRun}
                  disabled={isRunning || !selectedAgentId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-xl shadow-2xs transition cursor-pointer"
                >
                  {isRunning ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Launch Diagnostic Scan
                </button>
              </div>
            </div>

            {/* Streaming console */}
            <div className="lg:col-span-3 bg-slate-900 rounded-2xl border border-slate-800 p-4 shadow-sm flex flex-col justify-between min-h-64 overflow-hidden font-mono">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2 text-[10px] text-slate-400">
                <span className="font-bold flex items-center gap-1.5 uppercase">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  Diagnostic Logs Monitor
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-900/40 font-bold uppercase text-[8px]">
                  WORKSPACE_SCANNER
                </span>
              </div>
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-300 leading-normal my-3 overflow-y-auto max-h-48 whitespace-pre-wrap">
                {activeConsoleLog}
              </div>
              <div className="text-[9px] text-slate-500 text-right uppercase tracking-wider">
                Sandboxed Telemetry Scrubber active
              </div>
            </div>
          </div>          {/* Grid 3: Active Recommendations and Proposed Actions lists */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Recommendations block */}
            <div className="space-y-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                Active Recommendations Center ({recommendations.length})
              </span>
              {recommendations.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-205 bg-white rounded-3xl text-center text-xs text-slate-400 space-y-3 shadow-3xs">
                  <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="max-w-xs mx-auto space-y-1">
                    <p className="font-bold text-slate-800 text-sm">Your Catalog is optimized</p>
                    <p className="text-3xs text-slate-500 leading-relaxed font-sans">
                      Select the Product Intelligence Agent above to inspect metadata completeness and scan for new optimization opportunities.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {recommendations.map(rec => {
                    let impactColor = 'bg-slate-50 text-slate-700 border-slate-200';
                    if (rec.impactLevel === 'HIGH') impactColor = 'bg-indigo-50 text-indigo-700 border-indigo-200 font-extrabold';
                    else if (rec.impactLevel === 'MEDIUM') impactColor = 'bg-amber-50 text-amber-700 border-amber-200 font-bold';
                    
                    return (
                      <div key={rec.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 hover:shadow-2xs transition duration-200">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1.5">
                            <h4 className="text-xs font-bold text-slate-900">{rec.title}</h4>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[8px] bg-slate-100 border border-slate-200 text-slate-600 font-mono uppercase tracking-wider px-2 py-0.5 rounded">
                                Agent: {rec.agentId}
                              </span>
                              <span className={`text-[8px] border font-mono uppercase tracking-wider px-2 py-0.5 rounded ${impactColor}`}>
                                IMPACT: {rec.impactLevel}
                              </span>
                              <span className="text-[8px] bg-emerald-50 border border-emerald-100 text-emerald-705 text-emerald-700 font-mono uppercase tracking-wider px-2 py-0.5 rounded font-bold">
                                Confidence: {Math.round(rec.confidence * 100)}%
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDismissRecommendation(rec.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                            title="Dismiss Alert"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-3xs text-slate-600 leading-relaxed font-sans">
                          {rec.summary}
                        </p>
                        <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-2.5 text-[9px] text-slate-500 leading-normal font-sans">
                          <strong className="text-slate-700">Safe Recommendation Rationale:</strong> {rec.reasoningSummary}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Proposed Actions block */}
            <div className="space-y-3">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                Proposed Action Sandbox ({proposedActions.length})
              </span>
              {proposedActions.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-205 bg-white rounded-3xl text-center text-xs text-slate-400 space-y-3 shadow-3xs">
                  <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div className="max-w-xs mx-auto space-y-1">
                    <p className="font-bold text-slate-800 text-sm">No Draft Updates in Inbox</p>
                    <p className="text-3xs text-slate-500 leading-relaxed font-sans">
                      Once you launch an optimization scan in DRAFT mode, proposed storefront revision suggestions will be staged here for your secure audit.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                  {proposedActions.map(act => {
                    const isRequested = act.status === 'APPROVAL_REQUESTED';
                    const isExecutable = act.executionMode === 'APPROVAL_REQUIRED';
                    return (
                      <div key={act.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3 relative overflow-hidden hover:shadow-2xs transition duration-200">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">{act.title}</h4>
                            <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block mt-1">
                              Agent: {act.agentId} • Risk: {act.riskLevel}
                            </span>
                          </div>
                          {!isRequested && (
                            <button
                              onClick={() => handleDismissProposedAction(act.id)}
                              disabled={requestingId === act.id}
                              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                              title="Discard Draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-3xs text-slate-550 text-slate-650 leading-relaxed font-sans">
                          {act.description}
                        </p>

                        {/* Sanitized side-by-side allowlisted Before/After comparison blocks */}
                        <div className="bg-slate-50/65 border border-slate-150 rounded-xl p-3.5 space-y-3">
                          <span className="block text-[8px] font-bold text-slate-400 font-mono uppercase tracking-wider leading-none">
                            Sanitized Proposed Modifications
                          </span>
                          <div className="space-y-2.5 max-h-48 overflow-y-auto pr-0.5">
                            {Object.entries(act.changes)
                              .filter(([key]) => ['title', 'vendor', 'productType', 'status', 'tags'].includes(key))
                              .map(([key, value]) => {
                                const beforeText = "Status: Sync storefront snap properties";
                                let afterText = typeof value === 'object' && Array.isArray(value) ? value.join(', ') : String(value);
                                
                                return (
                                  <div key={key} className="space-y-1.5">
                                    <div className="text-[8px] font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded w-max uppercase tracking-wider leading-none">
                                      {key.replace(/([A-Z])/g, ' $1')}
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2 text-[9px] leading-relaxed">
                                      <div className="bg-red-50/20 border border-red-100 rounded-lg p-2 text-red-800">
                                        <span className="block text-[7px] text-red-500 font-sans font-bold uppercase tracking-wider mb-1 leading-none">- BEFORE</span>
                                        {beforeText}
                                      </div>
                                      <div className="bg-emerald-50/20 border border-emerald-100 rounded-lg p-2 text-emerald-950 font-bold">
                                        <span className="block text-[7px] text-emerald-600 font-sans font-bold uppercase tracking-wider mb-1 leading-none">+ AFTER</span>
                                        {afterText}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-3 text-3xs">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase border text-[8px] ${
                            isRequested 
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                              : 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse'
                          }`}>
                            {act.status}
                          </span>
                          
                          {isExecutable && !isRequested && (
                            <button
                              onClick={() => handleRequestApproval(act.id)}
                              disabled={requestingId === act.id}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs transition cursor-pointer leading-none disabled:opacity-50"
                            >
                              {requestingId === act.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileCheck className="w-3.5 h-3.5" />
                              )}
                              <span>{requestingId === act.id ? 'Requesting...' : 'Request Merchant Approval'}</span>
                            </button>
                          )}
                          
                          {isRequested && act.approvalRequestId && (
                            <span className="text-4xs text-indigo-400 font-mono flex items-center gap-1">
                              <Clock className="w-3 h-3 animate-spin" />
                              Bridged: {act.approvalRequestId}
                            </span>
                          )}
                          
                          {!isExecutable && (
                            <span className="text-4xs text-slate-500 font-mono flex items-center gap-1 font-bold">
                              <ShieldCheck className="w-3 h-3 text-slate-400" />
                              NOT_EXECUTABLE
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* Tab 2: Safe Workspace Analytics Panel */
        <div className="space-y-6">
          {/* Analytics Filters Control Strip */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-slate-50 border border-slate-200 rounded-2xl p-4.5">
            <div>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Workspace Analytics Panel</span>
              <p className="text-[10px] text-slate-450 mt-0.5">Scrutinize operational counts, diagnostic durations, and pipeline status conversion.</p>
            </div>
            <div className="flex gap-2.5">
              {/* Date range filter */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer focus:border-indigo-405"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="all">All-Time</option>
              </select>
              {/* Agent ID filter */}
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer focus:border-indigo-405"
              >
                <option value="">All Scoped Agents</option>
                {catalog.map(a => (
                  <option key={a.agentId} value={a.agentId}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Metric Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Agent Invocation Runs</span>
              <h3 className="text-xl font-bold text-slate-800">{summaryData?.totalAgentRuns ?? 0}</h3>
              <p className="text-4xs text-slate-400 font-mono">{summaryData?.failedRuns ?? 0} failed • {summaryData?.blockedRuns ?? 0} blocked</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Diagnostic Alerts</span>
              <h3 className="text-xl font-bold text-slate-800">{summaryData?.totalRecommendations ?? 0}</h3>
              <p className="text-4xs text-slate-400 font-mono">{summaryData?.openRecommendations ?? 0} open • {summaryData?.dismissedRecommendations ?? 0} dismissed</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Proposed Metadata Drafts</span>
              <h3 className="text-xl font-bold text-slate-800">{summaryData?.totalProposedActions ?? 0}</h3>
              <p className="text-4xs text-slate-400 font-mono">{summaryData?.executedActions ?? 0} executed • {summaryData?.approvedActions ?? 0} approved</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Bridge Approval Rate</span>
              <h3 className="text-xl font-bold text-slate-800">{summaryData?.approvalConversionRate ?? 0}%</h3>
              <p className="text-4xs text-slate-400 font-mono">{summaryData?.activeAgentsCount ?? 4} active catalog agents</p>
            </div>
          </div>

          {/* SVG Trends Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Daily Agent Scan Trends</h4>
              <p className="text-3xs text-slate-400">Chronological trend of diagnostic scan volumes and failure alerts.</p>
            </div>
            {runsData?.trends && runsData.trends.length > 0 ? (
              <div className="h-48 flex items-end gap-2 pt-6 pb-2 border-b border-slate-100 px-2">
                {runsData.trends.map((t: any, idx: number) => {
                  const maxRuns = Math.max(...runsData.trends.map((trend: any) => trend.runCount), 5);
                  const barHeight = `${(t.runCount / maxRuns) * 100}%`;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                      <div className="w-full flex flex-col justify-end items-center h-full">
                        <div 
                          style={{ height: barHeight }} 
                          className="w-full bg-indigo-500 hover:bg-indigo-650 rounded-t-sm transition-all duration-300 relative"
                        >
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-800 text-white font-mono text-4xs rounded px-1.5 py-0.5 whitespace-nowrap z-10 shadow-md">
                            Scans: {t.runCount} (Failed: {t.failedCount})
                          </div>
                        </div>
                      </div>
                      <span className="text-[8px] text-slate-400 mt-1.5 font-mono">{t.date.substring(5)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-48 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400">
                No scan trends available for this range.
              </div>
            )}
          </div>

          {/* Breakdown progress rows & Timeline stepper grid */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            
            {/* Left Col (2/5): Distributions & Conversion Rates */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Recommendations Impact Distribution</h4>
                  <p className="text-3xs text-slate-400">Count distribution categorized by business optimization impact level.</p>
                </div>
                <div className="space-y-3.5 pt-1">
                  {['HIGH', 'MEDIUM', 'LOW'].map(level => {
                    const count = recsData?.breakdown?.byImpact?.[level] || 0;
                    const total = Object.values(recsData?.breakdown?.byImpact || {}).reduce((a: any, b: any) => a + b, 0) as number || 1;
                    const pct = Math.round((count / total) * 100);
                    const barColor = level === 'HIGH' ? 'bg-indigo-655 bg-indigo-600' : level === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-400';
                    return (
                      <div key={level} className="space-y-1">
                        <div className="flex justify-between text-3xs font-mono">
                          <span className="font-bold text-slate-655 text-slate-600">{level}</span>
                          <span className="text-slate-400">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div style={{ width: `${pct}%` }} className={`h-full ${barColor} rounded-full`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Proposed Actions Execution Modes</h4>
                  <p className="text-3xs text-slate-400">Security risk bounds for metadata draft alterations.</p>
                </div>
                <div className="space-y-3.5 pt-1">
                  {['APPROVAL_REQUIRED', 'DRAFT_ONLY', 'NOT_EXECUTABLE'].map(mode => {
                    const count = actionsData?.breakdown?.byExecutionMode?.[mode] || 0;
                    const total = Object.values(actionsData?.breakdown?.byExecutionMode || {}).reduce((a: any, b: any) => a + b, 0) as number || 1;
                    const pct = Math.round((count / total) * 100);
                    const barColor = mode === 'APPROVAL_REQUIRED' ? 'bg-indigo-655 bg-indigo-600' : mode === 'DRAFT_ONLY' ? 'bg-indigo-400' : 'bg-rose-500';
                    return (
                      <div key={mode} className="space-y-1">
                        <div className="flex justify-between text-3xs font-mono">
                          <span className="font-bold text-slate-655 text-slate-600">{mode.replace('_', ' ')}</span>
                          <span className="text-slate-400">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div style={{ width: `${pct}%` }} className={`h-full ${barColor} rounded-full`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Col (3/5): Operational Timeline stepper */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs space-y-4 min-h-[460px]">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  Workspace Operational Trace Timeline
                </h4>
                <p className="text-3xs text-slate-400">Strictly scrubbed and sanitized chronological log of agent events.</p>
              </div>
              {timelineData && timelineData.length > 0 ? (
                <div className="relative pl-6 space-y-5 border-l border-slate-200 ml-3.5 my-3 pt-2 max-h-[480px] overflow-y-auto pr-1">
                  {timelineData.map((e, idx) => {
                    let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200';
                    if (e.eventType.includes('COMPLETED') || e.eventType.includes('SUCCESS') || e.eventType.includes('APPLIED')) {
                      badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                    } else if (e.eventType.includes('FAILED') || e.eventType.includes('BLOCKED') || e.eventType.includes('BLOCK')) {
                      badgeColor = 'bg-rose-50 text-rose-700 border-rose-100';
                    } else if (e.eventType.includes('REQUESTED') || e.eventType.includes('DECIDED') || e.eventType.includes('DECISION')) {
                      badgeColor = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                    }
                    
                    return (
                      <div key={idx} className="relative group">
                        <div className={`absolute right-full mr-3.5 top-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center translate-x-1.5 ${badgeColor}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-2xs font-bold text-slate-800 uppercase font-mono">{e.eventType.replace(/_/g, ' ')}</span>
                            <span className="text-4xs text-slate-400 font-mono">{new Date(e.timestamp).toLocaleString()}</span>
                          </div>
                          <p className="text-3xs text-slate-600 leading-normal">
                            {e.safeSummary}
                          </p>
                          {e.counts && (
                            <div className="flex gap-2.5 text-[8px] font-mono text-slate-400">
                              <span>Recommendations: {e.counts.recommendationCount}</span>
                              <span>Proposed Actions: {e.counts.proposedActionCount}</span>
                            </div>
                          )}
                          {e.correlationId && (
                            <span className="block text-[8px] font-mono text-slate-400">Trace Correlation: {e.correlationId}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-450 h-64 flex flex-col items-center justify-center">
                  <Info className="w-6 h-6 text-slate-300 mb-2" />
                  No trace timeline records matching this search query.
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
