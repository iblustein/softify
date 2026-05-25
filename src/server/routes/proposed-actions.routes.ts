import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { AuditEventNames, ProposedAction, AllowedProductProposalField } from "../domain/types.js";

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

    const act = await repos.proposedActions.getProposedActionById(id);
    if (!act) {
      return res.status(404).json({ ok: false, error: "Proposed action not found." });
    }

    if (act.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Proposed action does not belong to this organization." });
    }

    if (act.storeConnectionId !== storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Store connection context mismatch." });
    }

    if (act.status !== "DRAFT" && act.status !== "APPROVAL_ELIGIBLE") {
      return res.status(400).json({ ok: false, error: `Proposed action is not in draft or approval eligible status. Current status: ${act.status}` });
    }

    if (act.executionMode !== "APPROVAL_REQUIRED") {
      return res.status(400).json({ ok: false, error: `Proposed action is not eligible for execution/approval. Current mode: ${act.executionMode}` });
    }

    // Retrieve active installation context
    const storeConnection = await repos.stores.getStoreConnectionById(storeConnectionId);
    let agentInstallationId = "inst-mock";
    if (storeConnection) {
      const installation = await repos.agentInstallations.getByShopAndAgent(storeConnection.storeUrl, act.agentId);
      if (installation) {
        agentInstallationId = installation.id;
      }
    }

    // Strict sanitization payload bridging (allowed taxonomy fields only)
    const allowedFieldsList: AllowedProductProposalField[] = ["title", "vendor", "productType", "status", "tags"];
    const incomingFields = act.changes || {};
    const sanitizedPayload: {
      title?: string;
      vendor?: string;
      productType?: string;
      status?: string;
      tags?: string[];
    } = {};

    if (typeof incomingFields.title === "string") sanitizedPayload.title = incomingFields.title;
    if (typeof incomingFields.vendor === "string") sanitizedPayload.vendor = incomingFields.vendor;
    if (typeof incomingFields.productType === "string") sanitizedPayload.productType = incomingFields.productType;
    if (typeof incomingFields.status === "string") sanitizedPayload.status = incomingFields.status;
    if (Array.isArray(incomingFields.tags)) {
      sanitizedPayload.tags = incomingFields.tags.map((t: any) => String(t));
    }

    // Block if no allowed changes are supplied or if any forbidden properties are present
    const payloadKeys = Object.keys(incomingFields);
    const hasForbidden = payloadKeys.some(k => !allowedFieldsList.includes(k as any));
    if (hasForbidden || Object.keys(sanitizedPayload).length === 0) {
      return res.status(400).json({ ok: false, error: "Action contains forbidden fields or empty updates." });
    }

    const approvalId = `APV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Invoke the existing approved createApprovalRequest model
    const approval = await repos.approvals.createApprovalRequest({
      id: approvalId,
      organizationId: resolvedOrgId,
      storeConnectionId: storeConnectionId,
      agentInstallationId,
      agentId: act.agentId,
      toolName: "catalog.products.propose_update",
      requestedBy: act.agentId,
      status: "PENDING",
      riskLevel: act.riskLevel === "HIGH" ? "High" : act.riskLevel === "MEDIUM" ? "Medium" : "Low",
      targetType: "PRODUCT_PROPOSAL",
      targetId: act.targetId,
      proposedChangesSummary: act.title,
      diffSummary: Object.keys(sanitizedPayload).map(k => `${k}: proposed change`).join(", ") || "Taxonomy optimization",
      sanitizedPayload,
      allowedFields: allowedFieldsList
    });

    const updated = await repos.proposedActions.updateProposedAction(id, {
      status: "APPROVAL_REQUESTED",
      approvalRequestId: approvalId
    });

    // Write audit logs
    await writeAuditEvent({
      organizationId: resolvedOrgId,
      storeConnectionId,
      initiator: "Shop Owner",
      event: AuditEventNames.PROPOSED_ACTION_APPROVAL_REQUESTED,
      description: `Requested merchant approval for proposed action: '${act.title}' (#${id})`,
      decision: "allowed",
      metadata: {
        agentId: act.agentId,
        agentRunId: act.agentRunId,
        recommendationId: act.recommendationId,
        proposedActionId: id,
        approvalId: approvalId,
        status: "APPROVAL_REQUESTED",
        decision: "allowed"
      }
    });

    await writeAuditEvent({
      organizationId: resolvedOrgId,
      storeConnectionId,
      agentInstallationId,
      agentId: act.agentId,
      toolName: "catalog.products.propose_update",
      initiator: act.agentId,
      event: AuditEventNames.APPROVAL_CREATED,
      description: `Created approval request '${approvalId}' for tool 'catalog.products.propose_update' via workspace bridge`,
      decision: "blocked",
      reason: "requires_merchant_approval",
      metadata: {
        organizationId: resolvedOrgId,
        storeConnectionId,
        agentInstallationId,
        agentId: act.agentId,
        toolName: "catalog.products.propose_update",
        approvalId,
        decision: "blocked",
        reason: "requires_merchant_approval"
      }
    });

    res.json(updated || act);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
