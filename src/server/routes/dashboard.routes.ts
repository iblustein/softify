import { Router } from "express";
import { getDashboardStats } from "../services/dashboard.service.js";

const router = Router();

router.get("/dashboard-stats", (req, res) => {
  try {
    const stats = getDashboardStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
