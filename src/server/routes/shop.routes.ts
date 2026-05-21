import { Router } from "express";
import * as shopService from "../services/shop.service.js";

const router = Router();

router.get("/shop", (req, res) => {
  try {
    const shop = shopService.getShop();
    res.json(shop);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/shop/connect", (req, res) => {
  const { url, scopes } = req.body;
  try {
    const result = shopService.connectShop(url, scopes);
    res.json({ success: true, store: result.store });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/shop/disconnect", (req, res) => {
  try {
    const result = shopService.disconnectShop();
    res.json({ success: true, store: result.store });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
