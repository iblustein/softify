import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { AuditEventNames, ProposedAction, AllowedProductProposalField } from "../domain/types.js";
import { requestProposedActionApprovalBridge } from "../services/proposed-action-approval-bridge.service.js";

const router = Router();

router.get("/proposed-actions", async (req: any, res: any) => {
  try {
    const { organizationId, shop, status } = req.query;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

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

    let acts = await repos.proposedActions.getProposedActionsByOrganizationId(resolvedOrgId);

    if (storeConnectionId) {
      acts = acts.filter(a => a.storeConnectionId === storeConnectionId);
    }
    if (status) {
      acts = acts.filter(a => a.status === status);
    }

    res.json(acts);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/proposed-actions/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { organizationId, shop } = req.query;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

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

    const act = await repos.proposedActions.getProposedActionById(id);
    if (!act) {
      return res.status(404).json({ ok: false, error: "Proposed action not found." });
    }

    if (act.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Proposed action does not belong to this organization." });
    }

    if (storeConnectionId && act.storeConnectionId !== storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Store connection context mismatch." });
    }

    res.json(act);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/proposed-actions/:id/dismiss", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { organizationId, shop } = req.query;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

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

    const act = await repos.proposedActions.getProposedActionById(id);
    if (!act) {
      return res.status(404).json({ ok: false, error: "Proposed action not found." });
    }

    if (act.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Proposed action does not belong to this organization." });
    }

    if (storeConnectionId && act.storeConnectionId !== storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Store connection context mismatch." });
    }

    const updated = await repos.proposedActions.updateProposedAction(id, {
      status: "DISMISSED"
    });

    await writeAuditEvent({
      organizationId: resolvedOrgId,
      storeConnectionId: act.storeConnectionId,
      initiator: "Shop Owner",
      event: AuditEventNames.PROPOSED_ACTION_DISMISSED,
      description: `Dismissed proposed action: '${act.title}'`,
      decision: "allowed",
      metadata: {
        agentId: act.agentId,
        agentRunId: act.agentRunId,
        recommendationId: act.recommendationId,
        proposedActionId: id,
        status: "DISMISSED",
        decision: "allowed"
      }
    });

    res.json(updated || act);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/proposed-actions/:id/request-approval", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { organizationId, shop } = req.query;

    const repos = getRepositories();
    let resolvedOrgId: string | undefined = undefined;
    let storeConnectionId: string | undefined = undefined;

    if (shop && typeof shop === "string") {
      const cleanShop = normalizeShopDomain(shop);
      const storeConnection = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (!storeConnection) {
        return res.status(404).json({ ok: false, error: "Store connection not found." });
      }

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
      const connections = await repos.stores.getStoreConnectionsByOrganizationId(resolvedOrgId);
      if (connections.length > 0) {
        storeConnectionId = connections[0].id;
      }
    }

    if (!resolvedOrgId || !storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Missing required organizationId or store connection context." });
    }

    const updated = await requestProposedActionApprovalBridge({
      proposedActionId: id,
      organizationId: resolvedOrgId,
      storeConnectionId
    });

    res.json(updated);
  } catch (error: any) {
    // Standard response mapper handles structural errors gracefully
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/proposed-actions/batch-dismiss", async (req: any, res: any) => {
  const { ids, organizationId: claimedOrgId, shop } = req.body;

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

    // Phase 1: Preflight Validation (Strict item existence, tenant checks, eligibility)
    const fetchedItems: ProposedAction[] = [];
    for (const id of ids) {
      const act = await repos.proposedActions.getProposedActionById(id);
      if (!act) {
        return res.status(404).json({ ok: false, error: `Proposed action '${id}' not found.` });
      }

      // Cross-tenant boundary check
      if (act.organizationId !== resolvedOrgId || act.storeConnectionId !== storeConnectionId) {
        return res.status(403).json({ ok: false, error: `Access denied. Proposed action '${id}' does not belong to this organization or store connection.` });
      }

      // Eligibility safety check: only draft/non-requested proposed actions may be dismissed
      if (act.status !== "DRAFT" && act.status !== "APPROVAL_ELIGIBLE") {
        return res.status(400).json({
          ok: false,
          error: `Proposed action '${id}' has status '${act.status}' and cannot be dismissed (already bridged or finalized).`
        });
      }

      fetchedItems.push(act);
    }

    // Phase 2: Sequential execution/operation (after preflight successfully passes)
    const results: any[] = [];
    for (const act of fetchedItems) {
      const updated = await repos.proposedActions.updateProposedAction(act.id, {
        status: "DISMISSED"
      });

      await writeAuditEvent({
        organizationId: resolvedOrgId,
        storeConnectionId: act.storeConnectionId,
        initiator: "Shop Owner",
        event: AuditEventNames.PROPOSED_ACTION_DISMISSED,
        description: `Dismissed proposed action in batch: '${act.title}'`,
        decision: "allowed",
        metadata: {
          agentId: act.agentId,
          agentRunId: act.agentRunId,
          recommendationId: act.recommendationId,
          proposedActionId: act.id,
          status: "DISMISSED",
          decision: "allowed"
        }
      });

      results.push({ id: act.id, status: "DISMISSED" });
    }

    return res.json({
      ok: true,
      dismissedCount: results.length,
      results
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/proposed-actions/batch-request-approval", async (req: any, res: any) => {
  const { ids, organizationId: claimedOrgId, shop } = req.body;

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

    // Phase 1: Preflight Validation (Strict item existence, tenant checks, eligibility)
    const fetchedItems: ProposedAction[] = [];
    const classifications = new Map<string, "ALREADY_REQUESTED" | "BRIDGE_REQUIRED">();
    const allowedFieldsList = ["title", "vendor", "productType", "status", "tags"];

    for (const id of ids) {
      const act = await repos.proposedActions.getProposedActionById(id);
      if (!act) {
        return res.status(404).json({ ok: false, error: `Proposed action '${id}' not found.` });
      }

      // Cross-tenant boundary check
      if (act.organizationId !== resolvedOrgId || act.storeConnectionId !== storeConnectionId) {
        return res.status(403).json({ ok: false, error: `Access denied. Proposed action '${id}' does not belong to this organization or store connection.` });
      }

      // Classify items
      if (act.status === "APPROVAL_REQUESTED" || act.approvalRequestId) {
        classifications.set(id, "ALREADY_REQUESTED");
      } else if (act.status === "DRAFT" || act.status === "APPROVAL_ELIGIBLE") {
        // Validate full bridge eligibility
        if (act.executionMode !== "APPROVAL_REQUIRED") {
          return res.status(400).json({ ok: false, error: `Proposed action '${id}' has invalid execution mode: '${act.executionMode}'.` });
        }

        const changes = act.changes || {};
        const payloadKeys = Object.keys(changes);

        if (payloadKeys.length === 0) {
          return res.status(400).json({ ok: false, error: `Proposed action '${id}' has empty changes payload.` });
        }

        const hasForbidden = payloadKeys.some(k => !allowedFieldsList.includes(k));
        if (hasForbidden) {
          return res.status(400).json({ ok: false, error: `Proposed action '${id}' contains forbidden changes fields.` });
        }

        const sanitizedPayload: any = {};
        if (typeof changes.title === "string") sanitizedPayload.title = changes.title;
        if (typeof changes.vendor === "string") sanitizedPayload.vendor = changes.vendor;
        if (typeof changes.productType === "string") sanitizedPayload.productType = changes.productType;
        if (typeof changes.status === "string") sanitizedPayload.status = changes.status;
        if (Array.isArray(changes.tags)) {
          sanitizedPayload.tags = changes.tags.map((t: any) => String(t));
        }

        if (Object.keys(sanitizedPayload).length === 0) {
          return res.status(400).json({ ok: false, error: `Proposed action '${id}' does not contain any valid updates.` });
        }

        classifications.set(id, "BRIDGE_REQUIRED");
      } else {
        // Any other status must fail preflight
        return res.status(400).json({ ok: false, error: `Proposed action '${id}' has invalid status for bridging: '${act.status}'.` });
      }

      fetchedItems.push(act);
    }

    // Phase 2: Sequential operation/execution (idempotent bridging)
    const results: any[] = [];
    let bridgedCount = 0;

    for (const act of fetchedItems) {
      const cls = classifications.get(act.id);
      if (cls === "ALREADY_REQUESTED") {
        results.push({
          id: act.id,
          status: "ALREADY_REQUESTED",
          approvalId: act.approvalRequestId
        });
      } else {
        const updated = await requestProposedActionApprovalBridge({
          proposedActionId: act.id,
          organizationId: resolvedOrgId,
          storeConnectionId
        });

        results.push({
          id: act.id,
          status: "APPROVAL_REQUESTED",
          approvalId: updated.approvalRequestId
        });
        bridgedCount++;
      }
    }

    return res.json({
      ok: true,
      bridgedCount,
      results
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
