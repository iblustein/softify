import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Cpu, 
  History, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle, 
  Code, 
  FileText, 
  Layers, 
  ArrowLeftRight, 
  Plus, 
  HelpCircle,
  RefreshCw,
  Eye,
  AlertCircle
} from 'lucide-react';
import { ShopifyStore } from '../types';

interface ThemeEditorChatProps {
  store: ShopifyStore;
  onRefreshStats: () => void;
}

interface Theme {
  id: number | string;
  name: string;
  role: 'main' | 'unpublished' | 'development' | string;
  createdAt: string;
  updatedAt: string;
}

interface Conversation {
  id: string;
  organizationId: string;
  storeConnectionId: string;
  agentId: string;
  shopDomain: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  toolInvocations?: Array<{
    toolName: string;
    args: {
      themeId: string | number;
      assetKey: string;
      riskLevel: 'Low' | 'Medium' | 'High';
      explanation: string;
      value: string;
    };
    status: 'requires_approval' | 'approved' | 'rejected' | 'applied';
  }>;
}

interface EditPlan {
  originalValue: string;
  proposedValue: string;
  assetKey: string;
  themeId: string | number;
  riskLevel: 'Low' | 'Medium' | 'High';
  explanation: string;
}

export default function ThemeEditorChat({
  store,
  onRefreshStats
}: ThemeEditorChatProps) {
  // Theme Target Selection State
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState<string | number>("");
  const [loadingThemes, setLoadingThemes] = useState(false);

  // Conversations State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // User input & thinking steps
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<'idle' | 'thinking' | 'analyzing' | 'planning'>('idle');

  // Proposed diff plans & Apply gates
  const [selectedPlan, setSelectedPlan] = useState<EditPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [liveThemeCheckbox, setLiveThemeCheckbox] = useState(false);
  const [applyingChange, setApplyingChange] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; backupId?: string; fileKey?: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shopQuery = `?shop=${encodeURIComponent(store.url)}`;

  // Scroll to bottom on message updates
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSending, thinkingStep]);

  // Load initial settings and lists
  useEffect(() => {
    if (store.url) {
      loadThemes();
      loadConversations();
    }
  }, [store.url]);

  const loadThemes = async () => {
    setLoadingThemes(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/theme/themes${shopQuery}`);
      if (!res.ok) throw new Error("Failed to retrieve store themes.");
      const data = await res.json();
      setThemes(data);
      // Auto select the unpublished/dev theme if available, otherwise select main (live) theme
      const unpublished = data.find((t: Theme) => t.role !== 'main');
      const mainTheme = data.find((t: Theme) => t.role === 'main');
      if (unpublished) {
        setSelectedThemeId(unpublished.id);
      } else if (mainTheme) {
        setSelectedThemeId(mainTheme.id);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to load store themes.");
    } finally {
      setLoadingThemes(false);
    }
  };

  const loadConversations = async () => {
    setLoadingConversations(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/agents/theme-editor/conversations${shopQuery}`);
      if (!res.ok) throw new Error("Failed to load conversation history.");
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !activeConversationId) {
        loadConversationMessages(data[0].id);
      } else if (data.length === 0) {
        // Automatically start one
        handleStartNewConversation();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to load conversations.");
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadConversationMessages = async (convId: string) => {
    setLoadingMessages(true);
    setActiveConversationId(convId);
    setSelectedPlan(null);
    setApplyResult(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/agents/theme-editor/conversations/${convId}${shopQuery}`);
      if (!res.ok) throw new Error("Failed to load message thread.");
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to load message thread.");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleStartNewConversation = async () => {
    setLoadingMessages(true);
    setErrorMessage(null);
    setSelectedPlan(null);
    setApplyResult(null);
    try {
      const res = await fetch(`/api/agents/theme-editor/conversations${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error("Failed to create new conversation.");
      const newConv = await res.json();
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages(newConv.messages || []);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to create conversation.");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isSending || !activeConversationId) return;

    const userText = inputMessage;
    setInputMessage("");
    setIsSending(true);
    setErrorMessage(null);
    setThinkingStep('thinking');

    // Optimistically push user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId,
      sender: 'user',
      text: userText,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    // Timed step updates for beautiful stepper simulation
    const stepsTimer1 = setTimeout(() => setThinkingStep('analyzing'), 1200);
    const stepsTimer2 = setTimeout(() => setThinkingStep('planning'), 2800);

    try {
      const res = await fetch(`/api/agents/theme-editor/conversations/${activeConversationId}/messages${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          targetThemeId: selectedThemeId
        })
      });

      if (!res.ok) {
        throw new Error("Theme AI response gateway timed out or failed.");
      }

      const data = await res.json();
      // Reload message thread
      loadConversationMessages(activeConversationId);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to submit message to AI Agent.");
    } finally {
      clearTimeout(stepsTimer1);
      clearTimeout(stepsTimer2);
      setIsSending(false);
      setThinkingStep('idle');
    }
  };

  // Soliciting code plans & side-by-side diff previews
  const handleOpenPlanPreview = async (invocation: any) => {
    setLoadingPlan(true);
    setSelectedPlan(null);
    setApplyResult(null);
    setLiveThemeCheckbox(false);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/agents/theme-editor/conversations/${activeConversationId}/plan${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetKey: invocation.args.assetKey,
          newValue: invocation.args.value,
          targetThemeId: invocation.args.themeId || selectedThemeId,
          riskLevel: invocation.args.riskLevel
        })
      });

      if (!res.ok) {
        throw new Error("Failed to solicit proposed code plan differences from backend.");
      }

      const data = await res.json();
      setSelectedPlan({
        originalValue: data.originalValue,
        proposedValue: data.proposedValue,
        assetKey: data.assetKey,
        themeId: data.themeId,
        riskLevel: data.riskLevel,
        explanation: invocation.args.explanation
      });
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to load plan code details.");
    } finally {
      setLoadingPlan(false);
    }
  };

  // Triggers the actual safe transaction update
  const handleApplyProposedPlan = async () => {
    if (!selectedPlan) return;

    const targetTheme = themes.find(t => String(t.id) === String(selectedPlan.themeId));
    const isLive = targetTheme?.role === 'main';

    if (isLive && !liveThemeCheckbox) {
      setErrorMessage("Live storefront writes require checking the live warning confirmation checkbox.");
      return;
    }

    setApplyingChange(true);
    setErrorMessage(null);
    setApplyResult(null);
    try {
      const res = await fetch(`/api/agents/theme-editor/conversations/${activeConversationId}/apply${shopQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeId: selectedPlan.themeId,
          assetKey: selectedPlan.assetKey,
          value: selectedPlan.proposedValue,
          isLiveTheme: isLive,
          liveConfirmation: liveThemeCheckbox
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to deploy theme mutation.");
      }

      const result = await res.json();
      setApplyResult({
        ok: true,
        backupId: result.backupId,
        fileKey: result.fileKey
      });

      // Reload thread
      await loadConversationMessages(activeConversationId);
      onRefreshStats();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Applying theme write failed.");
    } finally {
      setApplyingChange(false);
    }
  };

  const targetTheme = themes.find(t => String(t.id) === String(selectedThemeId));
  const isSelectedThemeLive = targetTheme?.role === 'main';

  // Render Diff helper to highlight simple additions/removals
  const renderDiffContent = (orig: string, proposed: string) => {
    const origLines = orig.split('\n');
    const propLines = proposed.split('\n');

    // Basic heuristic to display simple highlighted side-by-side line diffs
    const maxLines = Math.max(origLines.length, propLines.length);
    const rows = [];

    for (let i = 0; i < maxLines; i++) {
      const left = origLines[i] || "";
      const right = propLines[i] || "";
      
      const isAdded = left !== right && left === "";
      const isRemoved = left !== right && right === "";
      const isModified = left !== right && left !== "" && right !== "";

      rows.push(
        <tr key={i} className="font-mono text-[11px] leading-relaxed select-none">
          <td className="w-12 text-slate-500 text-right pr-3 select-none border-r border-slate-200/50 bg-slate-50/50 font-sans">
            {i + 1}
          </td>
          <td className={`pl-4 pr-2 py-0.5 whitespace-pre break-all ${
            isRemoved ? 'bg-red-50 text-red-700 font-bold' : isModified ? 'bg-amber-50 text-amber-800' : 'text-slate-600'
          }`}>
            {left || " "}
          </td>
          <td className="w-12 text-slate-500 text-right pr-3 select-none border-r border-slate-200/50 bg-slate-50/50 border-l font-sans">
            {i + 1}
          </td>
          <td className={`pl-4 pr-2 py-0.5 whitespace-pre break-all ${
            isAdded ? 'bg-emerald-50 text-emerald-700 font-bold' : isModified ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600'
          }`}>
            {right || " "}
          </td>
        </tr>
      );
    }

    return (
      <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-slate-100/80 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              <th className="w-12 py-2 border-r border-slate-200">Ln</th>
              <th className="py-2 text-left pl-4">Original File Content</th>
              <th className="w-12 py-2 border-r border-slate-200 border-l">Ln</th>
              <th className="py-2 text-left pl-4">Proposed Theme Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, 300)}
            {rows.length > 300 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400 text-3xs italic">
                  Truncated showing first 300 lines...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100vh-100px)] gap-6 animate-fade-in">
      
      {/* 1. Conversations Sidebar Drawer */}
      <div className="w-64 bg-white border border-slate-200 rounded-2xl flex flex-col justify-between shrink-0 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <History className="w-4 h-4 text-slate-550" />
            Theme Chat Logs
          </span>
          
          <button
            onClick={handleStartNewConversation}
            className="p-1 text-indigo-650 hover:bg-indigo-50 hover:text-indigo-850 rounded-lg transition"
            title="Start new conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingConversations ? (
            <div className="py-6 text-center text-3xs text-slate-450 italic">Loading logs...</div>
          ) : conversations.length === 0 ? (
            <div className="py-6 text-center text-3xs text-slate-400">No active logs saved.</div>
          ) : (
            conversations.map(conv => {
              const isActive = conv.id === activeConversationId;
              return (
                <button
                  key={conv.id}
                  onClick={() => loadConversationMessages(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition text-xs flex items-center gap-2.5 ${
                    isActive 
                      ? 'bg-indigo-50 text-indigo-700 font-bold' 
                      : 'hover:bg-slate-50 text-slate-650 font-medium'
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <div className="truncate">
                    <span className="block truncate">{conv.id}</span>
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5 font-normal">
                      {new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Selected target theme information */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Target Shopify Theme
          </label>
          
          {loadingThemes ? (
            <div className="text-[10px] text-slate-400 italic">Querying themes...</div>
          ) : (
            <select
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-800"
            >
              {themes.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.role === 'main' ? '🔥 (Live)' : `(${t.role})`}
                </option>
              ))}
            </select>
          )}

          {isSelectedThemeLive && (
            <div className="bg-amber-50 border border-amber-200/50 rounded-lg p-2 text-[10px] text-amber-700 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-550 shrink-0 mt-0.5" />
              <span>
                <strong>Warning:</strong> You are targeting your <strong>live</strong> theme. Changes will immediately affect customers.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Interactive Conversational Chat Area */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl flex flex-col justify-between overflow-hidden shadow-2xs">
        
        {/* Chat Header Status */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold text-slate-900 leading-none">Theme Editor AI Agent</h2>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold mt-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Shopify, Liquid & JS Expert
              </span>
            </div>
          </div>

          <div className="text-[10px] font-mono text-slate-400 bg-white border border-slate-150 px-2.5 py-1 rounded-lg">
            Shopify: <span className="font-bold text-slate-800">{store.name}</span>
          </div>
        </div>

        {/* Scrollable Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="font-medium">{errorMessage}</p>
            </div>
          )}

          {loadingMessages ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
              <p className="text-xs font-semibold">Reading conversation thread records...</p>
            </div>
          ) : (
            messages.map(msg => {
              const isUser = msg.sender === 'user';
              const isSystem = msg.sender === 'system';
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xl rounded-2xl p-4 shadow-3xs ${
                    isUser 
                      ? 'bg-indigo-600 text-white rounded-br-none' 
                      : isSystem 
                        ? 'bg-slate-50 border border-slate-200 text-slate-700 w-full text-center rounded-none italic py-2'
                        : 'bg-slate-50 border border-slate-150 text-slate-800 rounded-bl-none'
                  }`}>
                    
                    {/* Message Sender */}
                    {!isUser && !isSystem && (
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-600 block mb-1">
                        Theme Agent
                      </span>
                    )}

                    {/* Message Text (Simple new-line markdown parser support) */}
                    <div className="text-xs leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.text}
                    </div>

                    {/* Message Tool Proposal (Diff plan gate cards) */}
                    {msg.toolInvocations && msg.toolInvocations.map((ti, tiIdx) => {
                      const isWriteAction = ti.toolName === "shopify.theme.assets.write";
                      if (isWriteAction) {
                        const isSelectedPlanThis = selectedPlan && selectedPlan.assetKey === ti.args.assetKey;
                        return (
                          <div key={tiIdx} className="mt-4 pt-3.5 border-t border-slate-250 border-slate-200 space-y-3">
                            <div className="bg-slate-100 rounded-xl p-3.5 border border-slate-200 flex flex-col justify-between sm:flex-row sm:items-center gap-3">
                              <div>
                                <span className="text-[9px] font-bold text-indigo-600 uppercase block">Proposed Theme Asset Edit</span>
                                <span className="text-xs font-bold text-slate-800 block mt-1 font-mono">{ti.args.assetKey}</span>
                                <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                                  Risk Level: <span className={`font-bold ${
                                    ti.args.riskLevel === 'High' ? 'text-rose-600' : ti.args.riskLevel === 'Medium' ? 'text-amber-600' : 'text-emerald-600'
                                  }`}>{ti.args.riskLevel}</span>
                                </p>
                              </div>

                              <button
                                onClick={() => handleOpenPlanPreview(ti)}
                                disabled={loadingPlan}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shrink-0 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect Plan Diff</span>
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })}
                    
                    <span className="text-[9px] text-slate-400 font-mono block mt-2 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {/* Assistant Simulation Stepper anims */}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-slate-50 border border-slate-150 rounded-2xl rounded-bl-none p-4 max-w-md space-y-3.5 shadow-3xs">
                <span className="text-[9px] font-extrabold uppercase tracking-wider text-indigo-600 block">
                  Theme Agent
                </span>
                
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 text-xs text-slate-650">
                    <RefreshCw className="w-4 h-4 text-indigo-650 animate-spin" />
                    <span>
                      {thinkingStep === 'thinking' && 'Soliciting layout settings...'}
                      {thinkingStep === 'analyzing' && 'Analyzing liquid sections structure...'}
                      {thinkingStep === 'planning' && 'Solicting Gemini edit plan configurations...'}
                    </span>
                  </div>
                  
                  {/* Faux horizontal tracker dots */}
                  <div className="flex gap-1.5 pl-6">
                    <span className={`w-2 h-2 rounded-full ${thinkingStep === 'thinking' ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-200'}`}></span>
                    <span className={`w-2 h-2 rounded-full ${thinkingStep === 'analyzing' ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-200'}`}></span>
                    <span className={`w-2 h-2 rounded-full ${thinkingStep === 'planning' ? 'bg-indigo-500 animate-pulse' : 'bg-indigo-200'}`}></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Plan inspection block (Dynamic side-by-side modal cards layout) */}
        {selectedPlan && (
          <div className="p-4 border-t border-slate-200 bg-slate-50/90 relative z-25">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-lg animate-slide-up">
              
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Code className="w-4 h-4 text-indigo-500" />
                    Reviewing Proposed File Edit Plan
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500 mt-1">
                    File: <strong className="text-slate-800">{selectedPlan.assetKey}</strong> | Target Theme ID: <strong className="text-slate-800">{selectedPlan.themeId}</strong>
                  </p>
                </div>

                <button
                  onClick={() => { setSelectedPlan(null); setApplyResult(null); }}
                  className="text-xs text-slate-400 hover:text-slate-650 font-bold px-2 rounded hover:bg-slate-100 transition py-1"
                >
                  Dismiss Plan
                </button>
              </div>

              {/* Side-by-side Diff Rendering */}
              {renderDiffContent(selectedPlan.originalValue, selectedPlan.proposedValue)}

              {/* Explanation of changes */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/50">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">AI Explanation & Motivation</span>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed whitespace-pre-line">{selectedPlan.explanation}</p>
              </div>

              {/* Security confirmation and Apply Actions Gating */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 text-white rounded-xl p-4">
                
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-[9px] font-bold font-mono rounded-full ${
                      selectedPlan.riskLevel === 'High' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {selectedPlan.riskLevel} Risk Level
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Durable Preflight snapshot active</span>
                  </div>
                  
                  {isSelectedThemeLive ? (
                    <div className="pt-2">
                      <label className="flex items-start gap-2.5 cursor-pointer text-[11px] text-amber-300 font-semibold select-none leading-normal">
                        <input
                          type="checkbox"
                          checked={liveThemeCheckbox}
                          onChange={(e) => setLiveThemeCheckbox(e.target.checked)}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-350"
                        />
                        <span>I understand this will change my live Shopify theme and affect customers immediately.</span>
                      </label>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Testing on an unpublished/development theme. Safe sandbox editing active.
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedPlan(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  
                  <button
                    onClick={handleApplyProposedPlan}
                    disabled={applyingChange || (isSelectedThemeLive && !liveThemeCheckbox)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-550 to-indigo-650 hover:from-indigo-500 hover:to-indigo-600 disabled:from-slate-750 disabled:to-slate-750 text-white text-xs font-bold rounded-lg transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {applyingChange ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deploying...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Apply Change</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {applyResult && applyResult.ok && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 flex gap-3 text-xs animate-fade-in">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block">Theme Edit Applied Successfully!</span>
                    <p className="mt-1 leading-relaxed">
                      Your change to <strong className="font-mono">{applyResult.fileKey}</strong> has been deployed. 
                      A recovery snapshot was archived in the backup registry.
                    </p>
                    <span className="text-[10px] text-slate-500 block mt-2 font-mono">
                      Backup Transaction ID: {applyResult.backupId}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Message input text form */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-slate-50/30 flex gap-2 shrink-0">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={isSending || !!selectedPlan}
            placeholder={
              selectedPlan 
                ? "Review or dismiss proposed changes plan above before sending more messages..." 
                : "Ask AI Agent to edit theme layout styles or custom liquid sections..."
            }
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 disabled:opacity-60 font-medium"
          />
          
          <button
            type="submit"
            disabled={!inputMessage.trim() || isSending || !!selectedPlan}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-xl transition cursor-pointer"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </form>

      </div>
    </div>
  );
}
