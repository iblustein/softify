import { AuditLog } from "../../types.js";
import { getShopifyStore } from "../data/mock-store.js";
import { getMockProducts } from "../data/mock-products.js";

// TODO: Replace with a persistent database (e.g., PostgreSQL or MongoDB) for production
// TODO: Migrate auditLogs, getAuditLogs, and writeLog to AuditRepository under src/server/repositories/audit.repository.ts
export let auditLogs: AuditLog[] = [
  {
    id: "LOG-001",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Shop Owner",
    event: "SHOP_CONNECTED",
    description: "Shopowner connected store luminary-essentials.myshopify.com successfully via OAuth Handshake.",
    metadata: { scopes: [
      "read_products", 
      "write_products", 
      "read_orders", 
      "read_customers", 
      "write_themes", 
      "read_analytics"
    ] }
  },
  {
    id: "LOG-002",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Store Setup Agent",
    event: "TOOL_CALL",
    description: "Invoked shopify.getShopInfo to structure internal indexes and inventory configuration.",
    metadata: { results: "success" }
  },
  {
    id: "LOG-003",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    initiator: "Content Agent",
    event: "TOOL_CALL",
    description: "Executed shopify.getProducts to inspect catalog for copy optimizations.",
    metadata: { count: 5 } // Default initial mock products length is 5
  },
  {
    id: "LOG-004",
    timestamp: new Date(Date.now() - 50 * 12 * 1000).toISOString(),
    initiator: "Content Agent",
    event: "APPROVAL_CREATED",
    description: "Prepared product updates for 'Double-walled Ceramic Mug' and queued in structural Approval center (#APV-001).",
    metadata: { approvalId: "APV-001", productId: 102 }
  }
];

export function getAuditLogs(): AuditLog[] {
  return auditLogs;
}

export function writeLog(initiator: string, event: string, description: string, metadata?: any): AuditLog {
  const log: AuditLog = {
    id: `LOG-${String(auditLogs.length + 1).padStart(3, '0')}`,
    timestamp: new Date().toISOString(),
    initiator,
    event,
    description,
    metadata
  };
  auditLogs.unshift(log); // newest first
  return log;
}

export function setAuditLogs(newLogs: AuditLog[]): void {
  auditLogs = newLogs;
}
