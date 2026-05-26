import React, { useState } from 'react';
import { 
  FileCheck, 
  Check, 
  X, 
  Clock, 
  User, 
  Calendar, 
  ArrowRight, 
  ChevronRight, 
  Eye, 
  Settings, 
  ShieldCheck, 
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { ApprovalItem } from '../types';

interface ApprovalQueueProps {
  approvals: ApprovalItem[];
  onDecide: (id: string, decision: 'APPROVE' | 'REJECT') => void;
  onExecute: (id: string) => Promise<void>;
  onResetFailed: (id: string) => Promise<void>;
  isLoading: boolean;
}

export default function ApprovalQueue({
  approvals,
  onDecide,
  onExecute,
  onResetFailed,
  isLoading
}: ApprovalQueueProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const pending = approvals.find(a => a.status === 'PENDING');
    if (pending) return pending.id;
    return approvals[0]?.id || null;
  });
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DECIDED'>('PENDING');

  const selectedItem = approvals.find(a => a.id === selectedId) || null;

  const pendingList = approvals.filter(a => a.status === 'PENDING');
  const decidedList = approvals.filter(a => a.status !== 'PENDING');

  const displayedList = activeTab === 'PENDING' ? pendingList : decidedList;

  const handleSelect = (item: ApprovalItem) => {
    setSelectedId(item.id);
  };

  const handleAction = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    onDecide(id, decision);
    
    // Smooth transition: search for next pending item if available
    const nextItem = approvals.find(a => a.id !== id && a.status === 'PENDING');
    if (nextItem) {
      setSelectedId(nextItem.id);
    } else {
      setSelectedId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 uppercase">
            <FileCheck className="w-5 h-5 text-indigo-600" />
            Merchant Approval Safeguards Queue
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Gated security console. Review and authorize or discard write payloads proposed by active agent pipelines before live storefront commits.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex border border-slate-200 rounded-xl p-0.5 bg-slate-50/75 max-w-sm shrink-0 shadow-3xs">
          <button
            onClick={() => { setActiveTab('PENDING'); setSelectedId(pendingList[0]?.id || null); }}
            className={`px-3 py-1.5 text-3xs font-bold rounded-lg transition-all ${
              activeTab === 'PENDING' 
                ? 'bg-white text-indigo-950 shadow-xs border border-slate-150' 
                : 'text-gray-500 hover:text-slate-700'
            }`}
          >
            Pending Reviews ({pendingList.length})
          </button>
          <button
            onClick={() => { setActiveTab('DECIDED'); setSelectedId(decidedList[0]?.id || null); }}
            className={`px-3 py-1.5 text-3xs font-bold rounded-lg transition-all ${
              activeTab === 'DECIDED' 
                ? 'bg-white text-indigo-950 shadow-xs border border-slate-150' 
                : 'text-gray-500 hover:text-slate-700'
            }`}
          >
            History Log ({decidedList.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
        
        {/* Left Side: Actions list */}
        <div className="lg:col-span-2 space-y-2">
          {displayedList.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400 font-sans">
              <ShieldCheck className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-700">No transactions found</p>
              <p className="text-3xs text-slate-450 mt-0.5">There are no overrides queued under this partition.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {displayedList.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-indigo-50/30 border-indigo-400 ring-2 ring-indigo-500/10 shadow-xs' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="flex justify-between items-start font-mono">
                      <span className="font-bold text-slate-800">{item.id}</span>
                      <span className={`inline-flex items-center text-4xs font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
                        item.status === 'PENDING' 
                          ? 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse' 
                          : item.status === 'APPROVED' 
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-100 font-bold' 
                          : item.status === 'EXECUTING'
                          ? 'bg-blue-50 text-blue-700 border-blue-100 animate-pulse'
                          : item.status === 'APPLIED' || item.status === 'EXECUTED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100 font-bold'
                          : 'bg-red-50 text-red-700 border-red-100'
                      }`}>
                        {item.status}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-700 mt-2 line-clamp-1">
                      {item.details.title}
                    </h3>

                    <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2 text-4xs text-slate-400">
                      <span className="flex items-center gap-1 font-sans font-bold text-slate-450">
                        <User className="w-3 h-3 text-indigo-400" />
                        {item.agentName}
                      </span>
                      <span className="font-mono">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Diff & Approval Actions */}
        <div className="lg:col-span-3">
          {selectedItem ? (
            <div className="bg-white rounded-2xl border border-slate-205 p-5 flex flex-col justify-between h-full shadow-sm">
              <div className="space-y-5">
                {/* Header Information */}
                <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-4xs text-slate-400 font-mono block">Action ID: {selectedItem.id}</span>
                    <h3 className="text-xs font-bold text-slate-800 mt-0.5">{selectedItem.details.title}</h3>
                  </div>
                  
                  <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(selectedItem.timestamp).toLocaleDateString()} at {new Date(selectedItem.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                  </div>
                </div>

                {/* Proposed rationale */}
                <div className="space-y-2">
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-widest leading-none flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-indigo-550 text-indigo-600 shrink-0" />
                    Agent Justification & Change Summary
                  </span>
                  <p className="text-3xs text-slate-600 bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-4 leading-relaxed italic">
                    "{selectedItem.details.summary}"
                  </p>
                </div>

                {/* Side by side visual code diff comparison */}
                <div className="space-y-2">
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Write Action Comparison (Before vs After)
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Before parameters */}
                    <div className="rounded-2xl border border-red-100 flex flex-col overflow-hidden bg-red-50/25">
                      <span className="block px-3 py-2 text-4xs font-bold font-mono text-red-700 border-b border-red-100 bg-red-50 leading-none">
                        - CURRENT VALUE (DISCARDED)
                      </span>
                      <div className="p-3 font-mono text-3xs text-red-900 leading-relaxed overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {selectedItem.details.before || "// Property was previously blank or holds template values"}
                      </div>
                    </div>

                    {/* After parameters */}
                    <div className="rounded-2xl border border-emerald-100 flex flex-col overflow-hidden bg-emerald-50/25">
                      <span className="block px-3 py-2 text-4xs font-bold font-mono text-emerald-700 border-b border-emerald-100 bg-emerald-50 leading-none font-sans font-bold">
                        + DRAFTED REVISION (PROPOSED COMMIT)
                      </span>
                      <div className="p-3 font-mono text-3xs text-emerald-950 leading-relaxed overflow-x-auto max-h-48 whitespace-pre-wrap font-sans">
                        {selectedItem.details.after}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Handlers */}
              {/* Action Handlers */}
              {selectedItem.status === 'PENDING' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-3xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Manual Gatekeeper Guardrail:</span> Approving is state-only and registers your authorization inside Softify. You must explicitly execute the approved action afterwards to apply changes to your Shopify storefront.
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[8px]">
                      <Eye className="w-4 h-4 text-indigo-500" />
                      Review parameters before authorizing
                    </span>
                    
                    <div className="flex gap-2.5 shrink-0">
                      <button
                        onClick={() => handleAction(selectedItem.id, 'REJECT')}
                        disabled={isLoading}
                        className="px-4.5 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 shadow-xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject Payload
                      </button>
                      
                      <button
                        onClick={() => handleAction(selectedItem.id, 'APPROVE')}
                        disabled={isLoading}
                        className="px-4.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Authorize Proposed Payload
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedItem.status === 'APPROVED' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-3xs text-indigo-850 flex items-start gap-2 leading-relaxed">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-indigo-950 uppercase block text-[9px] mb-0.5">Authorization Finalized (State-Only)</span>
                      This proposed update has been approved by the merchant. No data has been committed to your Shopify catalog yet. Click the button below to explicitly execute this commit.
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 font-mono font-bold uppercase">
                      Status: AUTHORIZED
                    </span>
                    
                    <button
                      onClick={() => onExecute(selectedItem.id)}
                      disabled={isLoading}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      Execute Commit to Shopify
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.status === 'EXECUTING' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-3xs text-blue-800 flex items-start gap-2 leading-relaxed">
                    <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
                    <div>
                      <span className="font-bold text-blue-950 uppercase block text-[9px] mb-0.5">Executing Shopify Mutation</span>
                      Concurrency claim lock acquired. Safely writing catalog updates to Shopify Store via GraphQL product mutation pipeline...
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 font-mono font-bold uppercase animate-pulse">
                      Status: CLAIMED & MUTATING
                    </span>
                    
                    <button
                      disabled
                      className="px-5 py-2.5 text-xs font-bold text-white bg-blue-400 rounded-xl shadow-xs flex items-center gap-1.5 cursor-not-allowed"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Executing...
                    </button>
                  </div>
                </div>
              )}

              {(selectedItem.status === 'APPLIED' || selectedItem.status === 'EXECUTED') && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-3xs text-emerald-800 flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-emerald-950 uppercase block text-[9px] mb-0.5">Execution Successful</span>
                      The product catalog revision has been successfully committed to the active Shopify storefront! These updates are now live.
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-3xs font-mono font-bold text-slate-500">
                    <span>Authorized changes successfully finalized.</span>
                    <span className="text-emerald-700 uppercase tracking-widest text-[9px]">
                      Result: APPLIED
                    </span>
                  </div>
                </div>
              )}

              {selectedItem.status === 'FAILED' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-3xs text-rose-805 text-rose-800 space-y-2 leading-relaxed">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-rose-955 text-rose-950 uppercase block text-[9px] mb-0.5">Execution Failed</span>
                        The safe execution was blocked or failed to apply.
                      </div>
                    </div>
                    <div className="pl-6 border-l-2 border-rose-200 text-rose-700 text-[10px] space-y-1">
                      <p><span className="font-bold font-mono text-rose-900">Operator Guidance:</span> Storefront connection credentials may be invalid, required scopes (e.g. <code className="bg-rose-100 px-1 py-0.5 rounded font-mono text-[9px]">write_products</code>) might be missing, or concurrency locks conflicted.</p>
                      {(selectedItem as any).lastFailureReason && (
                        <p><span className="font-bold text-rose-900">Detail:</span> "{(selectedItem as any).lastFailureReason}"</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 font-mono font-bold uppercase text-rose-700">
                      Status: SYSTEM_FAILED
                    </span>
                    
                    <button
                      onClick={() => onResetFailed(selectedItem.id)}
                      disabled={isLoading}
                      className="px-5 py-2.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-205 border-rose-200 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      Reset Failed Status (Retry)
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.status === 'REJECTED' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-3xs text-slate-600 flex items-start gap-2 leading-relaxed">
                    <X className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 uppercase block text-[9px] mb-0.5">Payload Rejected</span>
                      This revision has been explicitly rejected and discarded. No modifications were written to your live storefront.
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-3xs font-mono font-bold text-slate-500">
                    <span>Authorized choice finalized on this payload.</span>
                    <span className="text-red-700 uppercase tracking-widest text-[9px]">
                      Result: REJECTED
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl max-w-sm mx-auto">
              <ShieldCheck className="w-10 h-10 text-slate-350 mb-2" />
              <p className="text-xs font-bold text-slate-700">No action selected</p>
              <p className="text-3xs text-slate-400 mt-1">Pick an item from the left tracking column to audit.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
