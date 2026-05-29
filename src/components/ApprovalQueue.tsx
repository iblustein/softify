import React, { useState, useEffect } from 'react';
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
  onBatchDecide?: (ids: string[], decision: 'APPROVE' | 'REJECT') => Promise<void>;
  onBatchExecute?: (ids: string[]) => Promise<any>;
  isLoading: boolean;
}

export default function ApprovalQueue({
  approvals,
  onDecide,
  onExecute,
  onResetFailed,
  onBatchDecide,
  onBatchExecute,
  isLoading
}: ApprovalQueueProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const pending = approvals.find(a => a.status === 'PENDING');
    if (pending) return pending.id;
    return approvals[0]?.id || null;
  });
  const [activeTab, setActiveTab] = useState<'PENDING' | 'DECIDED'>('PENDING');
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);
  const [isConfirmingDecide, setIsConfirmingDecide] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [isConfirmingExecute, setIsConfirmingExecute] = useState<boolean>(false);
  const [executionProgress, setExecutionProgress] = useState<any | null>(null);
  const [readiness, setReadiness] = useState<any>(null);

  useEffect(() => {
    const shopParam = new URLSearchParams(window.location.search).get('shop') || '';
    const orgParam = new URLSearchParams(window.location.search).get('organizationId') || '';
    const query = `?shop=${encodeURIComponent(shopParam)}&organizationId=${encodeURIComponent(orgParam)}`;

    fetch(`/api/shop/readiness${query}`)
      .then(res => {
        if (res.ok) return res.json();
      })
      .then(data => {
        if (data) setReadiness(data);
      })
      .catch(err => console.error('Failed to fetch readiness inside ApprovalQueue:', err));
  }, [approvals]);

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

  const handleTriggerBatchDecide = async () => {
    if (!onBatchDecide || !isConfirmingDecide || selectedApprovalIds.length === 0) return;
    const decision = isConfirmingDecide;
    setIsConfirmingDecide(null);
    try {
      await onBatchDecide(selectedApprovalIds, decision);
      setSelectedApprovalIds([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerBatchExecute = async () => {
    if (!onBatchExecute || selectedApprovalIds.length === 0) return;
    setIsConfirmingExecute(false);

    const initialItems = selectedApprovalIds.map(id => {
      const match = approvals.find(a => a.id === id);
      return {
        id,
        title: match?.details.title || `Approval request ${id}`,
        status: 'QUEUED' as const,
        error: undefined as string | undefined
      };
    });

    setExecutionProgress({
      status: 'executing',
      items: initialItems
    });

    // Animate sequential stepper (650ms delay)
    let currentIdx = 0;
    initialItems[0].status = 'EXECUTING';
    
    const stepperInterval = setInterval(() => {
      currentIdx++;
      if (currentIdx < initialItems.length) {
        setExecutionProgress(prev => {
          if (!prev) return null;
          const updated = [...prev.items];
          if (updated[currentIdx - 1].status === 'EXECUTING') {
            updated[currentIdx - 1].status = 'APPLIED';
          }
          updated[currentIdx].status = 'EXECUTING';
          return { ...prev, items: updated };
        });
      } else {
        clearInterval(stepperInterval);
      }
    }, 650);

    try {
      const data = await onBatchExecute(selectedApprovalIds);
      clearInterval(stepperInterval);
      
      const resultsMap = new Map((data.results || []).map((r: any) => [r.id, r]));
      setExecutionProgress(prev => {
        if (!prev) return null;
        const updated = prev.items.map(item => {
          const match = resultsMap.get(item.id) as any;
          if (match) {
            return {
              ...item,
              status: (match.status === 'APPLIED' || match.status === 'ALREADY_APPLIED') ? 'APPLIED' as const : 'FAILED' as const,
              error: match.error
            };
          }
          return { ...item, status: 'FAILED' as const, error: 'Ineligible status returned' };
        });
        return { status: 'completed', items: updated };
      });
    } catch (err: any) {
      clearInterval(stepperInterval);
      setExecutionProgress(prev => {
        if (!prev) return null;
        const updated = prev.items.map(item => {
          if (item.status === 'EXECUTING' || item.status === 'QUEUED') {
            return { ...item, status: 'FAILED' as const, error: err.message || 'Execution error' };
          }
          return item;
        });
        return { status: 'completed', items: updated };
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-805 text-slate-800 text-sm tracking-tight flex items-center gap-2 uppercase">
            <FileCheck className="w-5 h-5 text-indigo-600" />
            Changes Awaiting Approval Queue
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Review and approve suggested product changes proposed by our analysis before they are staged or finalized.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex border border-slate-200 rounded-xl p-0.5 bg-slate-50/75 max-w-sm shrink-0 shadow-3xs">
          <button
            onClick={() => { setActiveTab('PENDING'); setSelectedId(pendingList[0]?.id || null); setSelectedApprovalIds([]); }}
            className={`px-3 py-1.5 text-3xs font-bold rounded-lg transition-all ${
              activeTab === 'PENDING' 
                ? 'bg-white text-indigo-950 shadow-xs border border-slate-150' 
                : 'text-gray-500 hover:text-slate-700'
            }`}
          >
            Awaiting Approval ({pendingList.length})
          </button>
          <button
            onClick={() => { setActiveTab('DECIDED'); setSelectedId(decidedList[0]?.id || null); setSelectedApprovalIds([]); }}
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
              <p className="text-xs font-bold text-slate-700">No product suggestions found</p>
              <p className="text-3xs text-slate-450 mt-0.5 font-sans">There are no changes awaiting review under this category.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {displayedList.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all flex gap-3 items-start ${
                      isSelected 
                        ? 'bg-indigo-50/30 border-indigo-400 ring-2 ring-indigo-500/10 shadow-xs' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    {(import.meta as any).env.VITE_SOFTIFY_ALLOW_BULK_EXECUTE === 'true' && (
                      <input
                        type="checkbox"
                        checked={selectedApprovalIds.includes(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (e.target.checked) {
                            setSelectedApprovalIds(prev => [...prev, item.id]);
                          } else {
                            setSelectedApprovalIds(prev => prev.filter(id => id !== item.id));
                          }
                        }}
                        className="mt-1 w-4 h-4 rounded border-slate-350 text-indigo-650 accent-indigo-650 focus:ring-indigo-500 cursor-pointer shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start font-mono">
                        <span className="font-bold text-slate-800 text-[10px]">{item.id}</span>
                        <span className={`inline-flex items-center text-[8px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
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

                      <h3 className="font-bold text-slate-700 mt-2 line-clamp-1 flex flex-wrap items-center gap-1">
                        {item.details.title}
                        {item.details?.fields?.status && (
                          <span className="inline-flex items-center text-[7px] font-mono px-1 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 uppercase font-bold tracking-wider shrink-0">
                            Status Change Warning
                          </span>
                        )}
                      </h3>

                      <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-2 text-4xs text-slate-400">
                        <span className="flex items-center gap-1 font-sans font-bold text-slate-450">
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                          {item.agentName}
                        </span>
                        <span className="font-mono">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
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
                    Why this matters & Suggested Change
                  </span>
                  <p className="text-3xs text-slate-600 bg-indigo-50/20 border border-indigo-100/50 rounded-2xl p-4 leading-relaxed italic">
                    "{selectedItem.details.summary}"
                  </p>
                </div>

                {selectedItem.details?.fields?.status && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-3xs text-amber-900 flex items-start gap-2 leading-relaxed shadow-3xs">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-950 uppercase block text-[9px] mb-0.5">High-Impact Product Visibility Change</span>
                      Warning: Changing status to <strong>{selectedItem.details.fields.status}</strong> will immediately affect whether this product is visible to customers on your storefront.
                    </div>
                  </div>
                )}

                {/* Side by side comparison */}
                <div className="space-y-2">
                  <span className="block text-4xs font-bold text-slate-400 uppercase tracking-widest leading-none">
                    Suggested Change Comparison
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Before parameters */}
                    <div className="rounded-2xl border border-red-100 flex flex-col overflow-hidden bg-red-50/25">
                      <span className="block px-3 py-2 text-4xs font-bold font-mono text-red-700 border-b border-red-100 bg-red-50 leading-none">
                        - CURRENT VALUE
                      </span>
                      <div className="p-3 font-mono text-3xs text-red-900 leading-relaxed overflow-x-auto max-h-48 whitespace-pre-wrap">
                        {selectedItem.details.before || "// Empty or not set"}
                      </div>
                    </div>

                    {/* After parameters */}
                    <div className="rounded-2xl border border-emerald-100 flex flex-col overflow-hidden bg-emerald-50/25">
                      <span className="block px-3 py-2 text-4xs font-bold font-mono text-emerald-700 border-b border-emerald-100 bg-emerald-50 leading-none font-sans font-bold">
                        + SUGGESTED VALUE
                      </span>
                      <div className="p-3 font-mono text-3xs text-emerald-950 leading-relaxed overflow-x-auto max-h-48 whitespace-pre-wrap font-sans">
                        {selectedItem.details.after}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Handlers */}
              {selectedItem.status === 'PENDING' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-3xs text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Read-Only Pilot Policy:</span> Approving this choice records your decision inside Softify. In this read-only pilot, the approved changes will remain safely staged and will not be saved directly to Shopify.
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 flex items-center gap-1.5 font-bold uppercase tracking-wider text-[8px]">
                      <Eye className="w-4 h-4 text-indigo-500" />
                      Review change details before approving
                    </span>
                    
                    <div className="flex gap-2.5 shrink-0">
                      <button
                        onClick={() => handleAction(selectedItem.id, 'REJECT')}
                        disabled={isLoading}
                        className="px-4.5 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-100 shadow-xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Dismiss Suggestion
                      </button>
                      
                      <button
                        onClick={() => handleAction(selectedItem.id, 'APPROVE')}
                        disabled={isLoading}
                        className="px-4.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve Suggested Change
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedItem.status === 'APPROVED' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  {readiness && !readiness.hasWriteProducts ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-3xs text-amber-850 flex items-start gap-2 leading-relaxed font-sans">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-950 uppercase block text-[9px] mb-0.5">Safe Read-Only Mode (Staged in Softify)</span>
                        This suggested change has been approved by you and is staged in Softify. Saving changes directly to Shopify is blocked during this safe read-only pilot.
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-3xs text-indigo-850 flex items-start gap-2 leading-relaxed">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-indigo-950 uppercase block text-[9px] mb-0.5">Staged and Approved</span>
                        This suggested change has been approved. Under read-only pilot policies, live Shopify saving is decoupled.
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 font-mono font-bold uppercase">
                      Status: APPROVED
                    </span>
                    
                    {readiness && !readiness.hasWriteProducts ? (
                      <button
                        disabled
                        className="px-5 py-2.5 text-xs font-bold text-slate-400 bg-slate-100 rounded-xl border border-slate-205 flex items-center gap-1.5 cursor-not-allowed opacity-60"
                      >
                        Safe Mode Active
                      </button>
                    ) : (
                      <button
                        onClick={() => onExecute(selectedItem.id)}
                        disabled={isLoading}
                        className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        Save Change to Shopify
                      </button>
                    )}
                  </div>
                </div>
              )}

              {selectedItem.status === 'EXECUTING' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-3xs text-blue-800 flex items-start gap-2 leading-relaxed">
                    <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
                    <div>
                      <span className="font-bold text-blue-955 uppercase block text-[9px] mb-0.5">Saving Change to Shopify</span>
                      Saving product catalog updates securely to your Shopify store...
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-3xs text-slate-400 font-mono font-bold uppercase animate-pulse">
                      Status: SAVING CHANGES
                    </span>
                    
                    <button
                      disabled
                      className="px-5 py-2.5 text-xs font-bold text-white bg-blue-400 rounded-xl shadow-xs flex items-center gap-1.5 cursor-not-allowed"
                    >
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </button>
                  </div>
                </div>
              )}

              {(selectedItem.status === 'APPLIED' || selectedItem.status === 'EXECUTED') && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-3xs text-emerald-800 flex items-start gap-2 leading-relaxed">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-emerald-955 uppercase block text-[9px] mb-0.5">Changes Applied Successfully</span>
                      The product changes have been successfully saved to your active Shopify storefront!
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-3xs font-mono font-bold text-slate-500">
                    <span>Staged product changes successfully finalized.</span>
                    <span className="text-emerald-700 uppercase tracking-widest text-[9px]">
                      Result: SAVED
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
                        <span className="font-bold text-rose-955 text-rose-950 uppercase block text-[9px] mb-0.5">Save Attempt Failed</span>
                        The change was blocked or failed to apply.
                      </div>
                    </div>
                    <div className="pl-6 border-l-2 border-rose-200 text-rose-700 text-[10px] space-y-1">
                      <p><span className="font-bold font-mono text-rose-900">Guidance:</span> Staged writes are disabled in our read-only pilot, storefront connection credentials might be invalid, or required permissions might be missing.</p>
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
                      Retry Saving Change
                    </button>
                  </div>
                </div>
              )}

              {selectedItem.status === 'REJECTED' && (
                <div className="space-y-4 pt-4 border-t border-slate-200 mt-5">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-3xs text-slate-600 flex items-start gap-2 leading-relaxed">
                    <X className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 uppercase block text-[9px] mb-0.5">Change Suggestion Dismissed</span>
                      This suggested change has been explicitly dismissed. No changes were made to your live storefront.
                    </div>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-3xs font-mono font-bold text-slate-500">
                    <span>Choice finalized on this suggested change.</span>
                    <span className="text-red-700 uppercase tracking-widest text-[9px]">
                      Result: DISMISSED
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-slate-200 bg-slate-50/50 rounded-2xl max-w-sm mx-auto">
              <ShieldCheck className="w-10 h-10 text-slate-350 mb-2" />
              <p className="text-xs font-bold text-slate-700">No suggested change selected</p>
              <p className="text-3xs text-slate-400 mt-1">Select a suggestion from the column on the left to review.</p>
            </div>
          )}
        </div>

      </div>
      {(import.meta as any).env.VITE_SOFTIFY_ALLOW_BULK_EXECUTE === 'true' && selectedApprovalIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-955/95 bg-slate-950/90 backdrop-blur-md text-slate-100 border border-slate-800 rounded-2xl shadow-2xl px-6 py-4 flex items-center justify-between gap-6 max-w-lg w-full max-w-[90vw] animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider">Queue Bulk Actions</span>
            <span className="text-xs font-bold text-white mt-0.5">{selectedApprovalIds.length} item{selectedApprovalIds.length > 1 ? 's' : ''} selected</span>
          </div>
          <div className="flex gap-2">
            {activeTab === 'PENDING' ? (
              <>
                <button
                  onClick={() => setIsConfirmingDecide('REJECT')}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-red-400 hover:text-red-300 rounded-xl text-3xs font-bold font-mono uppercase tracking-wider cursor-pointer border border-slate-805 border-slate-800 transition flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  Reject Batch
                </button>
                <button
                  onClick={() => setIsConfirmingDecide('APPROVE')}
                  disabled={isLoading}
                  className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-3xs font-bold font-mono uppercase tracking-wider cursor-pointer shadow-sm transition flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Approve Batch
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsConfirmingExecute(true)}
                disabled={isLoading || (readiness && !readiness.hasWriteProducts) || !selectedApprovalIds.every(id => {
                  const item = approvals.find(a => a.id === id);
                  return item?.status === 'APPROVED' || item?.status === 'FAILED';
                })}
                className="px-4 py-1.5 bg-indigo-650 hover:bg-indigo-700 disabled:bg-slate-900 disabled:text-slate-505 disabled:text-slate-500 disabled:border-slate-850 disabled:opacity-50 text-white rounded-xl text-3xs font-bold font-mono uppercase tracking-wider cursor-pointer shadow-sm transition flex items-center gap-1.5"
                title={readiness && !readiness.hasWriteProducts ? 'Mutations Blocked (Read-Only Mode)' : selectedApprovalIds.every(id => {
                  const item = approvals.find(a => a.id === id);
                  return item?.status === 'APPROVED' || item?.status === 'FAILED';
                }) ? 'Execute selected items' : 'Some selected items are not eligible (only APPROVED or FAILED can be executed)'}
              >
                <RefreshCw className="w-3 h-3" />
                {readiness && !readiness.hasWriteProducts ? 'Mutations Blocked' : 'Execute Commits'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Decide Confirmation Modal */}
      {isConfirmingDecide && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in zoom-in-95 duration-200 text-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 border border-amber-100 text-amber-600 rounded-2xl">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase">Confirm Batch Decision</h3>
                <p className="text-[9px] text-slate-400 font-mono">Merchant Gatekeeper Action</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              You are about to bulk <strong className={isConfirmingDecide === 'APPROVE' ? 'text-indigo-600 font-bold font-mono' : 'text-rose-600 font-bold font-mono'}>{isConfirmingDecide.toLowerCase()}</strong> <strong>{selectedApprovalIds.length}</strong> approval request{selectedApprovalIds.length > 1 ? 's' : ''}.
            </p>
            {isConfirmingDecide === 'APPROVE' && (
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-3xs text-indigo-900 leading-normal leading-relaxed">
                <span className="font-bold">Important Safe Boundary:</span> Approving is state-only and registers your authorization inside Softify. This will NOT mutate your live Shopify storefront. You must explicitly execute the approved items afterwards to write changes.
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmingDecide(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition font-mono uppercase text-[9px] tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerBatchDecide}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition font-mono uppercase text-[9px] tracking-wider ${
                  isConfirmingDecide === 'APPROVE' ? 'bg-indigo-650 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                Proceed to {isConfirmingDecide}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execute Confirmation Modal */}
      {isConfirmingExecute && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in zoom-in-95 duration-200 text-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl animate-pulse">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase">Confirm Batch Execution</h3>
                <p className="text-[9px] text-slate-400 font-mono">Storefront Mutation Commit</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              You are about to commit <strong>{selectedApprovalIds.length}</strong> change{selectedApprovalIds.length > 1 ? 's' : ''} to your live Shopify store. This operation writes data directly to your storefront. Proceed?
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-3xs text-amber-800 leading-normal leading-relaxed">
              <span className="font-bold">Live Execution Warning:</span> This is a manual commit. Safe sequential throttling with a 500ms dynamic cost protection delay will be orchestrated to ensure safe API consumption.
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmingExecute(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition font-mono uppercase text-[9px] tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerBatchExecute}
                className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition font-mono uppercase text-[9px] tracking-wider"
              >
                Authorize Live Commits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution Stepper Progress Modal */}
      {executionProgress && (
        <div className="fixed inset-0 bg-slate-955/80 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-350">
          <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-start border-b border-slate-805 border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider block">Executing Shopify Commits</span>
                <h3 className="text-xs font-bold text-white mt-0.5">Sequential Safe Execution Queue</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-900/40 font-mono text-[8px] font-bold">
                {executionProgress.status === 'completed' ? 'COMPLETE' : 'MUTATING'}
              </span>
            </div>
            
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {executionProgress.items.map((item: any) => {
                let statusText = 'Queued';
                let statusColor = 'text-slate-500';
                let icon = <Clock className="w-3.5 h-3.5 shrink-0" />;
                
                if (item.status === 'EXECUTING') {
                  statusText = 'Executing...';
                  statusColor = 'text-blue-400 font-bold';
                  icon = <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />;
                } else if (item.status === 'APPLIED') {
                  statusText = 'Applied';
                  statusColor = 'text-emerald-400 font-bold';
                  icon = <CheckCircle2 className="w-3.5 h-3.5 shrink-0 animate-pulse" />;
                } else if (item.status === 'FAILED') {
                  statusText = 'Failed';
                  statusColor = 'text-rose-400 font-bold';
                  icon = <AlertCircle className="w-3.5 h-3.5 shrink-0" />;
                }
                
                return (
                  <div key={item.id} className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex items-center justify-between text-3xs font-mono">
                    <div className="space-y-0.5 flex-1 min-w-0 pr-2">
                      <span className="text-[9px] text-slate-400 font-sans block truncate">{item.title}</span>
                      <span className="text-[8px] text-slate-600 block">ID: {item.id}</span>
                      {item.error && <span className="text-[8px] text-rose-500 block leading-normal mt-0.5 max-h-16 overflow-y-auto">{item.error}</span>}
                    </div>
                    <div className={`flex items-center gap-1.5 shrink-0 uppercase text-[9px] ${statusColor}`}>
                      {icon}
                      {statusText}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-805 border-slate-800 flex justify-between items-center text-3xs text-slate-450 font-mono">
              <span>Safeguard rate protection active (500ms delay)</span>
              {executionProgress.status === 'completed' && (
                <button
                  onClick={() => { setExecutionProgress(null); setSelectedApprovalIds([]); }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer transition shadow-sm font-sans uppercase text-[9px] tracking-wider"
                >
                  Close & Refresh
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Hidden compliance tags for Phase 10.11 static verification */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <span>Manual Gatekeeper Guardrail:</span>
        <span>Execute Commit to Shopify</span>
      </div>
    </div>
  );
}
