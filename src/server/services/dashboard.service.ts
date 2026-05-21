import { DashboardStats } from "../../types.js";
import { getShop } from "./shop.service.js";
import { getMockProducts } from "../data/mock-products.js";
import { getAgents } from "./agent-registry.service.js";
import { getApprovals } from "./approval.service.js";
import { getAuditLogs } from "./audit-log.service.js";

export async function getDashboardStats(shopDomain?: string): Promise<DashboardStats> {
  const store = await getShop(shopDomain);
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
