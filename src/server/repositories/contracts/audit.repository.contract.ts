import { AuditEvent } from "../../domain/types.js";

export interface AuditRepository {
  getAuditEventById(id: string): Promise<AuditEvent | null>;
  getAuditEventsByOrganizationId(organizationId: string): Promise<AuditEvent[]>;
  createAuditEvent(event: Omit<AuditEvent, "id" | "timestamp"> & { id?: string }): Promise<AuditEvent>;
  getAllAuditEvents(): Promise<AuditEvent[]>;
  clearAuditEvents(): Promise<void>;
}
