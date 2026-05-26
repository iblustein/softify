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

export default router;
