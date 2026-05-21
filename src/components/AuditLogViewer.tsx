import React, { useState } from 'react';
import { 
  Activity, 
  Search, 
  User, 
  Cpu, 
  Terminal, 
  Database,
  Filter,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Code
} from 'lucide-react';
import { AuditLog } from '../types';

interface AuditLogViewerProps {
  logs: AuditLog[];
}

export default function AuditLogViewer({ logs }: AuditLogViewerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInitiator, setSelectedInitiator] = useState<string>("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const UNIQUE_INITIATORS = Array.from(new Set(logs.map(l => l.initiator)));

  // Filter logic
  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesInitiator = selectedInitiator === 'ALL' || log.initiator === selectedInitiator;
    return matchesSearch && matchesInitiator;
  });

  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-205 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-2 uppercase">
            <Activity className="w-5 h-5 text-indigo-600" />
            Control Center Audit Log Trail
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Standard merchant telemetry logs. Every routing action, tool lookup, and state override is indexed here with complete microsecond precision.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-205 flex flex-col md:flex-row gap-3 items-stretch shadow-sm text-xs">
        {/* Search input */}
        <div className="flex-1 relative flex items-center">
          <span className="absolute left-3.5 text-slate-450 pointer-events-none">
            <Search className="w-4 h-4 text-slate-400" />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search logs by keyword, action ID, or event key..."
            className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs text-slate-800 bg-white shadow-3xs"
          />
        </div>

        {/* Initiator dropdown filter */}
        <div className="flex items-center gap-2.5 min-w-[200px]">
          <span className="text-slate-400 shrink-0 font-bold flex items-center gap-1 uppercase tracking-wider text-[10px]">
            <Filter className="w-3.5 h-3.5" />
            Initiator:
          </span>
          <select
            value={selectedInitiator}
            onChange={(e) => setSelectedInitiator(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-bold cursor-pointer text-slate-700"
          >
            <option value="ALL">All Event Threads</option>
            {UNIQUE_INITIATORS.map((init) => (
              <option key={init} value={init}>{init}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Logs stack view */}
      <div className="bg-white rounded-2xl border border-slate-205 shadow-sm overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 max-w-sm mx-auto font-sans">
            <Activity className="w-10 h-10 text-slate-200 mx-auto mb-2" style={{ animationDelay: '100ms' }} />
            <p className="text-xs font-bold text-slate-700">No logs found matching filter</p>
            <p className="text-3xs text-slate-500 mt-0.5">Adjust filter terms or execute commands inside the Chat Terminal.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const isOwner = log.initiator === 'Shop Owner';
              const isOrchestrator = log.initiator === 'Super Agent Orchestrator';

              return (
                <div key={log.id} className="transition-all hover:bg-slate-50/40">
                  <div 
                    onClick={() => toggleExpand(log.id)}
                    className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3 cursor-pointer text-xs"
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {/* Identity visual Badge */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                        isOwner ? 'bg-indigo-50 text-indigo-750 border border-indigo-150' : isOrchestrator ? 'bg-slate-900 text-indigo-300 border border-slate-800' : 'bg-indigo-650 bg-indigo-600 text-white'
                      }`}>
                        {isOwner ? <User className="w-4 h-4" /> : isOrchestrator ? <Terminal className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-800">{log.initiator}</span>
                          <span className="text-slate-300 text-10px">•</span>
                          <span className="font-mono text-3xs px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-full text-slate-600 flex items-center leading-none font-bold uppercase tracking-wide">
                            {log.event}
                          </span>
                        </div>
                        <p className="text-3xs text-slate-505 text-slate-600 mt-1 lines-clamp-1 leading-relaxed">
                          {log.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end gap-2 sm:gap-1.5 text-right shrink-0">
                      <span className="font-mono text-4xs text-slate-400 font-bold">{log.id}</span>
                      <div className="flex items-center gap-1.5 text-4xs text-slate-500 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-405" />
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  {/* Expanded block containing formatted visual JSON */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50/50 border-t border-slate-105 flex flex-col gap-2.5 animate-fade-in">
                      <div className="flex items-center gap-1.5 text-4xs font-bold uppercase tracking-wider text-slate-400">
                        <Code className="w-3.5 h-3.5 text-indigo-500" />
                        Raw Telemetry Payload ({log.id})
                      </div>
                      <div className="bg-slate-900 rounded-xl p-3 font-mono text-[9px] text-slate-100 overflow-auto max-h-48 border border-slate-800">
                        <pre>{JSON.stringify({
                          id: log.id,
                          timestamp: log.timestamp,
                          initiator: log.initiator,
                          event: log.event,
                          description: log.description,
                          metadata: log.metadata || {}
                        }, null, 2)}</pre>
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
  );
}
