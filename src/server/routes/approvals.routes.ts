import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent, getAuditLogs } from "../services/audit-log.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { isFirestoreConfigured } from "../config/firestore.config.js";
import { AuditEventNames } from "../domain/types.js";
import * as approvalService from "../services/approval.service.js";
import * as executorService from "../services/approved-product-mutation-executor.service.js";

const router = Router();

/**
 * Dynamically computes legacy compatible fields for backward compatibility with the frontend/clients
 * without persisting any raw details, raw patches, or arbitrary payload states in Firestore.
 */
function buildLegacyApprovalShape(a: any): any {
  if (!a) return a;

  const targetId = a.targetId || "101";
  const proposedChangesSummary = a.proposedChangesSummary || "";
  const sanitizedPayload = a.sanitizedPayload || {};

  const detailsTitle = proposedChangesSummary 
    ? `Proposed changes: ${proposedChangesSummary}`
    : (a.details?.title || `Proposed product update: ${targetId}`);

  return {
    ...a,
    organizationId: a.organizationId,
    storeConnectionId: a.storeConnectionId,
    actionType: "PRODUCT_UPDATE",
    beforeState: "Status: Sync product snapshot properties",
    afterState: JSON.stringify(sanitizedPayload),
    diff: a.diffSummary || "",
    details: {
      title: detailsTitle,
      before: "Status: Sync product snapshot properties",
      after: JSON.stringify(sanitizedPayload),
      summary: proposedChangesSummary,
      productId: Number(targetId),
      fields: sanitizedPayload
    }
  };
}

/**
 * Dynamically constructs a clean, sanitized operational response shape for Phase 10.8 endpoints,
 * strictly excluding any legacy compatibility fields, raw payloads, raw tool arguments, raw Shopify responses,
 * prompts, tokens, secrets, or PII.
 */
function buildOperationalApprovalShape(a: any): any {
  if (!a) return a;
  return {
    id: a.id,
    organizationId: a.organizationId,
    storeConnectionId: a.storeConnectionId,
    agentInstallationId: a.agentInstallationId,
    agentId: a.agentId,
    toolName: a.toolName,
    requestedBy: a.requestedBy,
    requestedAt: a.requestedAt,
    decidedAt: a.decidedAt,
    decidedBy: a.decidedBy,
    executedAt: a.executedAt,
    executedBy: a.executedBy,
    failureReason: a.failureReason,
    status: a.status,
    riskLevel: a.riskLevel,
    targetType: a.targetType,
    targetId: a.targetId,
    proposedChangesSummary: a.proposedChangesSummary,
    diffSummary: a.diffSummary,
    allowedFields: a.allowedFields,
    executionStartedAt: a.executionStartedAt,
    executionFinishedAt: a.executionFinishedAt,
    executionAttemptCount: a.executionAttemptCount,
    lastExecutionStatus: a.lastExecutionStatus,
    lastFailureReason: a.lastFailureReason,
    lastFailureCode: a.lastFailureCode,
    lastBlockedReason: a.lastBlockedReason,
    lastExecutedBy: a.lastExecutedBy,
    lastExecutionCorrelationId: a.lastExecutionCorrelationId
  };
}

