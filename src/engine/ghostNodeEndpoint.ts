/**
 * Phase 5: HTTP + WebSocket endpoint wrapper for Ghost Node engine
 *
 * Exposes:
 * - POST /api/ghost-node/drop  → creates node, returns nodeId + source index
 * - WebSocket /ws/ghost-node/{nodeId}  → live composite updates
 * - GET /api/ghost-node/{nodeId}  → poll latest snapshot
 * - GET /api/ghost-node/list  → debug: all active nodes
 *
 * Background: when a node is dropped, adapters fetch government data → engine runs
 * → composite result streamed to connected WebSocket clients.
 */

import { v4 as uuidv4 } from "uuid";
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import { IncomingMessage } from "http";

import { compositeSwell, CompositeResult, LatLon, DEFAULTS } from "./compositeEngine";
import { buildSourceIndex, SourceEntry } from "./sourceIndex";
import { fetchAllGovernmentData, GhostNodeData } from "./adapters";

/* ─────────────────────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────────────────────── */

interface GhostNode {
  nodeId: string;
  lat: number;
  lon: number;
  name?: string;
  createdAt: string;
  sourceIndex: SourceEntry[];
  latestComposite?: CompositeResult;
  latestRawData?: GhostNodeData;
  status: "initializing" | "running" | "error" | "idle";
  errorMessage?: string;
}

interface DropNodeRequest {
  lat: number;
  lon: number;
  name?: string;
}

