import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

import { initGhostNodeEngine } from "./engine/ghostNodeEndpoint";
import { setupSurfCaddyRoutes } from "./routes/surfcaddy";

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

initGhostNodeEngine(app, server);
setupSurfCaddyRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ service: "surfcaddy", status: "ok", time: new Date().toISOString() });
});

// Preserve the older standalone calculator for reference without making it the
// operational home screen.
app.use("/legacy", express.static(rootDir, { index: "index.html" }));

app.get("/", (_req, res) => res.redirect("/surfcaddy"));

server.listen(port, "0.0.0.0", () => {
  console.log(`SurfCaddy field console listening on :${port}`);
});
