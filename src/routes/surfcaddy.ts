/**
 * SURFCADDY URL Router & Dispatcher
 *
 * Provides a clean URL scheme for ghost nodes:
 * - /surfcaddy/:lat/:lon  → Interactive map + live composite
 * - /surfcaddy/:lat/:lon/:name  → Same with custom name
 * - /surfcaddy/list  → Active ghost nodes
 * - /surfcaddy/search  → Find spots by name (reverse geocoding optional)
 *
 * Example URLs:
 * - /surfcaddy/-43.2092/147.7519
 * - /surfcaddy/-43.2092/147.7519/Tasmania-Southport
 * - /surfcaddy/34.701/-76.683/Oceanana-Pier
 */

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/* ─────────────────────────────────────────────────────────────────────────────────
   URL Parsing & Validation
   ───────────────────────────────────────────────────────────────────────────────── */

export interface URLGhostNode {
  lat: number;
  lon: number;
  name?: string;
  slug?: string;
}

export function parseGhostNodeURL(path: string): URLGhostNode | null {
  // Match: /surfcaddy/:lat/:lon or /surfcaddy/:lat/:lon/:name
  const match = path.match(/\/surfcaddy\/([-\d.]+)\/([-\d.]+)(?:\/(.+))?$/);
  if (!match) return null;

  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  const nameOrSlug = match[3];

  if (isNaN(lat) || isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    lat,
    lon,
    name: nameOrSlug ? decodeURIComponent(nameOrSlug).replace(/-/g, " ") : undefined,
    slug: nameOrSlug,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Express Route Handlers
   ───────────────────────────────────────────────────────────────────────────────── */

/**
 * GET /surfcaddy/:lat/:lon
 * GET /surfcaddy/:lat/:lon/:name
 *
 * Returns: HTML page with interactive map, live composite stream, readout
 */
export function handleSurfCaddyPage(req: Request, res: Response) {
  const { lat, lon } = req.params;
  const { name } = req.params;

  const latN = parseFloat(lat);
  const lonN = parseFloat(lon);

  if (isNaN(latN) || isNaN(lonN) || latN < -90 || latN > 90 || lonN < -180 || lonN > 180) {
    return res.status(400).send("Invalid coordinates");
  }

  const spotName = name ? decodeURIComponent(name).replace(/-/g, " ") : `${latN.toFixed(4)}, ${lonN.toFixed(4)}`;

  // Generate a unique node ID for this session
  const nodeId = uuidv4();

  // Render HTML page with embedded React component
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>SURFCADDY · ${spotName}</title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Courier New', monospace;
          background: #0a1628;
          color: #e2e8f0;
          overflow: hidden;
        }
        #root { width: 100vw; height: 100vh; }
        .container { display: flex; height: 100vh; }
        .map-pane { flex: 1; position: relative; }
        .sidebar { width: 320px; background: #0f1a2e; border-left: 1px solid #1e3a5f; overflow-y: auto; padding: 20px; }
        .header {
          font-size: 12px;
          letter-spacing: 3px;
          color: #38bdf8;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .spot-name {
          font-size: 18px;
          font-weight: bold;
          color: #e2e8f0;
          margin-bottom: 4px;
        }
        .coords {
          font-size: 10px;
          color: #64748b;
          margin-bottom: 16px;
        }
        .separator { height: 1px; background: #1e3a5f; margin: 12px 0; }
        .status {
          font-size: 11px;
          color: #94a3b8;
          padding: 8px;
          background: rgba(56, 189, 248, 0.05);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 4px;
          margin-bottom: 12px;
        }
        .composite-card {
          background: rgba(30, 58, 95, 0.5);
          border: 1px solid #1e3a5f;
          border-radius: 4px;
          padding: 12px;
          margin-bottom: 12px;
        }
        .card-label {
          font-size: 9px;
          color: #475569;
          letter-spacing: 2px;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .card-value {
          font-size: 14px;
          color: #38bdf8;
          font-weight: bold;
        }
        .readout {
          font-size: 11px;
          line-height: 1.4;
          color: #cbd5e1;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-left: 2px solid #38bdf8;
          margin-top: 12px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .flags {
          font-size: 9px;
          color: #94a3b8;
          margin-top: 8px;
        }
        .flag-item {
          display: inline-block;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid #38bdf8;
          color: #38bdf8;
          padding: 2px 6px;
          margin: 2px 2px 2px 0;
          border-radius: 2px;
        }
        .flag-reject { border-color: #f472b6; color: #f472b6; background: rgba(244, 114, 182, 0.1); }
        .loading { color: #94a3b8; font-style: italic; }
        #map { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="map-pane" id="map-container">
          <div id="map"></div>
        </div>
        <div class="sidebar">
          <div class="header">SURFCADDY · SVRP</div>
          <div class="spot-name">${spotName}</div>
          <div class="coords">${latN.toFixed(6)}°, ${lonN.toFixed(6)}°</div>
          <div class="separator"></div>
          
          <div id="status" class="status">
            <div class="loading">Initializing ghost node...</div>
          </div>

          <div id="composite-container">
            <div class="composite-card">
              <div class="card-label">Swell Direction</div>
              <div class="card-value" id="composite-dir">—</div>
            </div>
            <div class="composite-card">
              <div class="card-label">Height (H)</div>
              <div class="card-value" id="composite-h">—</div>
            </div>
            <div class="composite-card">
              <div class="card-label">Period (T)</div>
              <div class="card-value" id="composite-t">—</div>
            </div>
            <div class="composite-card">
              <div class="card-label">Buoys Used</div>
              <div class="card-value" id="composite-buoys">—</div>
            </div>
          </div>

          <div id="flags-container" class="flags"></div>

          <div id="readout" class="readout" style="display:none;"></div>
        </div>
      </div>

      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script>
        const nodeId = "${nodeId}";
        const lat = ${latN};
        const lon = ${lonN};
        const spotName = "${spotName.replace(/"/g, '\\"')}";

        // Initialize Leaflet map
        const map = L.map("map").setView([lat, lon], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 18,
        }).addTo(map);

        // Add marker for ghost node
        L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: "#38bdf8",
          color: "#e2e8f0",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.8,
        })
          .bindPopup(\`<div style="color:#0a1628;font-family:monospace;font-size:11px;">
            <strong>\${spotName}</strong><br/>
            \${lat.toFixed(6)}°, \${lon.toFixed(6)}°<br/>
            Node: \${nodeId.slice(0, 8)}
          </div>\`)
          .addTo(map)
          .openPopup();

        // Connect WebSocket for live updates
        const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(\`\${wsProto}//\${location.host}/ws/ghost-node/\${nodeId}\`);

        ws.onopen = () => {
          console.log("WebSocket connected:", nodeId);
        };

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            console.log("Message:", msg.event, msg);

            if (msg.event === "composite-update") {
              const snap = msg.snapshot;
              const comp = snap.compositeResult;

              // Update UI
              document.getElementById("status").innerHTML =
                \`<div style="color:#4ade80;">✓ Composite ready</div>\`;

              document.getElementById("composite-dir").textContent =
                comp.composite?.dirOfTravelDeg !== undefined
                  ? \`\${comp.composite.dirOfTravelDeg}°\`
                  : "—";

              document.getElementById("composite-h").textContent =
                comp.composite?.H_m !== undefined
                  ? \`\${comp.composite.H_m} m\`
                  : "—";

              document.getElementById("composite-t").textContent =
                comp.composite?.T_s !== undefined
                  ? \`\${comp.composite.T_s} s\`
                  : "—";

              document.getElementById("composite-buoys").textContent =
                \`\${comp.counts.usedBuoys} / \${comp.counts.totalBuoys}\`;

              // Flags
              const flagsHtml = [];
              if (comp.flags.LIMITED) {
                flagsHtml.push(\`<span class="flag-item">LIMITED</span>\`);
              }
              if (comp.flags.VALID_TRIANGLE) {
                flagsHtml.push(\`<span class="flag-item">VALID_TRIANGLE</span>\`);
              }
              if (comp.flags.REJECTED_BUOY_IDS?.length) {
                flagsHtml.push(
                  \`<span class="flag-item flag-reject">REJECTED: \${comp.flags.REJECTED_BUOY_IDS.join(",")}</span>\`
                );
              }
              if (comp.flags.STALE_DATA) {
                flagsHtml.push(\`<span class="flag-item flag-reject">STALE</span>\`);
              }
              document.getElementById("flags-container").innerHTML = flagsHtml.join("");

              // Readout
              if (snap.readout) {
                document.getElementById("readout").textContent = snap.readout;
                document.getElementById("readout").style.display = "block";
              }
            } else if (msg.event === "status") {
              document.getElementById("status").innerHTML =
                \`<div class="loading">\${msg.status}</div>\`;
            } else if (msg.event === "error") {
              document.getElementById("status").innerHTML =
                \`<div style="color:#f472b6;">✗ Error: \${msg.message}</div>\`;
            }
          } catch (err) {
            console.error("Parse error:", err);
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket error:", err);
          document.getElementById("status").innerHTML =
            \`<div style="color:#f472b6;">✗ Connection error</div>\`;
        };

        ws.onclose = () => {
          document.getElementById("status").innerHTML =
            \`<div style="color:#94a3b8;">— Connection closed</div>\`;
        };

        // POST to trigger engine run
        fetch("/api/ghost-node/drop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lon, name: spotName }),
        })
          .then((r) => r.json())
          .then((data) => {
            console.log("Ghost node created:", data.nodeId);
          })
          .catch((err) => {
            console.error("Drop error:", err);
            document.getElementById("status").innerHTML =
              \`<div style="color:#f472b6;">✗ Failed to create node</div>\`;
          });
      </script>
    </body>
    </html>
  `;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

/**
 * GET /surfcaddy/list
 * Returns JSON list of active ghost nodes
 */
export function handleSurfCaddyList(req: Request, res: Response) {
  // This would query the ghost node store and return active nodes
  res.json({
    message: "SURFCADDY active ghost nodes",
    endpoint: "/api/ghost-node/list",
    note: "For full details, query the engine directly",
  });
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Setup routes in Express
   ───────────────────────────────────────────────────────────────────────────────── */

export function setupSurfCaddyRoutes(app: any) {
  // Dynamic routes for coordinates
  app.get("/surfcaddy/:lat/:lon", handleSurfCaddyPage);
  app.get("/surfcaddy/:lat/:lon/:name", handleSurfCaddyPage);

  // List endpoint
  app.get("/surfcaddy/list", handleSurfCaddyList);

  // Home/intro page
  app.get("/surfcaddy", (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SURFCADDY</title>
        <style>
          body { font-family: 'Courier New', monospace; background: #0a1628; color: #e2e8f0; padding: 40px; }
          h1 { font-size: 32px; margin-bottom: 16px; color: #38bdf8; }
          p { line-height: 1.6; color: #cbd5e1; margin-bottom: 12px; }
          .examples { background: rgba(56, 189, 248, 0.05); border: 1px solid #1e3a5f; padding: 16px; margin: 20px 0; border-radius: 4px; }
          code { background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 2px; }
          a { color: #38bdf8; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>⛵ SURFCADDY</h1>
        <p><strong>Live swell ops + recon web app.</strong> Drop a ghost node at any latitude/longitude and get real-time composite wave geometry from government data sources.</p>
        <p><strong>No prediction. No forecast. No verdict.</strong> Just the compass.</p>
        
        <div class="examples">
          <p><strong>Usage:</strong></p>
          <p><code>/surfcaddy/LAT/LON</code></p>
          <p><code>/surfcaddy/LAT/LON/SPOT-NAME</code></p>
          
          <p style="margin-top: 16px;"><strong>Examples:</strong></p>
          <p><a href="/surfcaddy/-43.2092/147.7519">Tasmania Southport</a></p>
          <p><code>/surfcaddy/-43.2092/147.7519/Tasmania-Southport</code></p>
          <p><code>/surfcaddy/34.701/-76.683/Oceanana-Pier</code></p>
          <p><code>/surfcaddy/40.789/-73.969/New-York</code></p>
        </div>

        <p><strong>Data sources (government only):</strong></p>
        <ul style="margin-left: 20px;">
          <li>NDBC (NOAA National Data Buoy Center) – buoy observations</li>
          <li>METAR (AviationWeather) – wind observations</li>
          <li>CO-OPS (NOAA Tides & Currents) – water level & trend</li>
          <li>GEBCO – bathymetry & depth grids</li>
        </ul>

        <p style="margin-top: 20px; color: #64748b; font-size: 12px;">
          SURFCADDY · SVRP · Clarity Tower View · Four Force Protocol
        </p>
      </body>
      </html>
    `);
  });
}
