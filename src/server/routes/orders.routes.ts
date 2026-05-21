import { Router } from "express";
import { getMockOrders } from "../data/mock-orders.js";

const router = Router();

router.get("/orders", (req, res) => {
  try {
    res.json(getMockOrders());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
