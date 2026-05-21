import { Router } from "express";
import { getDashboardStats } from "../services/dashboard.service.js";

const router = Router();

router.get("/dashboard-stats", async (req, res) => {
  try {
    const { shop } = req.query;
    const shopDomain = typeof shop === "string" ? shop : undefined;
    const stats = await getDashboardStats(shopDomain);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
