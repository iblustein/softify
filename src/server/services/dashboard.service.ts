import { DashboardStats } from "../../types.js";
import { getShopifyStore } from "../data/mock-store.js";
import { getMockProducts } from "../data/mock-products.js";
import { getAgents } from "./agent-registry.service.js";
import { getApprovals } from "./approval.service.js";
import { getAuditLogs } from "./audit-log.service.js";

export function getDashboardStats(): DashboardStats {
  const store = getShopifyStore();
  const agents = getAgents();
  const approvals = getApprovals();
  const auditLogs = getAuditLogs();
  const products = getMockProducts();

  const activeCount = agents.filter(a => a.enabled).length;
  const pendingCount = approvals.filter(item => item.status === "PENDING").length;

  return {
    connected: store.connected,
    storeName: store.connected ? store.name : "Unconnected Store",
    activeAgentsCount: activeCount,
    pendingApprovalsCount: pendingCount,
    totalLogsCount: auditLogs.length,
    totalProductsCount: products.length,
    weeklyActionsCount: auditLogs.filter(
      l => new Date(l.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length
  };
}
