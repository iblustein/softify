import path from "path";
import dotenv from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import { app } from "./app.js";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Shopify AI Agent Control Center] Listening on port ${PORT}`);
  });
}

startServer();
export default app;
