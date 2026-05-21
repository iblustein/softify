import React, { useState, useRef, useEffect } from 'react';
import { 
  Cpu, 
  Send, 
  Bot, 
  User, 
  Layers, 
  Activity, 
  ChevronRight, 
  Play, 
  FileCheck,
  Sparkles,
  RefreshCw,
  Clock,
  ExternalLink
} from 'lucide-react';
import { Agent, OrchestrationMessage } from '../types';

interface SuperAgentUIProps {
  agents: Agent[];
  messages: OrchestrationMessage[];
  onSendMessage: (prompt: string, bypassAgentId?: string) => void;
  isLoading: boolean;
  onNavigateToApprovals: () => void;
}

const SAMPLE_COMMANDS = [
  {
    title: "Optimize Product Descriptions",
    prompt: "Write a high-converting optimized description for the Eco Linen Warm Shirt and draft it as a product update.",
    agentId: "agent_content",
    desc: "Content Agent • Generates description rewrite & files to approvals"
  },
  {
    title: "Check Store Analytics",
    prompt: "Analyze the total week sales revenue metrics and conversion trends.",
    agentId: "agent_analytics",
    desc: "Analytics Agent • Queries sales summaries and lists highest performers"
  },
  {
    title: "Change Theme Layout CSS",
    prompt: "Optimize the Shopify theme primary buttons styling with responsive padding offsets.",
    agentId: "agent_theme_dev",
    desc: "Theme Dev Agent • Submits responsive CSS patch overrides"
  },
  {
    title: "Audit Customer Histories",
    prompt: "Check recent orders and customer queries.",
    agentId: "agent_customer_support",
    desc: "Customer Support Agent • Retries orders and support histories"
  }
];