interface WebSocketMessage {
  event: "composite-update" | "status" | "error" | "ping";
  nodeId?: string;
  snapshot?: { compositeResult: CompositeResult; readout: string };
  status?: string;
  message?: string;
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Engine State
   ───────────────────────────────────────────────────────────────────────────────── */

const ghostNodes = new Map<string, GhostNode>();
const wsClients = new Map<string, Set<WebSocket>>();
const runningTasks = new Map<string, AbortController>();

/* ─────────────────────────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────────────────────────── */

function broadcast(nodeId: string, msg: WebSocketMessage) {
  const clients = wsClients.get(nodeId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

async function runEngineForNode(nodeId: string) {
  const node = ghostNodes.get(nodeId);
  if (!node) return;

  // Extract candidate station IDs from source index
  const ndbcStationIds = node.sourceIndex
    .filter((s) => s.source === "NDBC" && s.stationId)
    .map((s) => s.stationId!)
    .filter((id, idx, arr) => arr.indexOf(id) === idx); // unique

  if (ndbcStationIds.length === 0) {
    node.status = "error";
    node.errorMessage = "No NDBC stations found in capture radius";
    broadcast(nodeId, { event: "error", message: node.errorMessage });
    return;
  }

  node.status = "running";
  broadcast(nodeId, { event: "status", status: "Fetching government data..." });

  try {
    // Fetch all government data
    const rawData = await fetchAllGovernmentData({ lat: node.lat, lon: node.lon }, ndbcStationIds);
    node.latestRawData = rawData;

    // Run composite engine
    const composite = compositeSwell(rawData.buoys, { lat: node.lat, lon: node.lon }, DEFAULTS);
    node.latestComposite = composite;

    node.status = "idle";

    // Broadcast composite update
    broadcast(nodeId, {
      event: "composite-update",
      nodeId,
      snapshot: {
        compositeResult: composite,
        readout: composite.readout,
      },
    });
  } catch (err) {
    node.status = "error";
    node.errorMessage = String(err);
    broadcast(nodeId, {
      event: "error",
      message: `Engine error: ${node.errorMessage}`,
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────
   HTTP Endpoints (Express-like middleware)
   ───────────────────────────────────────────────────────────────────────────────── */

export function setupGhostNodeRoutes(app: any) {
  /**
   * POST /api/ghost-node/drop
   * Drop a new ghost node and trigger engine run
   */
  app.post("/api/ghost-node/drop", async (req: any, res: any) => {
    try {
      const { lat, lon, name } = req.body as DropNodeRequest;

      if (typeof lat !== "number" || typeof lon !== "number") {
        return res.status(400).json({ error: "lat and lon (numbers) required" });
      }

      const nodeId = uuidv4();
      const ghostNode: GhostNode = {
        nodeId,
        lat,
        lon,
        name: name || `Ghost Node ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        createdAt: new Date().toISOString(),
        sourceIndex: [],
        status: "initializing",
      };

      // Build source index (Phase 1: discover government endpoints)
      try {
        const { index } = await buildSourceIndex({ lat, lon }, new Date().toISOString());
        ghostNode.sourceIndex = index;
      } catch (err) {
        console.error("Source index build failed:", err);
        ghostNode.sourceIndex = [];
      }

      ghostNodes.set(nodeId, ghostNode);
      wsClients.set(nodeId, new Set());

      // Trigger engine run in background
      setImmediate(() => runEngineForNode(nodeId));

      res.json({
        nodeId,
        spot: { lat, lon, name: ghostNode.name },
        sourceIndex: ghostNode.sourceIndex,
        wsPath: `/ws/ghost-node/${nodeId}`,
        message: "Ghost node dropped. Connect WebSocket at wsPath for live updates.",
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * GET /api/ghost-node/{nodeId}
   * Polling: fetch latest composite snapshot
   */
  app.get("/api/ghost-node/:nodeId", (req: any, res: any) => {
    const { nodeId } = req.params;
    const node = ghostNodes.get(nodeId);

    if (!node) {
      return res.status(404).json({ error: "Node not found" });
    }

    res.json({
      nodeId,
      spot: { lat: node.lat, lon: node.lon, name: node.name },
      status: node.status,
      composite: node.latestComposite,
      readout: node.latestComposite?.readout || "No composite data yet",
    });
  });

  /**
   * GET /api/ghost-node/list
   * Debug: list all active nodes
   */
  app.get("/api/ghost-node/list", (req: any, res: any) => {
    const nodeList = Array.from(ghostNodes.values()).map((n) => ({
      nodeId: n.nodeId,
      spot: { lat: n.lat, lon: n.lon, name: n.name },
      status: n.status,
      createdAt: n.createdAt,
      wsClientsConnected: wsClients.get(n.nodeId)?.size ?? 0,
    }));
    res.json({ nodes: nodeList });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────────
   WebSocket Handler
   ───────────────────────────────────────────────────────────────────────────────── */

export function setupGhostNodeWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Extract nodeId from URL path: /ws/ghost-node/{nodeId}
    const url = req.url || "";
    const match = url.match(/\/ws\/ghost-node\/([^/?]+)/);
    if (!match) {
      ws.close(1008, "Invalid path");
      return;
    }

    const nodeId = match[1];
    const node = ghostNodes.get(nodeId);
    if (!node) {
      ws.close(1008, "Node not found");
      return;
    }

    // Register client
    let clients = wsClients.get(nodeId);
    if (!clients) {
      clients = new Set();
      wsClients.set(nodeId, clients);
    }
    clients.add(ws);

    console.log(`[WS] Client connected to node ${nodeId}. Total: ${clients.size}`);

    // Send initial state
    if (node.latestComposite) {
      ws.send(
        JSON.stringify({
          event: "composite-update",
          snapshot: {
            compositeResult: node.latestComposite,
            readout: node.latestComposite.readout,
          },
        })
      );
    }

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as { event: string; [key: string]: any };
        if (msg.event === "ping") {
          ws.send(JSON.stringify({ event: "ping" }));
        } else if (msg.event === "refresh") {
          // Trigger immediate engine re-run
          runEngineForNode(nodeId);
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    });

    ws.on("close", () => {
      clients?.delete(ws);
      console.log(`[WS] Client disconnected from node ${nodeId}. Total: ${clients?.size ?? 0}`);
    });

    ws.on("error", (err: Error) => {
      console.error("[WS] Error:", err);
    });
  });
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Main initialization
   ───────────────────────────────────────────────────────────────────────────────── */

export function initGhostNodeEngine(app: any, httpServer: HTTPServer) {
  // Setup HTTP routes
  setupGhostNodeRoutes(app);

  // Setup WebSocket
  const wss = new WebSocketServer({ noServer: true });

  // Upgrade HTTP to WebSocket for matching paths
  httpServer.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    if (req.url?.startsWith("/ws/ghost-node/")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  console.log("✓ Ghost Node engine initialized (HTTP + WebSocket)");
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Example usage (Next.js API route + WebSocket upgrade in next.config.js)
   ───────────────────────────────────────────────────────────────────────────────── */

/*
// pages/api/ghost-node/[...route].ts (or similar)
import { NextApiRequest, NextApiResponse } from "next";
import { setupGhostNodeRoutes } from "@/engine/ghostNodeEndpoint";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST" && req.url?.includes("/drop")) {
    // Delegate to setupGhostNodeRoutes
  } else if (req.method === "GET" && req.url?.includes("/list")) {
    // Delegate to setupGhostNodeRoutes
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}

// For WebSocket in Next.js, use a custom server or middleware:
// OR use a separate Express server alongside Next.js

// Example Express server (src/server.ts):
import express from "express";
import http from "http";
import { initGhostNodeEngine } from "@/engine/ghostNodeEndpoint";

const app = express();
app.use(express.json());

const httpServer = http.createServer(app);
initGhostNodeEngine(app, httpServer);

httpServer.listen(3001, () => {
  console.log("SURFCADDY Ghost Node engine listening on port 3001");
});
*/
