import { getRepositories } from "../repositories/repository-provider.js";
import { AgentRun, Recommendation, ProposedAction, ApprovalRequest, AuditEvent } from "../domain/types.js";

// Safe Timeline Descriptions allowlist
const traceEventDescriptions: Record<string, string> = {
  AGENT_RUN_CREATED: "Workspace scan session initialized.",
  AGENT_RUN_STARTED: "Diagnostic scanner started.",
  AGENT_RUN_COMPLETED: "Scanner completed.",
  AGENT_RUN_FAILED: "Scanner failed.",
  RECOMMENDATION_CREATED: "New diagnostic warning generated.",
  RECOMMENDATION_DISMISSED: "Recommendation dismissed by operator.",
  PROPOSED_ACTION_CREATED: "New product metadata draft action generated.",
  PROPOSED_ACTION_DISMISSED: "Draft action dismissed.",
  PROPOSED_ACTION_APPROVAL_REQUESTED: "Draft action queued for merchant approval.",
  APPROVAL_DECIDED: "Approval decided.",
  APPROVAL_CREATED: "Approval request created.",
  APPROVAL_APPROVED: "Approval request approved.",
  APPROVAL_REJECTED: "Approval request rejected.",
  APPROVAL_EXECUTION_STARTED: "Applying approved mutation request.",
  APPROVAL_EXECUTION_BLOCKED: "Execution blocked due to safety/permission rules.",
  APPROVAL_APPLIED: "Product taxonomy optimization applied successfully.",
  APPROVAL_FAILED: "Mutation application failed.",
  GATEWAY_VALIDATION_BLOCKED: "Execution blocked due to safety/permission rules."
};

function getMappedEventType(event: string): string {
  if (event === "APPROVAL_APPROVED" || event === "APPROVAL_REJECTED" || event === "APPROVAL_DECISION") {
    return "APPROVAL_DECIDED";
  }
  if (event === "APPROVAL_APPLIED") {
    return "EXECUTION_COMPLETED";
  }
  if (event === "GATEWAY_VALIDATION_BLOCKED" || event === "APPROVAL_EXECUTION_BLOCKED" || event === "NESTED_TOOL_CALL_BLOCKED") {
    return "POLICY_BLOCKED";
  }
  return event;
}

function getSafeSummary(event: string, auditDescription: string, metadata: any): string {
  const mapped = getMappedEventType(event);
  let base = traceEventDescriptions[event] || traceEventDescriptions[mapped] || auditDescription || "Workspace event processed.";
  if (event === "AGENT_RUN_COMPLETED" && metadata) {
    const recs = metadata.recommendationCount ?? metadata.recommendationsCount ?? 0;
    const acts = metadata.proposedActionCount ?? metadata.actionsCount ?? 0;
    return `Scanner completed. Generated ${recs} recommendations and ${acts} proposed actions.`;
  }
  if (event === "PROPOSED_ACTION_APPROVAL_REQUESTED" && metadata?.approvalId) {
    return `Draft action queued for merchant approval. (Approval ID: ${metadata.approvalId})`;
  }
  return base;
}

// Helpers for date filtering
function isWithinDateRange(timestamp: string, dateFrom?: string, dateTo?: string): boolean {
  if (!timestamp) return false;
  const time = new Date(timestamp).getTime();
  if (dateFrom && time < new Date(dateFrom).getTime()) return false;
  if (dateTo && time > new Date(dateTo).getTime()) return false;
  return true;
}

/**
 * Workspace Analytics Summary Card aggregates
 */
