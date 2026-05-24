import { DashboardStats } from "../../types.js";
import { getShop } from "./shop.service.js";
import { getMockProducts } from "../data/mock-products.js";
import { getAgents } from "./agent-registry.service.js";
import { getApprovals } from "./approval.service.js";
import { getAuditLogs } from "./audit-log.service.js";
import { getRepositories } from "../repositories/repository-provider.js";

export async function getDashboardStats(shopDomain?: string): Promise<DashboardStats> {
  const store = await getShop(shopDomain);
  const agents = getAgents();
  const approvals = getApprovals();
  
  const repos = getRepositories();
  let organizationId = "demo-org-id";
  let storeConnectionId: string | undefined = undefined;

  if (shopDomain) {
    try {
      const cleanShop = shopDomain.trim().toLowerCase();
      const conn = await repos.stores.getStoreConnectionByUrl(cleanShop);
      if (conn) {
        organizationId = conn.organizationId;
        storeConnectionId = conn.id;
      }
    } catch (e) {
      // Ignore and use defaults
    }
  } else {
    try {
      const connections = await repos.stores.getStoreConnectionsByOrganizationId("demo-org-id");
      const activeConn = connections.find(c => c.status === "CONNECTED") || connections[0];
      if (activeConn) {
        organizationId = activeConn.organizationId;
        storeConnectionId = activeConn.id;
      }
    } catch (e) {
      // Ignore
    }
  }

  let dbEvents: any[] = [];
  try {
    dbEvents = await repos.audit.getAuditEventsByOrganizationId(organizationId);
    if (storeConnectionId) {
      dbEvents = dbEvents.filter(e => e.storeConnectionId === storeConnectionId);
    }
  } catch (e) {
    // Ignore db retrieval failure
  }

  const cacheLogs = getAuditLogs(organizationId, storeConnectionId);
  const finalAuditLogs = dbEvents.length > 0 ? dbEvents : cacheLogs;

  let totalProductsCount = getMockProducts().length;
  if (shopDomain) {
    try {
      const count = await repos.products.countProductSnapshotsByShop(shopDomain);
      if (count > 0) {
        totalProductsCount = count;
      }
    } catch (error) {
      // Fallback silently to mock products count
    }
  }

  const activeCount = agents.filter(a => a.enabled).length;
  const pendingCount = approvals.filter(item => item.status === "PENDING").length;

  return {
    connected: store.connected,
    storeName: store.connected ? store.name : "Unconnected Store",
    activeAgentsCount: activeCount,
    pendingApprovalsCount: pendingCount,
    totalLogsCount: finalAuditLogs.length,
    totalProductsCount: totalProductsCount,
    weeklyActionsCount: finalAuditLogs.filter(
      l => new Date(l.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length
  };
}
