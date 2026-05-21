import React, { useState } from 'react';
import { 
  Users, 
  Settings, 
  ShieldCheck, 
  ShieldAlert, 
  Cpu, 
  ToggleLeft, 
  ToggleRight, 
  ListTodo,
  AlertCircle
} from 'lucide-react';
import { Agent, RiskLevel } from '../types';

interface AgentRegistryProps {
  agents: Agent[];
  onUpdateAgent: (id: string, updates: Partial<Agent>) => void;
  isLoading: boolean;
}

const RISK_BADGES: Record<RiskLevel, { text: string; bg: string; textCol: string; ring: string }> = {
  Low: { text: "Low Risk", bg: "bg-emerald-50", textCol: "text-emerald-700", ring: "ring-emerald-600/10" },
  Medium: { text: "Medium Risk", bg: "bg-amber-50", textCol: "text-amber-700", ring: "ring-amber-600/10" },
  High: { text: "High Risk — Direct Gateway", bg: "bg-red-50", textCol: "text-red-700", ring: "ring-red-600/10" }
};

const PROTOCOLS_LIST = [
  "shopify.getShopInfo",
  "shopify.getProducts",
  "shopify.getOrders",
  "shopify.getSalesSummary",
  "shopify.prepareProductUpdate",
  "shopify.prepareThemePatch"
];

export default function AgentRegistry({
  agents,
  onUpdateAgent,
  isLoading
}: AgentRegistryProps) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(agents[0] || null);
  const [editingInstruction, setEditingInstruction] = useState(selectedAgent?.systemInstruction || "");
  const [editingTools, setEditingTools] = useState<string[]>(selectedAgent?.allowedTools || []);

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setEditingInstruction(agent.systemInstruction);
    setEditingTools(agent.allowedTools);
  };

  const handleToggle = (agent: Agent) => {
    onUpdateAgent(agent.id, { enabled: !agent.enabled });
    if (selectedAgent && selectedAgent.id === agent.id) {
      setSelectedAgent(prev => prev ? { ...prev, enabled: !prev.enabled } : null);
    }
  };

  const handleToolCheck = (tool: string) => {
    setEditingTools(prev => 
      prev.includes(tool) 
        ? prev.filter(t => t !== tool) 
        : [...prev, tool]
    );
  };

  const handleSaveConfigs = () => {
    if (!selectedAgent) return;
    onUpdateAgent(selectedAgent.id, {
      systemInstruction: editingInstruction,
      allowedTools: editingTools
    });

    // alert configuration saved locally for UI feedback
    const original = agents.find(a => a.id === selectedAgent.id);
    if (original) {
      setSelectedAgent({
        ...selectedAgent,
        systemInstruction: editingInstruction,
        allowedTools: editingTools
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full items-start">
      {/* List section */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex justify-between items-center border-b border-slate-105 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight leading-none">Managed Agent Registry</h2>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100/50 text-indigo-700">
            {agents.length} Models Instantiated
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {agents.map((agent) => {
            const isSelected = selectedAgent?.id === agent.id;
            return (
              <div 
                key={agent.id}
                onClick={() => handleAgentClick(agent)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-42 ${
                  isSelected 
                    ? 'bg-indigo-50/40 border-indigo-400 ring-2 ring-indigo-400/5 shadow-2xs' 
                    : 'bg-white border-slate-200 shadow-sm hover:border-slate-350 hover:shadow'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg ${agent.avatarColor} flex items-center justify-center font-bold text-xs text-white shrink-0`}>
                        {agent.name.split(' ').map(n=>n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 leading-snug">{agent.name}</h3>
                        <span className={`inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 mt-1 rounded ring-1 ring-inset ${
                          RISK_BADGES[agent.riskLevel].bg
                        } ${RISK_BADGES[agent.riskLevel].textCol} ${RISK_BADGES[agent.riskLevel].ring}`}>
                          {RISK_BADGES[agent.riskLevel].text}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle(agent);
                      }}
                      className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      {agent.enabled ? (
                        <ToggleRight className="w-6 h-6 text-indigo-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-300" />
                      )}
                    </button>
                  </div>

                  <p className="text-3xs text-slate-500 mt-3 line-clamp-2 leading-relaxed">
                    {agent.systemInstruction}
                  </p>
                </div>

                <div className="flex justify-between items-center border-t border-slate-100 pt-2.5 mt-2.5 text-[9px] text-slate-400 font-mono">
                  <span>Scopes: {agent.requiredScopes.length}</span>
                  <span>{agent.allowedTools.length} tools allowed</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor Sidebar Pane */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Settings className="w-4 h-4 text-slate-400" />
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configure Agent Parameters</h3>
        </div>

        {selectedAgent ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${selectedAgent.avatarColor} flex items-center justify-center font-bold text-sm text-white shrink-0`}>
                {selectedAgent.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">{selectedAgent.name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                    selectedAgent.enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/50' : 'bg-slate-50 text-slate-500 border border-slate-100'
                  }`}>
                    {selectedAgent.enabled ? 'Active Workers Enabled' : 'Disabled'}
                  </span>
                  <span className="text-slate-350 text-3xs">•</span>
                  <span className="text-3xs font-mono text-slate-400">{selectedAgent.id}</span>
                </div>
              </div>
            </div>

            {/* Instruction editor */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  System Instruction Prompt
                </label>
                <span className="text-3xs text-slate-400 font-mono">Tuning Window</span>
              </div>
              <textarea
                value={editingInstruction}
                onChange={(e) => setEditingInstruction(e.target.value)}
                className="w-full h-32 px-3 py-2 text-xs border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans leading-relaxed"
                placeholder="Declare precise behavioral constraints for this agent..."
              />
              <p className="text-3xs text-slate-400 leading-none">
                Injected of system prompting parameters during orchestrations.
              </p>
            </div>

            {/* Scopes & tools editor */}
            <div className="space-y-3">
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  Required Shopify OAuth Scopes (Immutable)
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedAgent.requiredScopes.map(scope => (
                    <span key={scope} className="px-1.5 py-0.5 text-3xs font-mono font-semibold rounded bg-slate-50 border border-slate-200 text-slate-600">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                  Delegated Gateway Tools
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2.5 bg-slate-50/50">
                  {PROTOCOLS_LIST.map((tool) => {
                    const isAllowed = editingTools.includes(tool);
                    return (
                      <div 
                        key={tool}
                        onClick={() => handleToolCheck(tool)}
                        className={`flex items-center justify-between p-1.5 rounded-lg text-3xs cursor-pointer transition ${
                          isAllowed ? 'bg-indigo-50/60 text-indigo-900 font-semibold' : 'text-slate-500 hover:bg-slate-55'
                        }`}
                      >
                        <span className="font-mono">{tool}</span>
                        <input
                          type="checkbox"
                          checked={isAllowed}
                          onChange={() => {}} // handled by click
                          className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-350 pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="pt-3 border-t border-slate-150 flex items-center justify-between gap-2">
              <span className="text-3xs text-slate-400 flex items-center gap-1 leading-none font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                Live tuning updates
              </span>
              <button
                onClick={handleSaveConfigs}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-2xs transition cursor-pointer"
              >
                Apply Parameters
              </button>
            </div>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-400 text-xs">
            <Cpu className="w-8 h-8 mx-auto text-slate-200 mb-2" />
            Pick an agent from the registry to review configurations.
          </div>
        )}
      </div>
    </div>
  );
}