export default function SuperAgentUI({
  agents,
  messages,
  onSendMessage,
  isLoading,
  onNavigateToApprovals
}: SuperAgentUIProps) {
  const [inputText, setInputText] = useState("");
  const [bypassAgentId, setBypassAgentId] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText.trim(), bypassAgentId ? bypassAgentId : undefined);
    setInputText("");
  };

  const handleSampleClick = (prompt: string, agentId: string) => {
    if (isLoading) return;
    setBypassAgentId(agentId);
    onSendMessage(prompt, agentId);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start h-[calc(100vh-14rem)] min-h-[500px]">
      {/* Central Chat Screen */}
      <div className="xl:col-span-3 flex flex-col bg-white border border-slate-200 rounded-2xl h-full shadow-sm">
        {/* Terminal Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse shrink-0"></div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Super Agent Orchestration Terminal</h3>
              <p className="text-4xs text-slate-400 mt-0.5 uppercase tracking-widest font-mono">Gemini-Managed Routing Active</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-4xs font-mono">
            <Sparkles className="w-3 h-3 text-indigo-500" />
            AI Router Mode: {bypassAgentId ? "Locked" : "Automatic Dynamic"}
          </div>
        </div>

        {/* Message Feeds */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto p-5">
              <Bot className="w-12 h-12 text-indigo-300 mb-3" />
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Control center initialization completed</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed font-sans">
                Enter an instruction to test orchestrator routing logic. Select a sample task below or type custom Shopify requests.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isOrchestrator = msg.sender === 'orchestrator';
              const isUser = msg.sender === 'user';
              const isAgent = msg.sender === 'agent';

              return (
                <div 
                  key={msg.id || index}
                  className={`flex items-start gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Sender icons */}
                  {!isUser && (
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isOrchestrator ? 'bg-slate-900 text-indigo-200 border border-slate-800' : 'bg-indigo-600 text-white shadow-xs'
                    }`}>
                      {isOrchestrator ? <Layers className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                  )}

                  <div className={`max-w-xl rounded-2xl p-4 text-xs leading-relaxed border ${
                    isUser 
                      ? 'bg-indigo-600 text-white border-indigo-700 font-sans' 
                      : isOrchestrator 
                      ? 'bg-slate-50 text-slate-800 border-slate-200' 
                      : 'bg-white text-slate-850 border-slate-205 shadow-sm'
                  }`}>
                    {/* Header line for non-user posts */}
                    {!isUser && (
                      <div className="flex items-center justify-between border-b border-slate-100/60 pb-1.5 mb-2 text-2xs font-bold">
                        <span className={isOrchestrator ? 'text-slate-905 font-display text-slate-900' : 'text-indigo-600'}>
                          {isOrchestrator ? 'Super Agent Router' : msg.agentName || 'Agent Worker'}
                        </span>
                        <span className="text-4xs text-slate-400 font-normal flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {/* Chat Text */}
                    <div className="prose prose-xs whitespace-pre-line text-xs font-sans leading-relaxed">
                      {msg.text}
                    </div>

                    {/* Tool executions indicators */}
                    {msg.toolInvocations && msg.toolInvocations.length > 0 && (
                      <div className="border-t border-slate-150 pt-3 mt-3 space-y-2">
                        <span className="block text-4xs font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Tool Gateway Pipeline Execution
                        </span>
                        
                        <div className="space-y-2">
                          {msg.toolInvocations.map((tool, tIdx) => (
                            <div key={tIdx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1.5 shadow-2xs">
                              <div className="flex items-center justify-between text-3xs font-mono">
                                <span className="font-bold text-slate-700 flex items-center gap-1">
                                  <Activity className="w-3 h-3 text-indigo-500" />
                                  {tool.toolName}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                  tool.status === 'success' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : 'bg-amber-50 text-amber-700 border border-amber-100'
                                }`}>
                                  {tool.status === 'success' ? 'READ_SUCCESS' : 'AWAITING_OWNER_HANDSHAKE'}
                                </span>
                              </div>
                              
                              <div className="text-4xs text-slate-400 font-mono">
                                Args: <span className="text-slate-500">{JSON.stringify(tool.args)}</span>
                              </div>

                              {tool.approvalId && (
                                <div className="mt-1 flex items-center justify-between bg-amber-50/50 border border-amber-100 rounded-xl p-2 text-3xs text-amber-900 leading-normal">
                                  <span>Action locked inside approval index: <strong>{tool.approvalId}</strong></span>
                                  <button 
                                    onClick={onNavigateToApprovals}
                                    className="flex items-center gap-1 px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-semibold text-4xs leading-none transition cursor-pointer"
                                  >
                                    Approve Change
                                    <ChevronRight className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 font-bold text-xs shrink-0 select-none border border-slate-205 shadow-3xs">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex items-start gap-4 animate-fade-in">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-900 text-indigo-300 border border-slate-800 shrink-0 shadow-xs">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-slate-50 border border-slate-200 text-slate-500 rounded-2xl p-4 text-xs flex items-center gap-2.5 max-w-sm shadow-2xs">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
                <span className="font-semibold text-slate-600">Super Agent routing command...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input Panel */}
        <form onSubmit={handleSend} className="p-4 border-t border-slate-200 bg-slate-50/70 flex flex-col md:flex-row gap-3 items-stretch rounded-b-2xl">
          <div className="flex-1 relative flex items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
              placeholder="e.g. Write a description update for Walnut headphone stand..."
              className="w-full pl-3 pr-24 py-2.5 text-xs border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans shadow-3xs"
              required
            />
            
            {/* Direct Bypass Picker */}
            <div className="absolute right-2 top-1.5">
              <select
                value={bypassAgentId}
                onChange={(e) => setBypassAgentId(e.target.value)}
                disabled={isLoading}
                className="text-4xs font-mono font-bold bg-slate-100 border border-slate-200 text-slate-600 rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
              >
                <option value="">Auto Route</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name.split(' ')[0]}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !inputText.trim()}
            className="px-4.5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-350 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            Send Command
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* Side Quick Prompt Panel */}
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
            Quick Start Scenarios
          </h3>
          
          <div className="space-y-2.5">
            {SAMPLE_COMMANDS.map((cmd, i) => (
              <div 
                key={i}
                onClick={() => handleSampleClick(cmd.prompt, cmd.agentId)}
                className="group p-3 rounded-xl border border-slate-150 bg-slate-50/20 hover:bg-indigo-50/35 hover:border-indigo-300 transition-all text-xs cursor-pointer flex flex-col gap-1 shadow-3xs"
              >
                <div className="flex justify-between items-center text-3xs font-bold text-slate-800 group-hover:text-indigo-950 font-sans">
                  <span>{cmd.title}</span>
                  <Play className="w-2.5 h-2.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                </div>
                <p className="text-3xs text-slate-500 line-clamp-2 leading-relaxed italic">
                  "{cmd.prompt}"
                </p>
                <p className="text-4xs font-mono text-slate-400 mt-0.5 uppercase tracking-wider">
                  {cmd.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time agent status tracker widget */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2.5">
            Agent Registry Monitor
          </h3>
          
          <div className="space-y-2">
            {agents.map(agent => (
              <div key={agent.id} className="flex justify-between items-center text-3xs">
                <span className="font-bold text-slate-600">{agent.name}</span>
                <span className={`inline-flex items-center gap-1.5 ${
                  agent.enabled ? 'text-emerald-600 font-bold' : 'text-slate-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    agent.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                  }`}></span>
                  {agent.enabled ? 'STANDBY' : 'OFFLINE'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
