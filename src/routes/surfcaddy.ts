import type { Request, Response } from "express";

export interface URLGhostNode {
  lat: number;
  lon: number;
  name?: string;
  slug?: string;
}

export function parseGhostNodeURL(path: string): URLGhostNode | null {
  const match = path.match(/\/surfcaddy\/([-\d.]+)\/([-\d.]+)(?:\/(.+))?$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const nameOrSlug = match[3];
  return {
    lat,
    lon,
    name: nameOrSlug ? decodeURIComponent(nameOrSlug).replace(/-/g, " ") : undefined,
    slug: nameOrSlug,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function handleSurfCaddyPage(req: Request, res: Response) {
  const lat = Number(req.params.lat);
  const lon = Number(req.params.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).send("Invalid coordinates");
  }

  const requestedName = req.params.name
    ? decodeURIComponent(req.params.name).replace(/-/g, " ")
    : `Ghost Node ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  const title = escapeHtml(requestedName);
  const jsName = JSON.stringify(requestedName);

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover" />
  <meta name="theme-color" content="#07111f" />
  <title>SurfCaddy · ${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    :root { color-scheme: dark; --bg:#07111f; --panel:rgba(7,17,31,.94); --line:#29425f; --hot:#5dd6ff; --ok:#63e6a4; --warn:#ffcc66; --bad:#ff7d8d; --muted:#8295aa; }
    * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    html,body,#app,#map { width:100%; height:100%; margin:0; overflow:hidden; }
    body { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; background:var(--bg); color:#eef7ff; touch-action:none; }
    #map { position:fixed; inset:0; background:#091526; }
    .leaflet-control-attribution { font-size:9px; }
    .topbar { position:fixed; top:max(8px,env(safe-area-inset-top)); left:max(8px,env(safe-area-inset-left)); right:max(8px,env(safe-area-inset-right)); z-index:1000; display:flex; gap:7px; align-items:center; pointer-events:none; }
    .brand { pointer-events:auto; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:8px 10px; min-width:0; box-shadow:0 4px 18px #0007; }
    .brand b { color:var(--hot); letter-spacing:2px; font-size:12px; }
    .brand small { display:block; color:var(--muted); margin-top:2px; max-width:45vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .toolbar { pointer-events:auto; margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
    button { min-height:40px; border:1px solid var(--line); border-radius:9px; background:var(--panel); color:#e8f4ff; font:700 10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.5px; padding:0 11px; box-shadow:0 3px 14px #0005; }
    button.active { border-color:var(--hot); color:var(--hot); background:rgba(20,69,91,.92); }
    button:disabled { opacity:.45; }
    .crosshair { position:fixed; left:50%; top:50%; width:34px; height:34px; margin:-17px 0 0 -17px; z-index:700; pointer-events:none; filter:drop-shadow(0 2px 3px #000); }
    .crosshair:before,.crosshair:after { content:""; position:absolute; background:var(--hot); }
    .crosshair:before { width:34px; height:1px; top:16px; left:0; }
    .crosshair:after { width:1px; height:34px; left:16px; top:0; }
    .crosshair i { position:absolute; width:9px; height:9px; border:1px solid var(--hot); border-radius:50%; left:12px; top:12px; }
    .coord-read { position:fixed; z-index:800; left:50%; transform:translateX(-50%); bottom:max(10px,env(safe-area-inset-bottom)); background:var(--panel); border:1px solid var(--line); border-radius:9px; padding:6px 9px; font-size:10px; color:#d6e8f8; pointer-events:none; white-space:nowrap; }
    .drawer { position:fixed; z-index:900; top:68px; right:max(8px,env(safe-area-inset-right)); bottom:max(8px,env(safe-area-inset-bottom)); width:min(370px,calc(100vw - 16px)); background:var(--panel); border:1px solid var(--line); border-radius:12px; box-shadow:0 10px 34px #0009; overflow:auto; overscroll-behavior:contain; transition:transform .2s ease; }
    .drawer.closed { transform:translateX(calc(100% + 16px)); }
    .grab { display:none; width:48px; height:4px; border-radius:4px; background:#64788c; margin:8px auto 4px; }
    .panel { padding:12px; border-bottom:1px solid #20364d; }
    .panel:last-child { border-bottom:0; }
    .panel h3 { margin:0 0 9px; font-size:10px; letter-spacing:1.5px; color:var(--hot); }
    .status { font-size:11px; line-height:1.45; color:#c9d8e6; }
    .status.ok { color:var(--ok); } .status.warn { color:var(--warn); } .status.bad { color:var(--bad); }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    .metric { border:1px solid #263d55; border-radius:8px; background:#091727cc; padding:8px; min-height:58px; }
    .metric span { display:block; color:var(--muted); font-size:8px; letter-spacing:1px; text-transform:uppercase; }
    .metric b { display:block; margin-top:5px; font-size:14px; color:#f2f8ff; }
    .packet { white-space:pre-wrap; line-height:1.5; font-size:10px; color:#cbd9e6; }
    .source { padding:7px 0; border-top:1px dashed #263d55; font-size:9px; line-height:1.4; }
    .source:first-child { border-top:0; }
    .source b { color:#e8f4ff; } .source em { color:var(--muted); font-style:normal; }
    .timeline { display:flex; gap:5px; overflow-x:auto; padding-bottom:3px; }
    .tick { min-width:76px; border:1px solid #263d55; border-radius:7px; padding:6px; font-size:8px; color:#b7c8d8; }
    .leaflet-marker-icon.buoy-dot { border-radius:50%; background:#ffae58; border:2px solid #fff; box-shadow:0 1px 5px #000; }
    @media (max-width:720px) {
      .brand { max-width:42vw; }
      .brand small { max-width:38vw; }
      .toolbar { gap:4px; }
      button { min-height:42px; padding:0 9px; }
      .drawer { top:auto; left:max(6px,env(safe-area-inset-left)); right:max(6px,env(safe-area-inset-right)); bottom:max(6px,env(safe-area-inset-bottom)); width:auto; max-height:52vh; border-radius:14px; transform:translateY(0); }
      .drawer.closed { transform:translateY(calc(100% + 12px)); }
      .grab { display:block; }
      .coord-read { bottom:64px; }
      .panel { padding:10px 12px; }
    }
  </style>
</head>
<body>
<div id="app"><div id="map"></div></div>
<div class="crosshair"><i></i></div>
<div class="topbar">
  <div class="brand"><b>SURFCADDY</b><small id="spotTitle">${title}</small></div>
  <div class="toolbar">
    <button id="gpsBtn">GPS</button>
    <button id="headingBtn">HDG <span id="headingText">---</span></button>
    <button id="buoyBtn" class="active">BUOYS</button>
    <button id="radarBtn">RADAR</button>
    <button id="scanBtn">SCAN</button>
    <button id="drawerBtn">PACKET</button>
  </div>
</div>
<div class="coord-read" id="coordRead">${lat.toFixed(5)}, ${lon.toFixed(5)} · TRUE NORTH 000°</div>
<aside class="drawer" id="drawer">
  <div class="grab"></div>
  <section class="panel"><h3>GHOST NODE</h3><div class="status" id="status">Prospecting sources…</div></section>
  <section class="panel">
    <div class="grid">
      <div class="metric"><span>Swell from</span><b id="swellFrom">—</b></div>
      <div class="metric"><span>Travel</span><b id="swellTravel">—</b></div>
      <div class="metric"><span>Offshore Hs</span><b id="swellHeight">—</b></div>
      <div class="metric"><span>Period</span><b id="swellPeriod">—</b></div>
      <div class="metric"><span>Wind</span><b id="windMetric">—</b></div>
      <div class="metric"><span>Water level</span><b id="tideMetric">—</b></div>
    </div>
  </section>
  <section class="panel"><h3>FIELD PACKET</h3><div class="packet" id="packet">Waiting for first scan.</div></section>
  <section class="panel"><h3>WAVE TIMELINE</h3><div class="timeline" id="timeline"><div class="tick">No scans yet</div></div></section>
  <section class="panel"><h3>SOURCE TRACE</h3><div id="sources">No source index yet.</div></section>
</aside>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/esri-leaflet@3.0.15/dist/esri-leaflet.js"></script>
<script>
(function () {
  var initialLat = ${lat};
  var initialLon = ${lon};
  var spotName = ${jsName};
  var map = L.map('map', { zoomControl: true, attributionControl: true }).setView([initialLat, initialLon], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

  var radar = L.esri.dynamicMapLayer({
    url: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity/MapServer',
    opacity: 0.58,
    f: 'image'
  });
  var buoyLayer = L.layerGroup().addTo(map);
  var nodeLayer = L.layerGroup().addTo(map);
  var ws = null;
  var nodeId = null;
  var gpsWatch = null;
  var gpsFollowing = false;
  var buoysVisible = true;
  var radarVisible = false;
  var history = [];
  var currentSourceIndex = [];

  var el = function (id) { return document.getElementById(id); };
  var fmt = function (value, digits) { return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'; };
  var cardinal = function (deg) {
    if (!Number.isFinite(Number(deg))) return '';
    var dirs = ['N','NE','E','SE','S','SW','W','NW'];
    return dirs[Math.round((((Number(deg) % 360) + 360) % 360) / 45) % 8];
  };
  var setStatus = function (text, klass) {
    el('status').textContent = text;
    el('status').className = 'status' + (klass ? ' ' + klass : '');
  };

  function updateCoordinates(latlng) {
    el('coordRead').textContent = latlng.lat.toFixed(5) + ', ' + latlng.lng.toFixed(5) + ' · TRUE NORTH 000°';
  }
  map.on('move', function () { updateCoordinates(map.getCenter()); });
  map.on('mousemove', function (e) {
    if (window.innerWidth > 720) updateCoordinates(e.latlng);
  });

  function markerForSource(source) {
    if (!Number.isFinite(Number(source.lat)) || !Number.isFinite(Number(source.lon))) return;
    var icon = L.divIcon({ className:'buoy-dot', iconSize:[12,12], iconAnchor:[6,6] });
    var marker = L.marker([source.lat, source.lon], { icon:icon });
    marker.bindPopup('<b>' + escapeText(source.stationId || source.label) + '</b><br>' + fmt(source.distanceMiles,1) + ' mi from node');
    marker.addTo(buoyLayer);
  }

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[ch];
    });
  }

  function renderSources(sources) {
    currentSourceIndex = Array.isArray(sources) ? sources : [];
    buoyLayer.clearLayers();
    var html = '';
    currentSourceIndex.forEach(function (source) {
      if (source.source === 'NDBC') markerForSource(source);
      html += '<div class="source"><b>' + escapeText(source.source) + '</b> · ' + escapeText(source.label || source.stationId || '') +
        (source.distanceMiles != null ? '<br><em>' + fmt(source.distanceMiles,1) + ' mi · ' + escapeText(source.status || '') + '</em>' : '<br><em>' + escapeText(source.status || '') + '</em>') + '</div>';
    });
    el('sources').innerHTML = html || '<div class="source"><em>No candidates returned.</em></div>';
    if (!buoysVisible) map.removeLayer(buoyLayer);
  }

  function renderTimeline() {
    if (!history.length) { el('timeline').innerHTML = '<div class="tick">No scans yet</div>'; return; }
    el('timeline').innerHTML = history.slice(-8).reverse().map(function (item) {
      return '<div class="tick"><b>' + escapeText(item.time) + '</b><br>' + escapeText(item.h) + '<br>' + escapeText(item.t) + '<br>' + escapeText(item.dir) + '</div>';
    }).join('');
  }

  function renderSnapshot(snapshot) {
    var comp = snapshot && snapshot.compositeResult ? snapshot.compositeResult : {};
    var c = comp.composite || {};
    var raw = snapshot && snapshot.rawData ? snapshot.rawData : {};
    var wind = raw.metar || null;
    var tide = raw.tide || null;

    el('swellFrom').textContent = c.directionFromDeg == null ? '—' : fmt(c.directionFromDeg,0) + '° ' + cardinal(c.directionFromDeg);
    el('swellTravel').textContent = c.dirOfTravelDeg == null ? '—' : fmt(c.dirOfTravelDeg,0) + '° ' + cardinal(c.dirOfTravelDeg);
    el('swellHeight').textContent = c.H_m == null ? '—' : fmt(c.H_m,2) + ' m';
    el('swellPeriod').textContent = c.T_s == null ? '—' : fmt(c.T_s,1) + ' s';
    el('windMetric').textContent = wind && wind.windSpeedKts != null ? fmt(wind.windSpeedKts,0) + ' kt @ ' + fmt(wind.windDir,0) + '°' : '—';
    el('tideMetric').textContent = tide && tide.waterLevelM != null ? fmt(tide.waterLevelM,2) + ' m ' + (tide.trend || '') : '—';

    var counts = comp.counts || { usedBuoys:0, totalBuoys:0 };
    var packet = [];
    packet.push(snapshot.readout || 'No offshore composite produced.');
    packet.push('');
    packet.push('OBSERVATIONS');
    packet.push('Buoys accepted: ' + counts.usedBuoys + '/' + counts.totalBuoys);
    packet.push('Wind: ' + (wind ? (fmt(wind.windSpeedKts,0) + ' kt from ' + fmt(wind.windDir,0) + '° · ' + (wind.station || 'METAR')) : 'not available'));
    packet.push('Water: ' + (tide ? (fmt(tide.waterLevelM,2) + ' m · ' + tide.trend + ' · ' + tide.station) : 'not available'));
    packet.push('');
    packet.push('BOUNDARY');
    packet.push('Offshore observation geometry only. No breaking-wave height or surf score invented.');
    el('packet').textContent = packet.join('\n');

    var limited = comp.flags && comp.flags.LIMITED;
    setStatus('Scan complete · ' + counts.usedBuoys + '/' + counts.totalBuoys + ' buoy vectors accepted' + (limited ? ' · LIMITED' : ''), limited ? 'warn' : 'ok');
    if (snapshot.sourceIndex) renderSources(snapshot.sourceIndex);

    history.push({
      time: new Date(snapshot.generatedAt || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),
      h: c.H_m == null ? 'Hs —' : 'Hs ' + fmt(c.H_m,2) + 'm',
      t: c.T_s == null ? 'T —' : 'T ' + fmt(c.T_s,1) + 's',
      dir: c.directionFromDeg == null ? 'Dir —' : 'From ' + fmt(c.directionFromDeg,0) + '°'
    });
    renderTimeline();
  }

  function connectNode(id) {
    if (ws) { try { ws.close(); } catch (_) {} }
    nodeId = id;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws/ghost-node/' + encodeURIComponent(id));
    ws.onopen = function () { setStatus('Connected · scanning live sources…'); };
    ws.onmessage = function (event) {
      try {
        var message = JSON.parse(event.data);
        if (message.event === 'status') setStatus(message.status || 'Scanning…');
        if (message.event === 'error') setStatus(message.message || 'Scan error', 'bad');
        if (message.event === 'composite-update') renderSnapshot(message.snapshot || {});
      } catch (_) { setStatus('Bad engine message', 'bad'); }
    };
    ws.onerror = function () { setStatus('WebSocket connection failed', 'bad'); };
  }

  async function dropNode(latlng, name) {
    setStatus('PROSPECT → locating approved sources…');
    el('scanBtn').disabled = true;
    try {
      var response = await fetch('/api/ghost-node/drop', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ lat:latlng.lat, lon:latlng.lng, name:name })
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || ('HTTP ' + response.status));
      nodeLayer.clearLayers();
      L.circleMarker([latlng.lat, latlng.lng], { radius:7, weight:2, color:'#fff', fillColor:'#5dd6ff', fillOpacity:.9 })
        .bindPopup('<b>Ghost Node</b><br>' + latlng.lat.toFixed(5) + ', ' + latlng.lng.toFixed(5))
        .addTo(nodeLayer);
      renderSources(data.sourceIndex || []);
      connectNode(data.nodeId);
    } catch (error) {
      setStatus('Drop failed · ' + (error && error.message ? error.message : error), 'bad');
    } finally {
      el('scanBtn').disabled = false;
    }
  }

  el('scanBtn').onclick = function () {
    var center = map.getCenter();
    dropNode(center, 'Ghost Node ' + center.lat.toFixed(4) + ', ' + center.lng.toFixed(4));
  };

  el('buoyBtn').onclick = function () {
    buoysVisible = !buoysVisible;
    el('buoyBtn').classList.toggle('active', buoysVisible);
    if (buoysVisible) buoyLayer.addTo(map); else map.removeLayer(buoyLayer);
  };

  el('radarBtn').onclick = function () {
    radarVisible = !radarVisible;
    el('radarBtn').classList.toggle('active', radarVisible);
    if (radarVisible) radar.addTo(map); else map.removeLayer(radar);
  };

  el('drawerBtn').onclick = function () {
    el('drawer').classList.toggle('closed');
    el('drawerBtn').classList.toggle('active', !el('drawer').classList.contains('closed'));
  };
  el('drawerBtn').classList.add('active');

  function stopGps() {
    if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
    gpsFollowing = false;
    el('gpsBtn').classList.remove('active');
  }
  el('gpsBtn').onclick = function () {
    if (!navigator.geolocation) { setStatus('Geolocation unavailable', 'bad'); return; }
    if (gpsFollowing) { stopGps(); return; }
    gpsFollowing = true;
    el('gpsBtn').classList.add('active');
    gpsWatch = navigator.geolocation.watchPosition(function (position) {
      if (!gpsFollowing) return;
      map.setView([position.coords.latitude, position.coords.longitude], Math.max(map.getZoom(), 12), { animate:true });
    }, function (error) {
      setStatus('GPS · ' + error.message, 'bad');
      stopGps();
    }, { enableHighAccuracy:true, maximumAge:5000, timeout:15000 });
  };

  function handleHeading(event) {
    var heading = Number.isFinite(event.webkitCompassHeading) ? event.webkitCompassHeading : (event.absolute && Number.isFinite(event.alpha) ? (360 - event.alpha) % 360 : NaN);
    if (Number.isFinite(heading)) el('headingText').textContent = String(Math.round(heading)).padStart(3,'0') + '°';
  }
  el('headingBtn').onclick = async function () {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        var permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') throw new Error('orientation permission denied');
      }
      window.addEventListener('deviceorientationabsolute', handleHeading, true);
      window.addEventListener('deviceorientation', handleHeading, true);
      el('headingBtn').classList.add('active');
    } catch (error) {
      setStatus('Heading · ' + (error && error.message ? error.message : error), 'bad');
    }
  };

  dropNode({ lat:initialLat, lng:initialLon }, spotName);
})();
</script>
</body>
</html>`);
}

export function handleSurfCaddyList(_req: Request, res: Response) {
  res.redirect("/api/ghost-node/list");
}

export function setupSurfCaddyRoutes(app: any) {
  app.get("/surfcaddy/list", handleSurfCaddyList);
  app.get("/surfcaddy/:lat/:lon", handleSurfCaddyPage);
  app.get("/surfcaddy/:lat/:lon/:name", handleSurfCaddyPage);
  app.get("/surfcaddy", (_req: Request, res: Response) => {
    res.redirect("/surfcaddy/34.6989/-76.7216/Cape-Lookout");
  });
}