export async function getWorkspaceSummary(params: {
  organizationId: string;
  storeConnectionId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { organizationId, storeConnectionId, dateFrom, dateTo } = params;
  const repos = getRepositories();

  // Load all source datasets concurrently
  const [runs, recs, actions, approvals] = await Promise.all([
    repos.agentRuns.getAgentRunsByOrganizationId(organizationId),
    repos.recommendations.getRecommendationsByOrganizationId(organizationId),
    repos.proposedActions.getProposedActionsByOrganizationId(organizationId),
    repos.approvals.getApprovalsByOrganizationId(organizationId)
  ]);

  // Filter based on store context and dates
  const filteredRuns = runs.filter(
    r => (!storeConnectionId || r.storeConnectionId === storeConnectionId) &&
         isWithinDateRange(r.startedAt, dateFrom, dateTo)
  );

  const filteredRecs = recs.filter(
    r => (!storeConnectionId || r.storeConnectionId === storeConnectionId) &&
         isWithinDateRange(r.createdAt, dateFrom, dateTo)
  );

  const filteredActions = actions.filter(
    a => (!storeConnectionId || a.storeConnectionId === storeConnectionId) &&
         isWithinDateRange(a.createdAt, dateFrom, dateTo)
  );

  // Aggregations
  const totalAgentRuns = filteredRuns.length;
  const failedRuns = filteredRuns.filter(r => r.status === "FAILED").length;
  const blockedRuns = filteredRuns.filter(r => r.status === "BLOCKED").length;

  const totalRecommendations = filteredRecs.length;
  const openRecommendations = filteredRecs.filter(r => r.status === "OPEN").length;
  const dismissedRecommendations = filteredRecs.filter(r => r.status === "DISMISSED").length;

  const totalProposedActions = filteredActions.length;
  const draftActions = filteredActions.filter(a => a.status === "DRAFT" || a.status === "APPROVAL_ELIGIBLE").length;
  const approvalRequestedActions = filteredActions.filter(a => a.status === "APPROVAL_REQUESTED").length;
  const approvedActions = filteredActions.filter(a => a.status === "APPROVED").length;
  const rejectedActions = filteredActions.filter(a => a.status === "REJECTED").length;
  const executedActions = filteredActions.filter(a => a.status === "EXECUTED").length;
  const dismissedActions = filteredActions.filter(a => a.status === "DISMISSED").length;

  // Calculate approval conversion rate: (Executed + Approved) / Total Requested Approvals
  const totalRequested = approvalRequestedActions + approvedActions + rejectedActions + executedActions;
  const approvalConversionRate = totalRequested > 0 
    ? Math.round(((executedActions + approvedActions) / totalRequested) * 1000) / 10
    : 0;

  // Find unique active agents in the runs
  const activeAgents = new Set(filteredRuns.map(r => r.agentId));
  const activeAgentsCount = activeAgents.size || 4; // catalog size fallback

  return {
    totalAgentRuns,
    failedRuns,
    blockedRuns,
    totalRecommendations,
    openRecommendations,
    dismissedRecommendations,
    totalProposedActions,
    draftActions,
    approvalRequestedActions,
    approvedActions,
    rejectedActions,
    executedActions,
    dismissedActions,
    approvalConversionRate,
    activeAgentsCount
  };
}

/**
 * Agent Runs analytics breakdowns and daily trends
 */
export async function getAgentRunsAnalytics(params: {
  organizationId: string;
  storeConnectionId?: string;
  agentId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { organizationId, storeConnectionId, agentId, status, dateFrom, dateTo } = params;
  const repos = getRepositories();

  const runs = await repos.agentRuns.getAgentRunsByOrganizationId(organizationId);

  const filteredRuns = runs.filter(r => {
    if (storeConnectionId && r.storeConnectionId !== storeConnectionId) return false;
    if (agentId && r.agentId !== agentId) return false;
    if (status && r.status !== status) return false;
    return isWithinDateRange(r.startedAt, dateFrom, dateTo);
  });

  // Breakdown by Agent
  const agentMap: Record<string, {
    agentId: string;
    totalRuns: number;
    completed: number;
    failed: number;
    blocked: number;
    totalDurationMs: number;
    runCountWithDuration: number;
    recommendationsGenerated: number;
    actionsGenerated: number;
  }> = {};

  // Trend mapping by date (YYYY-MM-DD)
  const trendMap: Record<string, { date: string; runCount: number; failedCount: number }> = {};

  for (const r of filteredRuns) {
    // 1. Agent breakdown
    if (!agentMap[r.agentId]) {
      agentMap[r.agentId] = {
        agentId: r.agentId,
        totalRuns: 0,
        completed: 0,
        failed: 0,
        blocked: 0,
        totalDurationMs: 0,
        runCountWithDuration: 0,
        recommendationsGenerated: 0,
        actionsGenerated: 0
      };
    }
    const stat = agentMap[r.agentId];
    stat.totalRuns++;
    if (r.status === "COMPLETED") stat.completed++;
    else if (r.status === "FAILED") stat.failed++;
    else if (r.status === "BLOCKED") stat.blocked++;

    stat.recommendationsGenerated += r.recommendationCount || 0;
    stat.actionsGenerated += r.proposedActionCount || 0;

    if (r.startedAt && r.finishedAt) {
      const dur = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
      if (dur > 0) {
        stat.totalDurationMs += dur;
        stat.runCountWithDuration++;
      }
    }

    // 2. Trend tracking
    const day = r.startedAt ? r.startedAt.substring(0, 10) : "";
    if (day) {
      if (!trendMap[day]) {
        trendMap[day] = { date: day, runCount: 0, failedCount: 0 };
      }
      trendMap[day].runCount++;
      if (r.status === "FAILED") {
        trendMap[day].failedCount++;
      }
    }
  }

  const runBreakdowns = Object.values(agentMap).map(s => ({
    agentId: s.agentId,
    totalRuns: s.totalRuns,
    completed: s.completed,
    failed: s.failed,
    blocked: s.blocked,
    averageDurationMs: s.runCountWithDuration > 0 ? Math.round(s.totalDurationMs / s.runCountWithDuration) : 0,
    recommendationsGenerated: s.recommendationsGenerated,
    actionsGenerated: s.actionsGenerated
  }));

  // Sort trends chronologically
  const trendsList = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    runs: runBreakdowns,
    trends: trendsList
  };
}

/**
 * Recommendations categorization analytics
 */
export async function getRecommendationsAnalytics(params: {
  organizationId: string;
  storeConnectionId?: string;
  agentId?: string;
  status?: string;
  riskLevel?: string;
  impactLevel?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { organizationId, storeConnectionId, agentId, status, riskLevel, impactLevel, dateFrom, dateTo } = params;
  const repos = getRepositories();

  const recs = await repos.recommendations.getRecommendationsByOrganizationId(organizationId);

  const filteredRecs = recs.filter(r => {
    if (storeConnectionId && r.storeConnectionId !== storeConnectionId) return false;
    if (agentId && r.agentId !== agentId) return false;
    if (status && r.status !== status) return false;
    if (riskLevel && r.riskLevel !== riskLevel) return false;
    if (impactLevel && r.impactLevel !== impactLevel) return false;
    return isWithinDateRange(r.createdAt, dateFrom, dateTo);
  });

  const byStatus: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const byImpact: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byAgent: Record<string, number> = {};

  for (const r of filteredRecs) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byRisk[r.riskLevel] = (byRisk[r.riskLevel] || 0) + 1;
    byImpact[r.impactLevel] = (byImpact[r.impactLevel] || 0) + 1;
    
    const type = r.recommendationType || "GENERAL";
    byType[type] = (byType[type] || 0) + 1;
    
    byAgent[r.agentId] = (byAgent[r.agentId] || 0) + 1;
  }

  return {
    breakdown: {
      byStatus,
      byRisk,
      byImpact,
      byType,
      byAgent
    }
  };
}

/**
 * Proposed Actions categorization analytics
 */
export async function getProposedActionsAnalytics(params: {
  organizationId: string;
  storeConnectionId?: string;
  agentId?: string;
  status?: string;
  executionMode?: string;
  riskLevel?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { organizationId, storeConnectionId, agentId, status, executionMode, riskLevel, dateFrom, dateTo } = params;
  const repos = getRepositories();

  const actions = await repos.proposedActions.getProposedActionsByOrganizationId(organizationId);

  const filteredActions = actions.filter(a => {
    if (storeConnectionId && a.storeConnectionId !== storeConnectionId) return false;
    if (agentId && a.agentId !== agentId) return false;
    if (status && a.status !== status) return false;
    if (executionMode && a.executionMode !== executionMode) return false;
    if (riskLevel && a.riskLevel !== riskLevel) return false;
    return isWithinDateRange(a.createdAt, dateFrom, dateTo);
  });

  const byStatus: Record<string, number> = {};
  const byExecutionMode: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const byAgent: Record<string, number> = {};

  for (const a of filteredActions) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    byExecutionMode[a.executionMode] = (byExecutionMode[a.executionMode] || 0) + 1;
    byRisk[a.riskLevel] = (byRisk[a.riskLevel] || 0) + 1;
    byAgent[a.agentId] = (byAgent[a.agentId] || 0) + 1;
  }

  return {
    breakdown: {
      byStatus,
      byExecutionMode,
      byRisk,
      byAgent
    }
  };
}

/**
 * Approval bridge pipeline conversion calculations
 */
export async function getApprovalConversion(params: {
  organizationId: string;
  storeConnectionId?: string;
  agentId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { organizationId, storeConnectionId, agentId, dateFrom, dateTo } = params;
  const repos = getRepositories();

  const actions = await repos.proposedActions.getProposedActionsByOrganizationId(organizationId);

  const filteredActions = actions.filter(a => {
    if (storeConnectionId && a.storeConnectionId !== storeConnectionId) return false;
    if (agentId && a.agentId !== agentId) return false;
    return isWithinDateRange(a.createdAt, dateFrom, dateTo);
  });

  const totalProposed = filteredActions.length;
  const totalApprovalRequested = filteredActions.filter(a => a.status === "APPROVAL_REQUESTED" || a.approvalRequestId).length;
  const totalApproved = filteredActions.filter(a => a.status === "APPROVED").length;
  const totalRejected = filteredActions.filter(a => a.status === "REJECTED").length;
  const totalExecuted = filteredActions.filter(a => a.status === "EXECUTED").length;
  const totalFailed = filteredActions.filter(a => a.status === "BLOCKED").length; // failed state maps to blocked or dismissed

  const requestedPercentage = totalProposed > 0 
    ? Math.round((totalApprovalRequested / totalProposed) * 1000) / 10 
    : 0;

  const totalDecided = totalApproved + totalRejected + totalExecuted;
  const approvalRate = totalDecided > 0
    ? Math.round(((totalApproved + totalExecuted) / totalDecided) * 1000) / 10
    : 0;

  const executionRate = (totalApproved + totalExecuted) > 0
    ? Math.round((totalExecuted / (totalApproved + totalExecuted)) * 1000) / 10
    : 0;

  return {
    totalProposed,
    totalApprovalRequested,
    totalApproved,
    totalRejected,
    totalExecuted,
    totalFailed,
    requestedPercentage,
    approvalRate,
    executionRate
  };
}

/**
 * Safe chronological trace timeline scrubber
 */
export async function getTimelineTrace(params: {
  organizationId: string;
  storeConnectionId?: string;
  agentId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const { organizationId, storeConnectionId, agentId, dateFrom, dateTo, limit = 50 } = params;
  const repos = getRepositories();

  const dbEvents = await repos.audit.getAuditEventsByOrganizationId(organizationId);

  // List of trace event types we support in the trace stepper
  const allowedEvents = Object.keys(traceEventDescriptions);

  const filteredEvents = dbEvents.filter(e => {
    if (storeConnectionId && e.storeConnectionId !== storeConnectionId) return false;
    if (agentId && e.agentId !== agentId) return false;
    
    const mapped = getMappedEventType(e.event);
    if (!allowedEvents.includes(e.event) && !allowedEvents.includes(mapped)) return false;

    return isWithinDateRange(e.timestamp, dateFrom, dateTo);
  });

  // Sort reverse-chronologically (newest first)
  const sorted = filteredEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Strict allowlist-only mapping
  const timeline = sorted.slice(0, limit).map(e => {
    const eventType = getMappedEventType(e.event);
    const safeSummary = getSafeSummary(e.event, e.description, e.metadata);
    const metadata = e.metadata || {};

    return {
      id: e.id,
      timestamp: e.timestamp,
      eventType,
      agentId: e.agentId || metadata.agentId || null,
      resourceType: metadata.resourceType || metadata.targetType || null,
      resourceId: metadata.resourceId || metadata.targetId || null,
      status: metadata.status || null,
      safeSummary,
      counts: metadata.recommendationCount !== undefined || metadata.proposedActionCount !== undefined
        ? {
            recommendationCount: metadata.recommendationCount ?? 0,
            proposedActionCount: metadata.proposedActionCount ?? 0
          }
        : null,
      riskLevel: metadata.riskLevel || null,
      impactLevel: metadata.impactLevel || null,
      correlationId: metadata.approvalId || metadata.runId || metadata.correlationId || null
    };
  });

  return timeline;
}
