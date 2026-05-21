import { Router } from "express";
import { getMockSalesReport } from "../data/mock-sales.js";

const router = Router();

router.get("/sales-summary", (req, res) => {
  try {
    res.json(getMockSalesReport());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
