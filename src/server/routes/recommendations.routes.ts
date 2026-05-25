import { Router } from "express";
import { getRepositories } from "../repositories/repository-provider.js";
import { writeAuditEvent } from "../services/audit-log.service.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { AuditEventNames } from "../domain/types.js";

const router = Router();

router.get("/recommendations", async (req: any, res: any) => {
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

    let recs = await repos.recommendations.getRecommendationsByOrganizationId(resolvedOrgId);

    if (storeConnectionId) {
      recs = recs.filter(r => r.storeConnectionId === storeConnectionId);
    }
    if (status) {
      recs = recs.filter(r => r.status === status);
    }

    res.json(recs);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/recommendations/:id", async (req: any, res: any) => {
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

    const rec = await repos.recommendations.getRecommendationById(id);
    if (!rec) {
      return res.status(404).json({ ok: false, error: "Recommendation not found." });
    }

    if (rec.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Recommendation does not belong to this organization." });
    }

    if (storeConnectionId && rec.storeConnectionId !== storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Store connection context mismatch." });
    }

    res.json(rec);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/recommendations/:id/dismiss", async (req: any, res: any) => {
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

    const rec = await repos.recommendations.getRecommendationById(id);
    if (!rec) {
      return res.status(404).json({ ok: false, error: "Recommendation not found." });
    }

    if (rec.organizationId !== resolvedOrgId) {
      return res.status(403).json({ ok: false, error: "Access denied. Recommendation does not belong to this organization." });
    }

    if (storeConnectionId && rec.storeConnectionId !== storeConnectionId) {
      return res.status(400).json({ ok: false, error: "Store connection context mismatch." });
    }

    const updated = await repos.recommendations.updateRecommendation(id, {
      status: "DISMISSED"
    });

    await writeAuditEvent({
      organizationId: resolvedOrgId,
      storeConnectionId: rec.storeConnectionId,
      initiator: "Shop Owner",
      event: AuditEventNames.RECOMMENDATION_DISMISSED,
      description: `Dismissed recommendation: '${rec.title}'`,
      decision: "allowed",
      metadata: {
        agentId: rec.agentId,
        agentRunId: rec.agentRunId,
        recommendationId: id,
        status: "DISMISSED",
        decision: "allowed"
      }
    });

    res.json(updated || rec);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
