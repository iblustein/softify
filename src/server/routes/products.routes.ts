import { Router } from "express";
import { getMockProducts } from "../data/mock-products.js";
import { getActiveThemeCode } from "../data/mock-theme.js";

const router = Router();

router.get("/products", (req, res) => {
  try {
    res.json(getMockProducts());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/theme-assets", (req, res) => {
  try {
    res.json({ css: getActiveThemeCode() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