router.get("/approvals", async (req: any, res: any) => {
  try {
    const { organizationId, shop, status } = req.query;

    if (status && typeof status === "string") {
      const validStatuses = ["PENDING", "APPROVED", "REJECTED", "EXECUTING", "APPLIED", "FAILED"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ ok: false, error: "Invalid status parameter." });
      }
    }

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

      // If organizationId is also supplied, assert they match to prevent cross-tenant queries
      if (organizationId && typeof organizationId === "string") {
        if (storeConnection.organizationId !== organizationId) {
          return res.status(403).json({ ok: false, error: "Access denied. Store does not belong to this organization." });
        }
      }

      resolvedOrgId = storeConnection.organizationId;
      storeConnectionId = storeConnection.id;
    } else {
      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
      }
      resolvedOrgId = organizationId;
    }

    if (!resolvedOrgId) {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    // Retrieve via repository (dynamically resolving to Firestore or In-Memory fallback)
    const dbApprovals = await repos.approvals.getApprovalsByOrganizationId(resolvedOrgId);

    let filteredApprovals = dbApprovals;
    if (storeConnectionId) {
      filteredApprovals = dbApprovals.filter(a => a.storeConnectionId === storeConnectionId);
    }

    // Support legacy seed queue list in in-memory mode for backwards compatibility
    const isFirestore = isFirestoreConfigured();
    const legacyQueue = approvalService.getApprovals().map(a => ({
      ...a,
      organizationId: (a as any).organizationId || "demo-org-id",
      storeConnectionId: (a as any).storeConnectionId || "store-luminary",
      agentInstallationId: (a as any).agentInstallationId || "inst-mock"
    })).filter(a => a.organizationId === resolvedOrgId);
    
    // Prefer database records if Firestore is configured (never fall back to in-memory), otherwise use filtered cache
    const finalApprovals: any[] = isFirestore ? filteredApprovals : (filteredApprovals.length > 0 ? filteredApprovals : legacyQueue);

    let matchedApprovals: any[] = finalApprovals;
    if (status && typeof status === "string") {
      matchedApprovals = finalApprovals.filter(a => a.status === status);
    }

    // Map through legacy compat builder on-the-fly
    res.json(matchedApprovals.map(buildLegacyApprovalShape));
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/:id/decide", async (req: any, res: any) => {
  const { id } = req.params;
  const { decision } = req.body;
  const requestOrgId = req.body.organizationId || req.query.organizationId;
  const requestShop = req.body.shop || req.query.shop;

  try {
    if (!decision || !["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({ ok: false, error: "Invalid or missing decision parameter. Acceptable: 'APPROVE', 'REJECT'." });
    }

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;

    if (requestShop && typeof requestShop === "string") {
      const cleanShop = normalizeShopDomain(requestShop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

      if (requestOrgId && typeof requestOrgId === "string") {
        if (storeConnection.organizationId !== requestOrgId) {
          return res.status(403).json({ ok: false, error: "Access denied. Store does not belong to this organization." });
        }
      }
      resolvedOrgId = storeConnection.organizationId;
    } else {
      if (!requestOrgId || typeof requestOrgId !== "string") {
        return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
      }
      resolvedOrgId = requestOrgId;
    }

    if (!resolvedOrgId) {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }
    
    // 1. Resolve from dynamic repository provider
    let approvalItem = await repos.approvals.getApprovalById(id);

    // Fallback search to legacy queue list if repository misses (backwards compatibility for mock seeds)
    if (!approvalItem) {
      const legacyItem = approvalService.getApprovals().find(a => a.id === id);
      if (legacyItem) {
        approvalItem = {
          id: legacyItem.id,
          organizationId: (legacyItem as any).organizationId || resolvedOrgId,
          storeConnectionId: (legacyItem as any).storeConnectionId || "store-luminary",
          agentInstallationId: (legacyItem as any).agentInstallationId || "inst-mock",
          agentId: legacyItem.agentId,
          toolName: "catalog.products.propose_update",
          requestedBy: legacyItem.agentName,
          requestedAt: legacyItem.timestamp,
          status: legacyItem.status as any,
          riskLevel: "Medium",
          targetType: "PRODUCT_PROPOSAL",
          targetId: legacyItem.targetId,
          proposedChangesSummary: legacyItem.details.summary,
          diffSummary: legacyItem.details.summary,
          sanitizedPayload: legacyItem.details.fields || {},
          allowedFields: ["title", "vendor", "productType", "status", "tags"]
        };
      }
    }

    if (!approvalItem) {
      return res.status(404).json({ ok: false, error: "Approval request not found" });
    }

    // Strict tenant isolation scope check
    if (approvalItem.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Approval request does not belong to this organization." });
    }

    if (approvalItem.status !== "PENDING") {
      return res.status(400).json({ ok: false, error: "Action is already finalized." });
    }

    const now = new Date().toISOString();

    if (decision === "REJECT") {
      // Update repository status
      const updated = await repos.approvals.updateApprovalRequest(id, {
        status: "REJECTED",
        decidedAt: now,
        decidedBy: "Shop Owner"
      });

      // Update local memory legacy queue if applicable
      const queueIdx = approvalService.approvalQueue.findIndex(a => a.id === id);
      if (queueIdx !== -1) {
        approvalService.approvalQueue[queueIdx].status = "REJECTED";
        approvalService.approvalQueue[queueIdx].decidedAt = now;
      }

      const legacyCompatItem = buildLegacyApprovalShape(approvalItem);

      // Audit decision using writeAuditEvent
      await writeAuditEvent({
        organizationId: approvalItem.organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: "Shop Owner",
        event: AuditEventNames.APPROVAL_REJECTED,
        description: `Rejected modification proposed by ${approvalItem.requestedBy}: '${legacyCompatItem.details.title}'`,
        decision: "blocked",
        reason: "merchant_rejected",
        metadata: {
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          approvalId: id,
          decision: "blocked",
          reason: "merchant_rejected"
        }
      });

      return res.json(buildLegacyApprovalShape(updated || approvalItem));
    } else {
      // decision === "APPROVE"
      // Mark as APPROVED in database
      const updated = await repos.approvals.updateApprovalRequest(id, {
        status: "APPROVED",
        decidedAt: now,
        decidedBy: "Shop Owner"
      });

      // Update local memory legacy queue if applicable
      const queueIdx = approvalService.approvalQueue.findIndex(a => a.id === id);
      if (queueIdx !== -1) {
        approvalService.approvalQueue[queueIdx].status = "APPROVED";
        approvalService.approvalQueue[queueIdx].decidedAt = now;
      }

      const legacyCompatItem = buildLegacyApprovalShape(approvalItem);

      // Audit approval decision
      await writeAuditEvent({
        organizationId: approvalItem.organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: "Shop Owner",
        event: AuditEventNames.APPROVAL_APPROVED,
        description: `Approved changes for '${legacyCompatItem.details.title}' proposed by ${approvalItem.requestedBy}`,
        decision: "allowed",
        metadata: {
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          approvalId: id,
          decision: "allowed"
        }
      });

      // Return a containment response indicating deferred execution without invoking mutations
      return res.json({
        ok: true,
        status: "APPROVED",
        executionDeferred: true,
        approval: buildLegacyApprovalShape(updated || approvalItem)
      });
    }
  } catch (error: any) {
    const isNotFound = error.message === "Approval request not found";
    const isBadReq = error.message === "Action is already finalized.";
    res.status(isNotFound ? 404 : isBadReq ? 400 : 500).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/:id/execute", async (req: any, res: any) => {
  const { id } = req.params;
  const organizationId = req.body.organizationId || req.query.organizationId;
  const shop = req.body.shop || req.query.shop;
  const storeConnectionId = req.body.storeConnectionId || req.query.storeConnectionId;
  const performer = req.body.performer || "Shop Owner";

  try {
    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    const repos = getRepositories();
    let approvalItem = await repos.approvals.getApprovalById(id);

    // Fallback search to legacy queue list if repository misses (backwards compatibility for mock seeds)
    if (!approvalItem) {
      const legacyItem = approvalService.getApprovals().find(a => a.id === id);
      if (legacyItem) {
        approvalItem = {
          id: legacyItem.id,
          organizationId: (legacyItem as any).organizationId || organizationId,
          storeConnectionId: (legacyItem as any).storeConnectionId || "store-luminary",
          agentInstallationId: (legacyItem as any).agentInstallationId || "inst-mock",
          agentId: legacyItem.agentId,
          toolName: "catalog.products.propose_update",
          requestedBy: legacyItem.agentName,
          requestedAt: legacyItem.timestamp,
          status: legacyItem.status as any,
          riskLevel: "Medium",
          targetType: "PRODUCT_PROPOSAL",
          targetId: legacyItem.targetId,
          proposedChangesSummary: legacyItem.details.summary,
          diffSummary: legacyItem.details.summary,
          sanitizedPayload: legacyItem.details.fields || {},
          allowedFields: ["title", "vendor", "productType", "status", "tags"]
        };
      }
    }

    if (!approvalItem) {
      return res.status(404).json({ ok: false, error: "Approval request not found" });
    }

    // Strict tenant boundary validation
    if (approvalItem.organizationId !== organizationId) {
      return res.status(403).json({ ok: false, error: "Access denied. Approval request does not belong to this organization." });
    }

    // Strengthened store connection validations
    if (storeConnectionId && typeof storeConnectionId === "string") {
      if (storeConnectionId !== approvalItem.storeConnectionId) {
        return res.status(400).json({ ok: false, error: "Provided storeConnectionId does not match the approval request." });
      }
    }

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection || storeConnection.id !== approvalItem.storeConnectionId) {
        return res.status(400).json({ ok: false, error: "Provided shop does not match the approval request." });
      }
    }

    // Execute the approved mutation through the executor service
    const executedApproval = await executorService.executeApprovedProductMutation(
      id,
      organizationId,
      performer
    );

    // Update local memory legacy queue if applicable
    const queueIdx = approvalService.approvalQueue.findIndex(a => a.id === id);
    if (queueIdx !== -1) {
      approvalService.approvalQueue[queueIdx].status = executedApproval.status as any;
      (approvalService.approvalQueue[queueIdx] as any).executedAt = executedApproval.executedAt;
    }

    return res.json({
      ok: true,
      approval: buildLegacyApprovalShape(executedApproval)
    });
  } catch (error: any) {
    if (error.code === "EXECUTION_BLOCKED") {
      return res.status(400).json({
        ok: false,
        code: "EXECUTION_BLOCKED",
        status: "BLOCKED",
        error: "Store connection is missing write_products scope. Mutations are disabled for this connection."
      });
    }
    const isNotFound = error.code === "APPROVAL_NOT_FOUND" || error.message === "Approval request not found";
    const isTenantViolation = error.code === "TENANT_ISOLATION_VIOLATION" || error.message?.includes("Access denied");
    const isBlocked = error.code === "INVALID_APPROVAL_STATE";
    const isConflict = error.code === "CONCURRENCY_CONFLICT";

    const statusCode = isNotFound ? 404 : (isTenantViolation ? 403 : (isBlocked || isConflict ? 400 : 500));
    res.status(statusCode).json({ ok: false, error: error.message });
  }
});

