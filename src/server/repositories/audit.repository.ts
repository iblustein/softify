import { AuditEvent } from "../domain/types.js";

// TODO: For high-volume production audit logs, use a time-series or append-only write-optimized database 
// (e.g. TimescaleDB, ElasticSearch, or DynamoDB) to preserve tamper-proof history.
let auditEvents: AuditEvent[] = [];

export async function getAuditEventById(id: string): Promise<AuditEvent | null> {
  const event = auditEvents.find(e => e.id === id);
  return event || null;
}

export async function getAuditEventsByOrganizationId(organizationId: string): Promise<AuditEvent[]> {
  return auditEvents.filter(e => e.organizationId === organizationId);
}

export async function createAuditEvent(event: Omit<AuditEvent, 'timestamp'>): Promise<AuditEvent> {
  const newEvent: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString()
  };
  auditEvents.unshift(newEvent); // Newest first
  return newEvent;
}

export async function getAllAuditEvents(): Promise<AuditEvent[]> {
  return [...auditEvents];
}

export async function clearAuditEvents(): Promise<void> {
  auditEvents = [];
}
