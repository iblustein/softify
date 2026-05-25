import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { isFirestoreConfigured } from "../config/firestore.config.js";
import { AuditEventNames } from "../domain/types.js";
import * as approvalService from "../services/approval.service.js";

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

router.get("/approvals", async (req: any, res: any) => {
  try {
    const { organizationId, shop } = req.query;

    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    const repos = getRepositories();
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

      // Strict tenant scoping check: verify store connection scopes to requesting organizationId
      if (storeConnection.organizationId !== organizationId) {
        return res.status(403).json({ ok: false, error: "Access denied. Store does not belong to this organization." });
      }

      storeConnectionId = storeConnection.id;
    }

    // Retrieve via repository (dynamically resolving to Firestore or In-Memory fallback)
    const dbApprovals = await repos.approvals.getApprovalsByOrganizationId(organizationId);

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
    })).filter(a => a.organizationId === organizationId);
    
    // Prefer database records if Firestore is configured (never fall back to in-memory), otherwise use filtered cache
    const finalApprovals = isFirestore ? filteredApprovals : (filteredApprovals.length > 0 ? filteredApprovals : legacyQueue);

    // Map through legacy compat builder on-the-fly
    res.json(finalApprovals.map(buildLegacyApprovalShape));
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/approvals/:id/decide", async (req: any, res: any) => {
  const { id } = req.params;
  const { decision, organizationId } = req.body;

  try {
    if (!decision || !["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({ ok: false, error: "Invalid or missing decision parameter. Acceptable: 'APPROVE', 'REJECT'." });
    }

    if (!organizationId || typeof organizationId !== "string") {
      return res.status(400).json({ ok: false, error: "Missing required organizationId parameter." });
    }

    const repos = getRepositories();
    
    // 1. Resolve from dynamic repository provider
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

    // Strict tenant isolation scope check
    if (approvalItem.organizationId !== organizationId) {
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

export default router;
