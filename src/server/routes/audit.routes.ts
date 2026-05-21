import { Router } from "express";
import { getAuditLogs } from "../services/audit-log.service.js";

const router = Router();

router.get("/audit-logs", (req, res) => {
  try {
    const logs = getAuditLogs();
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
