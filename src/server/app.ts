import express from "express";
import shopRoutes from "./routes/shop.routes.js";
import agentsRoutes from "./routes/agents.routes.js";
import productsRoutes from "./routes/products.routes.js";
import ordersRoutes from "./routes/orders.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import approvalsRoutes from "./routes/approvals.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import orchestratorRoutes from "./routes/orchestrator.routes.js";

const app = express();
app.use(express.json());

// Mount API routes under /api
app.use("/api", shopRoutes);
app.use("/api", agentsRoutes);
app.use("/api", productsRoutes);
app.use("/api", ordersRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", approvalsRoutes);
app.use("/api", auditRoutes);
app.use("/api", dashboardRoutes);
app.use("/api", orchestratorRoutes);

export { app };