router.get("/approvals/:id", async (req: any, res: any) => {
  const { id } = req.params;
  const organizationId = req.query.organizationId || req.body.organizationId;
  const shop = req.query.shop || req.body.shop;

  try {
    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    const repos = getRepositories();
    let approvalItem = await repos.approvals.getApprovalById(id);

    if (!approvalItem) {
      const legacyItem = approvalService.getApprovals().find(a => a.id === id);
      if (legacyItem) {
        approvalItem = {
          id: legacyItem.id,
          organizationId: (legacyItem as any).organizationId || organizationId,
          storeConnectionId: (legacyItem as any).storeConnectionId || "store-luminary",
          agentInstallationId: (legacyItem as any).agentInstallationId || "inst-mock",
          agentId: legacyItem.agentId,
          toolName: "catalog.products.propose_update",
          requestedBy: legacyItem.agentName,
          requestedAt: legacyItem.timestamp,
          status: legacyItem.status as any,
          riskLevel: "Medium",
          targetType: "PRODUCT_PROPOSAL",
          targetId: legacyItem.targetId,
          proposedChangesSummary: legacyItem.details.summary,
          diffSummary: legacyItem.details.summary,
          sanitizedPayload: legacyItem.details.fields || {},
          allowedFields: ["title", "vendor", "productType", "status", "tags"]
        };
      }
    }

    if (!approvalItem) {
      return res.status(404).json({ ok: false, error: "Approval request not found" });
    }

    if (approvalItem.organizationId !== organizationId) {
      return res.status(403).json({ ok: false, error: "Access denied. Approval request does not belong to this organization." });
    }

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection || storeConnection.id !== approvalItem.storeConnectionId) {
        return res.status(400).json({ ok: false, error: "Provided shop does not match the approval request." });
      }
    }

    // Log APPROVAL_VIEWED audit trail
    await writeAuditEvent({
      organizationId,
      storeConnectionId: approvalItem.storeConnectionId,
      agentInstallationId: approvalItem.agentInstallationId,
      agentId: approvalItem.agentId,
      toolName: approvalItem.toolName,
      initiator: "system",
      event: AuditEventNames.APPROVAL_VIEWED,
      description: `Viewed operational details of approval request '${id}'`,
      decision: "allowed",
      metadata: {
        approvalId: id,
        decision: "allowed"
      }
    });

    // Sanitized Operational Response Shape (Strict: no legacy adaptor)
    return res.json({
      ok: true,
      approval: buildOperationalApprovalShape(approvalItem)
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/approvals/:id/audit", async (req: any, res: any) => {
  const { id } = req.params;
  const organizationId = req.query.organizationId || req.body.organizationId;

  try {
    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    const repos = getRepositories();
    const approvalItem = await repos.approvals.getApprovalById(id);

    if (!approvalItem) {
      return res.status(404).json({ ok: false, error: "Approval request not found" });
    }

    if (approvalItem.organizationId !== organizationId) {
      return res.status(403).json({ ok: false, error: "Access denied. Approval request does not belong to this organization." });
    }

    // Log APPROVAL_AUDIT_VIEWED audit trail before fetching to ensure the current read sees this event
    await writeAuditEvent({
      organizationId,
      storeConnectionId: approvalItem.storeConnectionId,
      agentInstallationId: approvalItem.agentInstallationId,
      agentId: approvalItem.agentId,
      toolName: approvalItem.toolName,
      initiator: "system",
      event: AuditEventNames.APPROVAL_AUDIT_VIEWED,
      description: `Viewed audit trail logs of approval request '${id}'`,
      decision: "allowed",
      metadata: {
        approvalId: id,
        decision: "allowed"
      }
    });

    // Retrieve via repository
    const dbEvents = await repos.audit.getAuditEventsByOrganizationId(organizationId);
    
    // In-memory cache fallback strictly filtered by organizationId
    const cachedLogs = getAuditLogs(organizationId, approvalItem.storeConnectionId);
    
    const finalLogs = (isFirestoreConfigured() ? dbEvents : (dbEvents.length > 0 ? dbEvents : cachedLogs)) as any[];

    // Primary filter matching e.metadata?.approvalId === id, secondary context matching lastExecutionCorrelationId
    const filteredEvents = finalLogs.filter(e => 
      (e.metadata?.approvalId === id) || 
      (e.correlationId && e.correlationId === id) ||
      (approvalItem.lastExecutionCorrelationId && e.correlationId === approvalItem.lastExecutionCorrelationId)
    );

    return res.json(filteredEvents);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/:id/reset-failed", async (req: any, res: any) => {
  const { id } = req.params;
  const organizationId = req.body.organizationId || req.query.organizationId;
  const performedByRaw = req.body.performedBy || req.query.performedBy || req.body.actor || req.query.actor;
  const shop = req.body.shop || req.query.shop;
  const storeConnectionIdInput = req.body.storeConnectionId || req.query.storeConnectionId;

  try {
    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    if (typeof performedByRaw !== "string") {
      return res.status(400).json({ ok: false, error: "performedBy or actor parameter must be a string." });
    }

    const trimmedActor = performedByRaw.trim();
    if (trimmedActor.length === 0) {
      return res.status(400).json({ ok: false, error: "performedBy or actor parameter cannot be empty after trimming." });
    }

    if (trimmedActor.toLowerCase() === "system") {
      return res.status(400).json({ ok: false, error: "\"system\" actor is reserved for internal processes only and cannot be passed in public API calls." });
    }

    if (trimmedActor.length > 100) {
      return res.status(400).json({ ok: false, error: "performedBy or actor parameter exceeds the maximum allowed length of 100 characters." });
    }

    const performedBy = trimmedActor;

    const repos = getRepositories();
    const approvalItem = await repos.approvals.getApprovalById(id);

    if (!approvalItem) {
      return res.status(404).json({ ok: false, error: "Approval request not found" });
    }

    // Strict tenant scoping check
    if (approvalItem.organizationId !== organizationId) {
      await writeAuditEvent({
        organizationId: approvalItem.organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: performedBy,
        event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
        description: `Reset recovery blocked for approval '${id}': Access denied.`,
        decision: "blocked",
        reason: "tenant_isolation_violation",
        metadata: {
          approvalId: id,
          performedBy,
          reason: "tenant_isolation_violation",
          decision: "blocked"
        }
      });
      return res.status(403).json({ ok: false, error: "Access denied. Approval request does not belong to this organization." });
    }

    // Determine target store connection
    let validatedStoreConnId = storeConnectionIdInput;
    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }
      validatedStoreConnId = storeConnection.id;
    }

    // Recovery mismatch check
    if (validatedStoreConnId && validatedStoreConnId !== approvalItem.storeConnectionId) {
      await writeAuditEvent({
        organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: performedBy,
        event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
        description: `Reset recovery blocked for approval '${id}': Store connection mismatch.`,
        decision: "blocked",
        reason: "store_connection_mismatch",
        metadata: {
          approvalId: id,
          performedBy,
          reason: "store_connection_mismatch",
          decision: "blocked"
        }
      });
      return res.status(400).json({ ok: false, error: "Store connection mismatch." });
    }

    if (approvalItem.status !== "FAILED") {
      await writeAuditEvent({
        organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: performedBy,
        event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
        description: `Reset recovery blocked for approval '${id}': expected status FAILED, got ${approvalItem.status}.`,
        decision: "blocked",
        reason: "invalid_lifecycle_state",
        metadata: {
          approvalId: id,
          performedBy,
          reason: "invalid_lifecycle_state",
          decision: "blocked"
        }
      });
      return res.status(400).json({ ok: false, error: `Invalid status: expected FAILED state, got ${approvalItem.status}.` });
    }

    const updated = await repos.approvals.resetFailedApproval({
      approvalId: id,
      organizationId,
      storeConnectionId: approvalItem.storeConnectionId,
      performedBy
    });

    // Log APPROVAL_RECOVERY_RESET audit trail
    await writeAuditEvent({
      organizationId: approvalItem.organizationId,
      storeConnectionId: approvalItem.storeConnectionId,
      agentInstallationId: approvalItem.agentInstallationId,
      agentId: approvalItem.agentId,
      toolName: approvalItem.toolName,
      initiator: performedBy,
      event: AuditEventNames.APPROVAL_RECOVERY_RESET,
      description: `Reset failed approval request '${id}' back to APPROVED status by ${performedBy}`,
      decision: "allowed",
      metadata: {
        approvalId: id,
        performedBy,
        decision: "allowed"
      }
    });

    return res.json({
      ok: true,
      approval: buildOperationalApprovalShape(updated)
    });
  } catch (error: any) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/:id/mark-execution-failed", async (req: any, res: any) => {
  const { id } = req.params;
  const organizationId = req.body.organizationId || req.query.organizationId;
  const performedByRaw = req.body.performedBy || req.query.performedBy || req.body.actor || req.query.actor;
  const rawReason = req.body.reason;
  const shop = req.body.shop || req.query.shop;
  const storeConnectionIdInput = req.body.storeConnectionId || req.query.storeConnectionId;

  try {
    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    if (typeof performedByRaw !== "string") {
      return res.status(400).json({ ok: false, error: "performedBy or actor parameter must be a string." });
    }

    const trimmedActor = performedByRaw.trim();
    if (trimmedActor.length === 0) {
      return res.status(400).json({ ok: false, error: "performedBy or actor parameter cannot be empty after trimming." });
    }

    if (trimmedActor.toLowerCase() === "system") {
      return res.status(400).json({ ok: false, error: "\"system\" actor is reserved for internal processes only and cannot be passed in public API calls." });
    }

    if (trimmedActor.length > 100) {
      return res.status(400).json({ ok: false, error: "performedBy or actor parameter exceeds the maximum allowed length of 100 characters." });
    }

    const performedBy = trimmedActor;

    let reason = "execution_timeout";
    if (rawReason !== undefined && rawReason !== null) {
      if (typeof rawReason !== "string") {
        return res.status(400).json({ ok: false, error: "reason parameter must be a string." });
      }
      reason = rawReason.trim();
    }

    const allowlist = ["execution_timeout", "operator_marked_stuck", "manual_recovery"];
    if (!allowlist.includes(reason)) {
      return res.status(400).json({ ok: false, error: `Invalid recovery reason. Accepted reasons: ${allowlist.join(", ")}` });
    }

    const reasonInput = reason;

    const repos = getRepositories();
    const approvalItem = await repos.approvals.getApprovalById(id);

    if (!approvalItem) {
      return res.status(404).json({ ok: false, error: "Approval request not found" });
    }

    // Strict tenant scoping check
    if (approvalItem.organizationId !== organizationId) {
      await writeAuditEvent({
        organizationId: approvalItem.organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: performedBy,
        event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
        description: `Stuck timeout recovery blocked for approval '${id}': Access denied.`,
        decision: "blocked",
        reason: "tenant_isolation_violation",
        metadata: {
          approvalId: id,
          performedBy,
          reason: "tenant_isolation_violation",
          decision: "blocked"
        }
      });
      return res.status(403).json({ ok: false, error: "Access denied. Approval request does not belong to this organization." });
    }

    // Determine target store connection
    let validatedStoreConnId = storeConnectionIdInput;
    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }
      validatedStoreConnId = storeConnection.id;
    }

    // Recovery mismatch check
    if (validatedStoreConnId && validatedStoreConnId !== approvalItem.storeConnectionId) {
      await writeAuditEvent({
        organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: performedBy,
        event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
        description: `Stuck timeout recovery blocked for approval '${id}': Store connection mismatch.`,
        decision: "blocked",
        reason: "store_connection_mismatch",
        metadata: {
          approvalId: id,
          performedBy,
          reason: "store_connection_mismatch",
          decision: "blocked"
        }
      });
      return res.status(400).json({ ok: false, error: "Store connection mismatch." });
    }

    if (approvalItem.status !== "EXECUTING") {
      await writeAuditEvent({
        organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: performedBy,
        event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
        description: `Stuck timeout recovery blocked for approval '${id}': expected status EXECUTING, got ${approvalItem.status}.`,
        decision: "blocked",
        reason: "invalid_lifecycle_state",
        metadata: {
          approvalId: id,
          performedBy,
          reason: "invalid_lifecycle_state",
          decision: "blocked"
        }
      });
      return res.status(400).json({ ok: false, error: `Invalid status: expected EXECUTING state, got ${approvalItem.status}.` });
    }

    // Configure timeout safe threshold bounds (strictly default back to 15m/900k on 0/negative env values)
    const envStuckMs = Number(process.env.APPROVAL_EXECUTION_STUCK_TIMEOUT_MS);
    const APPROVAL_EXECUTION_STUCK_TIMEOUT_MS = (!isNaN(envStuckMs) && envStuckMs > 0) ? envStuckMs : 900000;

    const updated = await repos.approvals.markStuckExecutingAsFailed({
      approvalId: id,
      organizationId,
      storeConnectionId: approvalItem.storeConnectionId,
      timeoutMs: APPROVAL_EXECUTION_STUCK_TIMEOUT_MS,
      performedBy,
      reason: reasonInput as any
    });

    // Log APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED audit trail
    await writeAuditEvent({
      organizationId: approvalItem.organizationId,
      storeConnectionId: approvalItem.storeConnectionId,
      agentInstallationId: approvalItem.agentInstallationId,
      agentId: approvalItem.agentId,
      toolName: approvalItem.toolName,
      initiator: performedBy,
      event: AuditEventNames.APPROVAL_EXECUTION_TIMEOUT_MARKED_FAILED,
      description: `Marked stuck execution approval request '${id}' as FAILED status by ${performedBy} due to ${reasonInput}`,
      decision: "allowed",
      metadata: {
        approvalId: id,
        performedBy,
        decision: "allowed"
      }
    });

    return res.json({
      ok: true,
      approval: buildOperationalApprovalShape(updated)
    });
  } catch (error: any) {
    const initiatorName = (typeof performedByRaw === "string" && performedByRaw.trim().length > 0) ? performedByRaw.trim() : "system";
    await writeAuditEvent({
      organizationId,
      event: AuditEventNames.APPROVAL_RECOVERY_BLOCKED,
      initiator: initiatorName,
      description: `Stuck timeout recovery blocked for approval '${id}': ${error.message}`,
      decision: "blocked",
      reason: "recovery_failed",
      metadata: {
        approvalId: id,
        performedBy: initiatorName,
        reason: "recovery_failed",
        decision: "blocked"
      }
    });
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/batch-decide", async (req: any, res: any) => {
  const { ids, decision, organizationId: claimedOrgId, shop } = req.body;

  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing or invalid ids parameter. Acceptable: array of strings." });
    }
    if (ids.length > 10) {
      return res.status(400).json({ ok: false, error: "Batch size exceeds maximum limit of 10 items." });
    }
    if (!decision || !["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({ ok: false, error: "Invalid or missing decision parameter. Acceptable: 'APPROVE', 'REJECT'." });
    }
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required shop parameter." });
    }

    const repos = getRepositories();
    const cleanShop = normalizeShopDomain(shop);
    const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
    if (!storeConnection) {
      return res.status(404).json({ ok: false, error: "Store connection not found." });
    }

    // Claimed vs Authority check
    if (!claimedOrgId || storeConnection.organizationId !== claimedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Claimed organizationId does not match shop context authority." });
    }

    const resolvedOrgId = storeConnection.organizationId;
    const storeConnectionId = storeConnection.id;

    // Check duplicate IDs
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      return res.status(400).json({ ok: false, error: "Duplicate IDs detected in batch request." });
    }

    // Phase 1: Preflight Validation (Strict item existence, tenant checks, eligibility)
    const fetchedItems: any[] = [];
    for (const id of ids) {
      let approvalItem = await repos.approvals.getApprovalById(id);

      // Fallback search to legacy queue list if repository misses (backwards compatibility for mock seeds)
      if (!approvalItem) {
        const legacyItem = approvalService.getApprovals().find(a => a.id === id);
        if (legacyItem) {
          approvalItem = {
            id: legacyItem.id,
            organizationId: (legacyItem as any).organizationId || resolvedOrgId,
            storeConnectionId: (legacyItem as any).storeConnectionId || "store-luminary",
            agentInstallationId: (legacyItem as any).agentInstallationId || "inst-mock",
            agentId: legacyItem.agentId,
            toolName: "catalog.products.propose_update",
            requestedBy: legacyItem.agentName,
            requestedAt: legacyItem.timestamp,
            status: legacyItem.status as any,
            riskLevel: "Medium",
            targetType: "PRODUCT_PROPOSAL",
            targetId: legacyItem.targetId,
            proposedChangesSummary: legacyItem.details.summary,
            diffSummary: legacyItem.details.summary,
            sanitizedPayload: legacyItem.details.fields || {},
            allowedFields: ["title", "vendor", "productType", "status", "tags"]
          };
        }
      }

      if (!approvalItem) {
        return res.status(404).json({ ok: false, error: `Approval request '${id}' not found.` });
      }

      // Cross-tenant boundary check
      if (approvalItem.organizationId !== resolvedOrgId) {
        return res.status(403).json({ ok: false, error: `Access denied. Approval request '${id}' does not belong to this organization.` });
      }
      if (storeConnectionId && approvalItem.storeConnectionId !== storeConnectionId) {
        return res.status(400).json({ ok: false, error: `Store connection context mismatch for approval '${id}'.` });
      }

      // Eligibility: Batch decide may only operate on PENDING approvals
      if (approvalItem.status !== "PENDING") {
        return res.status(400).json({
          ok: false,
          error: `Approval request '${id}' has status '${approvalItem.status}' and cannot be decided (only PENDING approvals are eligible).`
        });
      }

      fetchedItems.push(approvalItem);
    }

    // Phase 2: Sequential Decide Operation
    const results: any[] = [];
    const now = new Date().toISOString();

    for (const approvalItem of fetchedItems) {
      if (decision === "REJECT") {
        const updated = await repos.approvals.updateApprovalRequest(approvalItem.id, {
          status: "REJECTED",
          decidedAt: now,
          decidedBy: "Shop Owner"
        });

        // Update local memory legacy queue if applicable
        const queueIdx = approvalService.approvalQueue.findIndex(a => a.id === approvalItem.id);
        if (queueIdx !== -1) {
          approvalService.approvalQueue[queueIdx].status = "REJECTED";
          approvalService.approvalQueue[queueIdx].decidedAt = now;
        }

        const legacyCompatItem = buildLegacyApprovalShape(approvalItem);
        await writeAuditEvent({
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          agentInstallationId: approvalItem.agentInstallationId,
          agentId: approvalItem.agentId,
          toolName: approvalItem.toolName,
          initiator: "Shop Owner",
          event: AuditEventNames.APPROVAL_REJECTED,
          description: `Rejected modification proposed by ${approvalItem.requestedBy} inside batch: '${legacyCompatItem.details.title}'`,
          decision: "blocked",
          reason: "merchant_rejected",
          metadata: {
            organizationId: approvalItem.organizationId,
            storeConnectionId: approvalItem.storeConnectionId,
            approvalId: approvalItem.id,
            decision: "blocked",
            reason: "merchant_rejected"
          }
        });

        results.push({ id: approvalItem.id, status: "REJECTED" });
      } else {
        // decision === "APPROVE"
        const updated = await repos.approvals.updateApprovalRequest(approvalItem.id, {
          status: "APPROVED",
          decidedAt: now,
          decidedBy: "Shop Owner"
        });

        // Update local memory legacy queue if applicable
        const queueIdx = approvalService.approvalQueue.findIndex(a => a.id === approvalItem.id);
        if (queueIdx !== -1) {
          approvalService.approvalQueue[queueIdx].status = "APPROVED";
          approvalService.approvalQueue[queueIdx].decidedAt = now;
        }

        const legacyCompatItem = buildLegacyApprovalShape(approvalItem);
        await writeAuditEvent({
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          agentInstallationId: approvalItem.agentInstallationId,
          agentId: approvalItem.agentId,
          toolName: approvalItem.toolName,
          initiator: "Shop Owner",
          event: AuditEventNames.APPROVAL_APPROVED,
          description: `Approved changes inside batch for '${legacyCompatItem.details.title}' proposed by ${approvalItem.requestedBy}`,
          decision: "allowed",
          metadata: {
            organizationId: approvalItem.organizationId,
            storeConnectionId: approvalItem.storeConnectionId,
            approvalId: approvalItem.id,
            decision: "allowed"
          }
        });

        results.push({ id: approvalItem.id, status: "APPROVED" });
      }
    }

    if (decision === "APPROVE") {
      return res.json({
        ok: true,
        decision: "APPROVE",
        executionDeferred: true,
        results
      });
    } else {
      return res.json({
        ok: true,
        decision: "REJECT",
        results
      });
    }
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/batch-execute", async (req: any, res: any) => {
  const { ids, organizationId: claimedOrgId, shop, performer = "Shop Owner" } = req.body;

  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing or invalid ids parameter. Acceptable: array of strings." });
    }
    if (ids.length > 10) {
      return res.status(400).json({ ok: false, error: "Batch size exceeds maximum limit of 10 items." });
    }
    if (!shop || typeof shop !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required shop parameter." });
    }

    const repos = getRepositories();
    const cleanShop = normalizeShopDomain(shop);
    const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
    if (!storeConnection) {
      return res.status(404).json({ ok: false, error: "Store connection not found." });
    }

    // Claimed vs Authority check
    if (!claimedOrgId || storeConnection.organizationId !== claimedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Claimed organizationId does not match shop context authority." });
    }

    const resolvedOrgId = storeConnection.organizationId;
    const storeConnectionId = storeConnection.id;

    // Check duplicate IDs
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      return res.status(400).json({ ok: false, error: "Duplicate IDs detected in batch request." });
    }

    // Phase 1: Preflight Validation (Strict item existence & tenant checks)
    const fetchedItems: any[] = [];
    for (const id of ids) {
      let approvalItem = await repos.approvals.getApprovalById(id);

      // Fallback search to legacy queue list if repository misses (backwards compatibility for mock seeds)
      if (!approvalItem) {
        const legacyItem = approvalService.getApprovals().find(a => a.id === id);
        if (legacyItem) {
          approvalItem = {
            id: legacyItem.id,
            organizationId: (legacyItem as any).organizationId || resolvedOrgId,
            storeConnectionId: (legacyItem as any).storeConnectionId || "store-luminary",
            agentInstallationId: (legacyItem as any).agentInstallationId || "inst-mock",
            agentId: legacyItem.agentId,
            toolName: "catalog.products.propose_update",
            requestedBy: legacyItem.agentName,
            requestedAt: legacyItem.timestamp,
            status: legacyItem.status as any,
            riskLevel: "Medium",
            targetType: "PRODUCT_PROPOSAL",
            targetId: legacyItem.targetId,
            proposedChangesSummary: legacyItem.details.summary,
            diffSummary: legacyItem.details.summary,
            sanitizedPayload: legacyItem.details.fields || {},
            allowedFields: ["title", "vendor", "productType", "status", "tags"]
          };
        }
      }

      if (!approvalItem) {
        return res.status(404).json({ ok: false, error: `Approval request '${id}' not found.` });
      }

      // Cross-tenant boundary check
      if (approvalItem.organizationId !== resolvedOrgId) {
        return res.status(403).json({ ok: false, error: `Access denied. Approval request '${id}' does not belong to this organization.` });
      }
      if (storeConnectionId && approvalItem.storeConnectionId !== storeConnectionId) {
        return res.status(400).json({ ok: false, error: `Store connection context mismatch for approval '${id}'.` });
      }

      fetchedItems.push(approvalItem);
    }

    // Phase 2: Sequential execution/operation
    const results: any[] = [];

    for (const approvalItem of fetchedItems) {
      const currentStatus = approvalItem.status;

      // Idempotency & Eligibility Gating Rules
      if (currentStatus === "EXECUTING") {
        results.push({ id: approvalItem.id, status: "ALREADY_EXECUTING", error: "Item is already claimed & currently executing." });
      } else if (currentStatus === "APPLIED" || currentStatus === "EXECUTED") {
        results.push({ id: approvalItem.id, status: "ALREADY_APPLIED" });
      } else if (currentStatus !== "APPROVED") {
        results.push({ id: approvalItem.id, status: "INELIGIBLE", error: `Approval has status '${currentStatus}' (only APPROVED approvals can be executed).` });
      } else {
        // Sequentially execute using the ApprovedProductMutationExecutorService single-item pipeline
        try {
          // Fixed safety delay to throttle Shopify Admin API cost consumption
          await new Promise(resolve => setTimeout(resolve, 500));

          // Run single-item execution (preserves Claim Lock, execution logging, token lookup, mutation scopes)
          const executed = await executorService.executeApprovedProductMutation(
            approvalItem.id,
            resolvedOrgId,
            performer
          );

          // Update local memory legacy queue if applicable
          const queueIdx = approvalService.approvalQueue.findIndex(a => a.id === approvalItem.id);
          if (queueIdx !== -1) {
            approvalService.approvalQueue[queueIdx].status = executed.status as any;
            (approvalService.approvalQueue[queueIdx] as any).executedAt = executed.executedAt;
          }

          results.push({ id: approvalItem.id, status: executed.status });
        } catch (execError: any) {
          const isBlocked = execError.code === "EXECUTION_BLOCKED" ||
                            execError.message?.includes("missing write_products scope") ||
                            execError.message?.includes("Store connection is missing write_products scope");
          if (isBlocked) {
            results.push({ id: approvalItem.id, status: "BLOCKED", error: execError.message });
          } else {
            results.push({ id: approvalItem.id, status: "FAILED", error: execError.message });
          }
        }
      }
    }

    return res.json({
      ok: true,
      results
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
