import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { getMockProducts, setMockProducts } from "../data/mock-products.js";
import { getActiveThemeCode, setActiveThemeCode } from "../data/mock-theme.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { isFirestoreConfigured } from "../config/firestore.config.js";
import { AuditEventNames } from "../domain/types.js";
import * as approvalService from "../services/approval.service.js";

const router = Router();

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

    res.json(finalApprovals);
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
          toolName: "shopify.prepareProductUpdate",
          requestedBy: legacyItem.agentName,
          requestedAt: legacyItem.timestamp,
          status: legacyItem.status as any,
          riskLevel: "Medium",
          summary: legacyItem.details.summary,
          beforeState: legacyItem.details.before,
          afterState: legacyItem.details.after,
          actionType: legacyItem.actionType,
          targetId: legacyItem.targetId,
          details: legacyItem.details
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
      // A. Update repository status
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

      // B. Audit decision using writeAuditEvent
      await writeAuditEvent({
        organizationId: approvalItem.organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: "Shop Owner",
        event: AuditEventNames.APPROVAL_REJECTED,
        description: `Rejected modification proposed by ${approvalItem.requestedBy}: '${approvalItem.details.title}'`,
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

      return res.json(updated || approvalItem);
    } else {
      // decision === "APPROVE"
      // A. Mark as APPROVED
      await repos.approvals.updateApprovalRequest(id, {
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

      // Audit approval decision
      await writeAuditEvent({
        organizationId: approvalItem.organizationId,
        storeConnectionId: approvalItem.storeConnectionId,
        agentInstallationId: approvalItem.agentInstallationId,
        agentId: approvalItem.agentId,
        toolName: approvalItem.toolName,
        initiator: "Shop Owner",
        event: AuditEventNames.APPROVAL_APPROVED,
        description: `Approved changes for '${approvalItem.details.title}' proposed by ${approvalItem.requestedBy}`,
        decision: "allowed",
        metadata: {
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          approvalId: id,
          decision: "allowed"
        }
      });

      try {
        // Execute/apply the write tool outcome!
        if (approvalItem.actionType === "PRODUCT_UPDATE") {
          const productId = approvalItem.details.productId;
          const fieldsToApply = approvalItem.details.fields;

          // Update local in-memory mock products
          const products = getMockProducts();
          const prodIdx = products.findIndex(p => p.id === productId);
          if (prodIdx !== -1) {
            products[prodIdx] = {
              ...products[prodIdx],
              ...fieldsToApply
            };
            setMockProducts(products);
          }

          // Update Firestore product snapshots if configured
          const storeConn = await repos.stores.getStoreConnectionById(approvalItem.storeConnectionId);
          if (storeConn) {
            const cleanShop = storeConn.storeUrl;
            const snapshots = await repos.products.listProductSnapshotsByShop(cleanShop);
            const targetSnap = snapshots.find(s => s.shopifyProductId === String(productId));
            if (targetSnap) {
              const updatedSnap = {
                ...targetSnap,
                ...fieldsToApply,
                updatedAt: now
              };
              await repos.products.upsertProductSnapshot(updatedSnap);
            }
          }
        } else if (approvalItem.actionType === "THEME_PATCH") {
          if (approvalItem.details.patch) {
            const currentThemeCode = getActiveThemeCode();
            setActiveThemeCode(currentThemeCode + "\n" + approvalItem.details.patch);
          }
        }

        // Update state to APPLIED
        const updated = await repos.approvals.updateApprovalRequest(id, {
          status: "APPLIED"
        });

        // Audit execution success using writeAuditEvent
        await writeAuditEvent({
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          agentInstallationId: approvalItem.agentInstallationId,
          agentId: approvalItem.agentId,
          toolName: approvalItem.toolName,
          initiator: "system",
          event: AuditEventNames.APPROVAL_APPLIED,
          description: `Successfully applied approved modifications for approval request: ${id}`,
          decision: "completed",
          metadata: {
            organizationId: approvalItem.organizationId,
            storeConnectionId: approvalItem.storeConnectionId,
            approvalId: id,
            decision: "completed"
          }
        });

        return res.json(updated || approvalItem);
      } catch (applyErr: any) {
        // Update state to FAILED
        await repos.approvals.updateApprovalRequest(id, {
          status: "FAILED"
        });

        // Audit execution failure using writeAuditEvent
        await writeAuditEvent({
          organizationId: approvalItem.organizationId,
          storeConnectionId: approvalItem.storeConnectionId,
          agentInstallationId: approvalItem.agentInstallationId,
          agentId: approvalItem.agentId,
          toolName: approvalItem.toolName,
          initiator: "system",
          event: AuditEventNames.APPROVAL_FAILED,
          description: `Failed to apply approved modifications for approval request: ${id}. Error: ${applyErr.message}`,
          decision: "failed",
          reason: "apply_execution_failed",
          metadata: {
            organizationId: approvalItem.organizationId,
            storeConnectionId: approvalItem.storeConnectionId,
            approvalId: id,
            decision: "failed",
            reason: "apply_execution_failed"
          }
        });

        return res.status(500).json({ ok: false, error: `Failed to apply approval modifications: ${applyErr.message}` });
      }
    }
  } catch (error: any) {
    const isNotFound = error.message === "Approval request not found";
    const isBadReq = error.message === "Action is already finalized.";
    res.status(isNotFound ? 404 : isBadReq ? 400 : 500).json({ ok: false, error: error.message });
  }
});

export default router;
