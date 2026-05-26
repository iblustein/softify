import { Router } from "express";
import { getMockSalesReport } from "../data/mock-sales.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { AuditEventNames } from "../domain/types.js";
import * as analyticsService from "../services/workspace-analytics.service.js";

const router = Router();

// Legacy route
router.get("/sales-summary", (req, res) => {
  try {
    res.json(getMockSalesReport());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to resolve and enforce tenant context
async function resolveTenantContext(req: any, res: any) {
  const { organizationId, shop } = req.query;
  const repos = getRepositories();
  let resolvedOrgId: string | undefined = undefined;
  let storeConnectionId: string | undefined = undefined;

  if (shop && typeof shop === "string") {
    const cleanShop = normalizeShopDomain(shop);
    const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
    if (!storeConnection) {
      return { status: 404, error: "Store connection not found." };
    }

    if (organizationId && typeof organizationId === "string") {
      if (storeConnection.organizationId !== organizationId) {
        await writeAuditEvent({
          organizationId: storeConnection.organizationId,
          storeConnectionId: storeConnection.id,
          initiator: "system",
          event: AuditEventNames.GATEWAY_VALIDATION_BLOCKED,
          description: `Access denied. Store '${cleanShop}' queried with organizationId '${organizationId}' does not belong to it.`,
          decision: "blocked",
          reason: "tenant_isolation_violation",
          metadata: {
            organizationId: storeConnection.organizationId,
            queriedOrganizationId: organizationId,
            storeConnectionId: storeConnection.id,
            decision: "blocked",
            reason: "tenant_isolation_violation"
          }
        });
        return { status: 403, error: "Access denied. Store does not belong to this organization." };
      }
    }

    resolvedOrgId = storeConnection.organizationId;
    storeConnectionId = storeConnection.id;
  } else {
    if (!organizationId || typeof organizationId !== "string") {
      return { status: 400, error: "Missing required organizationId parameter." };
    }
    resolvedOrgId = organizationId;
  }

  if (!resolvedOrgId) {
    return { status: 400, error: "Missing required organizationId parameter." };
  }

  return { resolvedOrgId, storeConnectionId };
}

// 1. GET /api/workspace/analytics/summary
router.get("/workspace/analytics/summary", async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req, res);
    if ("status" in context) {
      return res.status(context.status).json({ ok: false, error: context.error });
    }
    const { dateFrom, dateTo } = req.query;
    const summary = await analyticsService.getWorkspaceSummary({
      organizationId: context.resolvedOrgId,
      storeConnectionId: context.storeConnectionId,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined
    });
    res.json({ ok: true, summary });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 2. GET /api/workspace/analytics/agent-runs
router.get("/workspace/analytics/agent-runs", async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req, res);
    if ("status" in context) {
      return res.status(context.status).json({ ok: false, error: context.error });
    }
    const { agentId, status, dateFrom, dateTo } = req.query;
    const data = await analyticsService.getAgentRunsAnalytics({
      organizationId: context.resolvedOrgId,
      storeConnectionId: context.storeConnectionId,
      agentId: typeof agentId === "string" ? agentId : undefined,
      status: typeof status === "string" ? status : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined
    });
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 3. GET /api/workspace/analytics/recommendations
router.get("/workspace/analytics/recommendations", async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req, res);
    if ("status" in context) {
      return res.status(context.status).json({ ok: false, error: context.error });
    }
    const { agentId, status, riskLevel, impactLevel, dateFrom, dateTo } = req.query;
    const data = await analyticsService.getRecommendationsAnalytics({
      organizationId: context.resolvedOrgId,
      storeConnectionId: context.storeConnectionId,
      agentId: typeof agentId === "string" ? agentId : undefined,
      status: typeof status === "string" ? status : undefined,
      riskLevel: typeof riskLevel === "string" ? riskLevel : undefined,
      impactLevel: typeof impactLevel === "string" ? impactLevel : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined
    });
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 4. GET /api/workspace/analytics/proposed-actions
router.get("/workspace/analytics/proposed-actions", async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req, res);
    if ("status" in context) {
      return res.status(context.status).json({ ok: false, error: context.error });
    }
    const { agentId, status, executionMode, riskLevel, dateFrom, dateTo } = req.query;
    const data = await analyticsService.getProposedActionsAnalytics({
      organizationId: context.resolvedOrgId,
      storeConnectionId: context.storeConnectionId,
      agentId: typeof agentId === "string" ? agentId : undefined,
      status: typeof status === "string" ? status : undefined,
      executionMode: typeof executionMode === "string" ? executionMode : undefined,
      riskLevel: typeof riskLevel === "string" ? riskLevel : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined
    });
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 5. GET /api/workspace/analytics/approval-conversion
router.get("/workspace/analytics/approval-conversion", async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req, res);
    if ("status" in context) {
      return res.status(context.status).json({ ok: false, error: context.error });
    }
    const { agentId, dateFrom, dateTo } = req.query;
    const data = await analyticsService.getApprovalConversion({
      organizationId: context.resolvedOrgId,
      storeConnectionId: context.storeConnectionId,
      agentId: typeof agentId === "string" ? agentId : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined
    });
    res.json({ ok: true, ...data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// 6. GET /api/workspace/analytics/timeline
router.get("/workspace/analytics/timeline", async (req: any, res: any) => {
  try {
    const context = await resolveTenantContext(req, res);
    if ("status" in context) {
      return res.status(context.status).json({ ok: false, error: context.error });
    }
    const { agentId, dateFrom, dateTo, limit } = req.query;
    const parsedLimit = limit ? parseInt(String(limit), 10) : undefined;
    const data = await analyticsService.getTimelineTrace({
      organizationId: context.resolvedOrgId,
      storeConnectionId: context.storeConnectionId,
      agentId: typeof agentId === "string" ? agentId : undefined,
      dateFrom: typeof dateFrom === "string" ? dateFrom : undefined,
      dateTo: typeof dateTo === "string" ? dateTo : undefined,
      limit: isNaN(parsedLimit as any) ? undefined : parsedLimit
    });
    res.json({ ok: true, timeline: data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Block non-GET requests explicitly
router.all("/workspace/analytics/*", (req, res) => {
  res.status(405).json({
    ok: false,
    error: "Method not allowed. Analytics endpoints are strictly read-only GET routes."
  });
});

export default router;
