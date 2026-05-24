import { AuditLog } from "../../types.js";
import { AuditEvent } from "../domain/types.js";
import { getRepositories } from "../repositories/repository-provider.js";

// Safe keys allowlist for audit metadata to guarantee zero leakage of credentials, PII, or raw message texts.
const SAFE_METADATA_ALLOWLIST = new Set([
  "organizationId",
  "storeConnectionId",
  "agentId",
  "agentDefinitionId",
  "agentInstallationId",
  "toolName",
  "provider",
  "decision",
  "reason",
  "correlationId",
  "messageLength",
  "toolCallCount",
  "syncedProductCount",
  "count",
  "status",
  "latestSyncAt",
  "lastSyncedAt",
  "source",
  "approvalId",
  "productId",
  "themeId",
  "capped",
  "fieldsCount",
  "variantsCount",
  "imagesCount",
  "staleCount",
  "missingSyncTimestamp",
  "uniqueVendorsCount",
  "uniqueProductTypesCount",
  "staleSnapshotsCount",
  "argsCount"
]);

/**
 * Recursively filters high-risk fields from metadata, leaving only allowlisted safe parameters.
 */
export function sanitizeAuditPayload(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeAuditPayload);
  }
  if (typeof obj === "object") {
    const sanitized: any = {};
    for (const [key, val] of Object.entries(obj)) {
      if (SAFE_METADATA_ALLOWLIST.has(key)) {
        sanitized[key] = sanitizeAuditPayload(val);
      } else {
        // High-risk/unknown keys: redact and summarize length or types
        if (typeof val === "string") {
          sanitized[key] = `[REDACTED string length ${val.length}]`;
        } else if (typeof val === "object" && val !== null) {
          sanitized[key] = `[REDACTED object]`;
        } else {
          sanitized[key] = `[REDACTED type ${typeof val}]`;
        }
      }
    }
    return sanitized;
  }
  return obj;
}

// In-memory cache for backwards compatibility and synchronized UI dashboard retrieval
export let auditLogs: AuditLog[] = [
  {
    id: "LOG-001",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Shop Owner",
    event: "SHOP_CONNECTED",
    description: "Shopowner connected store luminary-essentials.myshopify.com successfully via OAuth Handshake.",
    metadata: { 
      organizationId: "demo-org-id",
      storeConnectionId: "store-luminary"
    }
  },
  {
    id: "LOG-002",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Store Setup Agent",
    event: "TOOL_CALL",
    description: "Invoked shopify.getShopInfo to structure internal indexes and inventory configuration.",
    metadata: { 
      organizationId: "demo-org-id",
      storeConnectionId: "store-luminary",
      decision: "completed"
    }
  },
  {
    id: "LOG-003",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Content Agent",
    event: "TOOL_CALL",
    description: "Executed shopify.getProducts to inspect catalog for copy optimizations.",
    metadata: { 
      organizationId: "demo-org-id",
      storeConnectionId: "store-luminary",
      count: 5,
      decision: "completed"
    }
  },
  {
    id: "LOG-004",
    timestamp: new Date(Date.now() - 50 * 12 * 1000).toISOString(),
    initiator: "Content Agent",
    event: "APPROVAL_CREATED",
    description: "Prepared product updates for 'Double-walled Ceramic Mug' and queued in structural Approval center (#APV-001).",
    metadata: { 
      organizationId: "demo-org-id",
      storeConnectionId: "store-luminary",
      approvalId: "APV-001", 
      productId: 102 
    }
  }
];

/**
 * Retrieves the filtered, sanitized in-memory audit logs strictly matching the tenant's organization context.
 */
export function getAuditLogs(organizationId?: string, storeConnectionId?: string): AuditLog[] {
  if (!organizationId) {
    return []; // Return empty if organization context is not specified
  }
  return auditLogs.filter(log => {
    const orgId = log.metadata?.organizationId || "demo-org-id";
    if (orgId !== organizationId) return false;
    
    if (storeConnectionId) {
      const connId = log.metadata?.storeConnectionId;
      if (connId && connId !== storeConnectionId) return false;
    }
    return true;
  });
}

/**
 * Asynchronously logs and persists critical audit events.
 * Performs centralized, allowlist-first payload sanitization and awaits database commit.
 */
export async function writeAuditEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { id?: string }): Promise<AuditEvent> {
  if (!event.organizationId) {
    throw new Error("Violation: organizationId is strictly mandatory for critical audit events.");
  }

  const repos = getRepositories();
  const now = new Date().toISOString();
  
  // Recursively sanitize all metadata properties using our allowlist-first strategy
  const sanitizedMetadata = sanitizeAuditPayload(event.metadata || {});

  const newEventInput = {
    ...event,
    metadata: {
      ...sanitizedMetadata,
      organizationId: event.organizationId,
      storeConnectionId: event.storeConnectionId,
      agentId: event.agentId || event.agentDefinitionId,
      agentInstallationId: event.agentInstallationId,
      toolName: event.toolName,
      provider: event.provider,
      decision: event.decision,
      reason: event.reason,
      correlationId: event.correlationId
    }
  };

  // Database persistence
  const saved = await repos.audit.createAuditEvent(newEventInput);

  // Sync to local cache list
  const legacyLog: AuditLog = {
    id: saved.id,
    timestamp: saved.timestamp,
    initiator: saved.initiator,
    event: saved.event,
    description: saved.description,
    metadata: saved.metadata
  };
  auditLogs.unshift(legacyLog);

  return saved;
}

/**
 * Backward-compatible legacy wrapper that logs telemetry in the background.
 */
export function writeLog(initiator: string, event: string, description: string, metadata?: any): AuditLog {
  const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  
  const orgId = metadata?.organizationId || "demo-org-id";
  const storeConnId = metadata?.storeConnectionId;

  // Sanitize the metadata payload
  const sanitizedMetadata = sanitizeAuditPayload(metadata || {});

  const log: AuditLog = {
    id: logId,
    timestamp: now,
    initiator,
    event,
    description,
    metadata: {
      ...sanitizedMetadata,
      organizationId: orgId,
      storeConnectionId: storeConnId
    }
  };

  auditLogs.unshift(log);

  // Background fire-and-forget persistence to database
  const repos = getRepositories();
  repos.audit.createAuditEvent({
    id: logId,
    organizationId: orgId,
    storeConnectionId: storeConnId,
    initiator,
    event,
    description,
    metadata: log.metadata,
    agentId: metadata?.agentId,
    agentDefinitionId: metadata?.agentDefinitionId || metadata?.agentId,
    agentInstallationId: metadata?.agentInstallationId,
    toolName: metadata?.toolName,
    provider: metadata?.provider,
    decision: metadata?.decision,
    reason: metadata?.reason,
    correlationId: metadata?.correlationId
  }).catch(err => {
    console.error("[AUDIT LOG ERROR] Failed to persist background audit event:", err);
  });

  return log;
}

export function setAuditLogs(newLogs: AuditLog[]): void {
  auditLogs = newLogs;
}
