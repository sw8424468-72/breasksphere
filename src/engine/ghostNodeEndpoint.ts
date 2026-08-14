import { v4 as uuidv4 } from "uuid";
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import { IncomingMessage } from "http";

import { compositeSwell, CompositeResult, DEFAULTS } from "./compositeEngine";
import { buildSourceIndex, SourceEntry } from "./sourceIndex";
import { fetchAllGovernmentData, GhostNodeData } from "./adapters";

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

interface Snapshot {
  compositeResult: CompositeResult;
  readout: string;
  rawData?: GhostNodeData;
  sourceIndex: SourceEntry[];
  generatedAt: string;
}

interface WebSocketMessage {
  event: "composite-update" | "status" | "error" | "ping";
  nodeId?: string;
  snapshot?: Snapshot;
  status?: string;
  message?: string;
}

const ghostNodes = new Map<string, GhostNode>();
const wsClients = new Map<string, Set<WebSocket>>();

function broadcast(nodeId: string, message: WebSocketMessage) {
  const clients = wsClients.get(nodeId);
  if (!clients) return;
  const payload = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function snapshotFor(node: GhostNode): Snapshot | undefined {
  if (!node.latestComposite) return undefined;
  return {
    compositeResult: node.latestComposite,
    readout: node.latestComposite.readout,
    rawData: node.latestRawData,
    sourceIndex: node.sourceIndex,
    generatedAt: node.latestRawData?.timestamp ?? new Date().toISOString(),
  };
}

async function runEngineForNode(nodeId: string) {
  const node = ghostNodes.get(nodeId);
  if (!node) return;

  const ndbcStationIds = node.sourceIndex
    .filter((source) => source.source === "NDBC" && source.stationId)
    .map((source) => source.stationId!)
    .filter((id, index, all) => all.indexOf(id) === index);

  node.status = "running";
  broadcast(nodeId, {
    event: "status",
    nodeId,
    status: `Prospecting live sources (${ndbcStationIds.length} NDBC candidates)...`,
  });

  try {
    const rawData = await fetchAllGovernmentData(
      { lat: node.lat, lon: node.lon },
      ndbcStationIds
    );
    node.latestRawData = rawData;
    node.latestComposite = compositeSwell(
      rawData.buoys,
      { lat: node.lat, lon: node.lon },
      DEFAULTS
    );
    node.status = "idle";
    node.errorMessage = undefined;

    broadcast(nodeId, {
      event: "composite-update",
      nodeId,
      snapshot: snapshotFor(node),
    });
  } catch (error) {
    node.status = "error";
    node.errorMessage = error instanceof Error ? error.message : String(error);
    broadcast(nodeId, {
      event: "error",
      nodeId,
      message: node.errorMessage,
    });
  }
}

export function setupGhostNodeRoutes(app: any) {
  app.post("/api/ghost-node/drop", async (req: any, res: any) => {
    try {
      const { lat, lon, name } = req.body as DropNodeRequest;
      if (
        typeof lat !== "number" ||
        typeof lon !== "number" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return res.status(400).json({ error: "valid lat/lon numbers required" });
      }

      const nodeId = uuidv4();
      const sourceResult = await buildSourceIndex(
        { lat, lon },
        new Date().toISOString(),
        DEFAULTS.MAX_SOURCE_DISTANCE_MILES
      );
      const node: GhostNode = {
        nodeId,
        lat,
        lon,
        name: name || `Ghost Node ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        createdAt: new Date().toISOString(),
        sourceIndex: sourceResult.index,
        status: "initializing",
      };

      ghostNodes.set(nodeId, node);
      wsClients.set(nodeId, new Set());

      res.json({
        nodeId,
        spot: { lat, lon, name: node.name },
        sourceIndex: node.sourceIndex,
        sourceRadiusMiles: sourceResult.radiusMiles,
        wsPath: `/ws/ghost-node/${nodeId}`,
        status: node.status,
      });

      setImmediate(() => runEngineForNode(nodeId));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/ghost-node/list", (_req: any, res: any) => {
    res.json({
      nodes: Array.from(ghostNodes.values()).map((node) => ({
        nodeId: node.nodeId,
        spot: { lat: node.lat, lon: node.lon, name: node.name },
        status: node.status,
        createdAt: node.createdAt,
        wsClientsConnected: wsClients.get(node.nodeId)?.size ?? 0,
      })),
    });
  });

  app.get("/api/ghost-node/:nodeId", (req: any, res: any) => {
    const node = ghostNodes.get(req.params.nodeId);
    if (!node) return res.status(404).json({ error: "Node not found" });
    res.json({
      nodeId: node.nodeId,
      spot: { lat: node.lat, lon: node.lon, name: node.name },
      status: node.status,
      sourceIndex: node.sourceIndex,
      rawData: node.latestRawData,
      composite: node.latestComposite,
      readout: node.latestComposite?.readout ?? "Scan has not completed yet",
      error: node.errorMessage,
    });
  });
}

export function setupGhostNodeWebSocket(wss: WebSocketServer) {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const match = (req.url || "").match(/\/ws\/ghost-node\/([^/?]+)/);
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

    const clients = wsClients.get(nodeId) ?? new Set<WebSocket>();
    wsClients.set(nodeId, clients);
    clients.add(ws);

    const initial = snapshotFor(node);
    if (initial) {
      ws.send(JSON.stringify({ event: "composite-update", nodeId, snapshot: initial }));
    } else {
      ws.send(JSON.stringify({ event: "status", nodeId, status: node.status }));
    }

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as { event?: string };
        if (message.event === "ping") {
          ws.send(JSON.stringify({ event: "ping", nodeId }));
        } else if (message.event === "refresh") {
          void runEngineForNode(nodeId);
        }
      } catch {
        ws.send(JSON.stringify({ event: "error", nodeId, message: "Invalid WebSocket message" }));
      }
    });

    ws.on("close", () => clients.delete(ws));
  });
}

export function initGhostNodeEngine(app: any, httpServer: HTTPServer) {
  setupGhostNodeRoutes(app);
  const wss = new WebSocketServer({ noServer: true });
  setupGhostNodeWebSocket(wss);

  httpServer.on("upgrade", (req: IncomingMessage, socket: any, head: Buffer) => {
    if (!req.url?.startsWith("/ws/ghost-node/")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
}
