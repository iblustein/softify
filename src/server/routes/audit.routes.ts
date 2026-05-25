import { Router } from "express";
import { getAuditLogs, writeAuditEvent } from "../services/audit-log.service.js";
import { getRepositories } from "../repositories/repository-provider.js";
import { normalizeShopDomain } from "../services/shopify-oauth.service.js";
import { isFirestoreConfigured } from "../config/firestore.config.js";
import { AuditEventNames } from "../domain/types.js";

const router = Router();

router.get("/audit-logs", async (req: any, res: any) => {
  try {
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

      // If organizationId is also supplied, assert they match to prevent cross-tenant queries
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
    const dbEvents = await repos.audit.getAuditEventsByOrganizationId(resolvedOrgId);

    let filteredEvents = dbEvents;
    if (storeConnectionId) {
      filteredEvents = dbEvents.filter(e => e.storeConnectionId === storeConnectionId);
    }

    // Sync context to in-memory audit logs strictly filtered by organizationId
    const cachedLogs = getAuditLogs(resolvedOrgId, storeConnectionId);

    // Prefer database records if Firestore is configured (never fall back to in-memory), otherwise use filtered cache
    const finalLogs = isFirestoreConfigured() ? filteredEvents : (filteredEvents.length > 0 ? filteredEvents : cachedLogs);

    res.json(finalLogs);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
