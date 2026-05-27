import express from "express";
import shopRoutes from "./routes/shop.routes.js";
import readinessRoutes from "./routes/readiness.routes.js";
import agentsRoutes from "./routes/agents.routes.js";
import productsRoutes from "./routes/products.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import approvalsRoutes from "./routes/approvals.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import orchestratorRoutes from "./routes/orchestrator.routes.js";
import shopifyOAuthRoutes from "./routes/shopify-oauth.routes.js";
import shopifyAdminRoutes from "./routes/shopify-admin.routes.js";
import catalogRoutes from "./routes/catalog.routes.js";
import agentChatRoutes from "./routes/agent-chat.routes.js";
import diagnosticsRoutes from "./routes/diagnostics.routes.js";
import agentInstallationsRoutes from "./routes/agent-installations.routes.js";
import recommendationsRoutes from "./routes/recommendations.routes.js";
import proposedActionsRoutes from "./routes/proposed-actions.routes.js";

const app = express();
app.use(express.json());

// Mount API routes under /api
app.use("/api/shopify/oauth", shopifyOAuthRoutes);
app.use("/api/shopify/admin", shopifyAdminRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/agents", agentChatRoutes);
app.use("/api", shopRoutes);
app.use("/api", readinessRoutes);
app.use("/api", agentInstallationsRoutes);
app.use("/api", agentsRoutes);
app.use("/api", productsRoutes);
app.use("/api", ordersRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", approvalsRoutes);
app.use("/api", auditRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", orchestratorRoutes);
app.use("/api", diagnosticsRoutes);
app.use("/api", recommendationsRoutes);
app.use("/api", proposedActionsRoutes);

export { app };
