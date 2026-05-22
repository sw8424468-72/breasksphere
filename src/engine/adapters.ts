/**
 * Phase 2: Government data adapters
 *
 * Fetch and parse readings from:
 * - NDBC (NOAA National Data Buoy Center) — realtime2 text format
 * - METAR (AviationWeather) — XML dataserver
 * - CO-OPS (NOAA Tides & Currents) — JSON API
 *
 * All adapters return normalized types: BuoyReading, METARReading, TideReading
 * for consumption by the composite engine.
 */

import { BuoyReading, METARReading, TideReading, LatLon } from "./compositeEngine";

/* ─────────────────────────────────────────────────────────────────────────────────
   NDBC Adapter
   ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch and parse NDBC realtime2 station data (text format).
 * URL: https://www.ndbc.noaa.gov/data/realtime2/{stationId}.txt
 *
 * Format: header line + data lines (space-separated values)
 * Fields: YY MM DD HH MM WDIR WSPD GST WVHT DPD APD MWD PRES PTDY ATMP WTMP DEWP VIS TIDE
 */
export async function fetchNDBCRealtime(stationId: string): Promise<BuoyReading | null> {
  try {
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`NDBC ${stationId} fetch failed: ${resp.status}`);
      return null;
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) return null; // header + data required

    // Parse header (first line contains field names)
    const headerLine = lines[0];
    const headers = headerLine.split(/\s+/);
    const idxWDIR = headers.indexOf("WDIR");
    const idxWSPD = headers.indexOf("WSPD");
    const idxWVHT = headers.indexOf("WVHT"); // wave height
    const idxDPD = headers.indexOf("DPD"); // dominant period
    const idxMWD = headers.indexOf("MWD"); // mean wave direction

    // Parse latest data line (usually last)
    const dataLine = lines[lines.length - 1];
    const vals = dataLine.split(/\s+/);

    const YY = parseInt(vals[0]);
    const MM = parseInt(vals[1]);
    const DD = parseInt(vals[2]);
    const HH = parseInt(vals[3]);
    const m = parseInt(vals[4]);

    // Build ISO timestamp (assume current century for YY < 50)
    const fullYear = YY < 50 ? 2000 + YY : 1900 + YY;
    const timestamp = new Date(fullYear, MM - 1, DD, HH, m, 0).toISOString();

    // Extract wave parameters
    const H = idxWVHT >= 0 && vals[idxWVHT] !== "MM" ? parseFloat(vals[idxWVHT]) : undefined;
    const T = idxDPD >= 0 && vals[idxDPD] !== "MM" ? parseFloat(vals[idxDPD]) : undefined;
    const dirFrom = idxMWD >= 0 && vals[idxMWD] !== "MM" ? parseFloat(vals[idxMWD]) : undefined;

    // Note: NDBC station metadata (lat/lon) not in realtime2 file; must come from station table
    return {
      id: stationId,
      lat: 0, // fill in from station metadata
      lon: 0,
      H,
      T,
      directionFrom: dirFrom,
      timestamp,
    };
  } catch (err) {
    console.error(`Error fetching NDBC ${stationId}:`, err);
    return null;
  }
}

/**
 * Fetch NDBC station table and build a map of {stationId -> {lat, lon, type}}
 * URL: https://www.ndbc.noaa.gov/data/stations/station_table.txt
 *
 * Format: whitespace-separated columns (STATION LAT LON ...)
 */
export async function fetchNDBCStationTable(): Promise<Map<string, { lat: number; lon: number }>> {
  const map = new Map<string, { lat: number; lon: number }>();
  try {
    const url = "https://www.ndbc.noaa.gov/data/stations/station_table.txt";
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`NDBC station table fetch failed: ${resp.status}`);
      return map;
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // Skip header and comments
      if (line.startsWith("#") || line.toLowerCase().includes("station")) continue;
      const cols = line.split(/\s+/);
      if (cols.length < 3) continue;
      const id = cols[0];
      const lat = parseFloat(cols[1]);
      const lon = parseFloat(cols[2]);
      if (!isNaN(lat) && !isNaN(lon)) {
        map.set(id, { lat, lon });
      }
    }
  } catch (err) {
    console.error("Error fetching NDBC station table:", err);
  }
  return map;
}

/**
 * Composite: fetch multiple NDBC stations and enrich with metadata.
 */
export async function fetchNDBCBuoys(stationIds: string[]): Promise<BuoyReading[]> {
  const stationMeta = await fetchNDBCStationTable();
  const results: BuoyReading[] = [];
  for (const id of stationIds) {
    const reading = await fetchNDBCRealtime(id);
    if (!reading) continue;
    const meta = stationMeta.get(id);
    if (meta) {
      reading.lat = meta.lat;
      reading.lon = meta.lon;
    }
    results.push(reading);
  }
  return results;
}

/* ─────────────────────────────────────────────────────────────────────────────────
   METAR Adapter
   ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch METAR data from AviationWeather dataserver (radial query).
 * URL: https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&...
 *
 * Returns XML; parse to extract wind direction and speed from nearest station.
 */
export async function fetchMETARRadial(
  centerLat: number,
  centerLon: number,
  radiusKm = 160,
  hoursBeforeNow = 2
): Promise<METARReading | null> {
  try {
    const url =
      `https://aviationweather.gov/adds/dataserver_current/httpparam?` +
      `dataSource=metars&requestType=retrieve&format=xml&` +
      `radialDistance=${radiusKm};${centerLat},${centerLon}&` +
      `hoursBeforeNow=${hoursBeforeNow}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`METAR fetch failed: ${resp.status}`);
      return null;
    }
    const xml = await resp.text();

    // Parse XML: look for <METAR>...</METAR> blocks and extract wind_dir_degrees, wind_speed_kt
    // Simple regex-based parse (for production, use a proper XML parser)
    const metarMatches = xml.matchAll(/<METAR>(.*?)<\/METAR>/gs);
    let bestReading: METARReading | null = null;

    for (const match of metarMatches) {
      const content = match[1];
      const stationMatch = content.match(/<station_id>([^<]+)<\/station_id>/);
      const windDirMatch = content.match(/<wind_dir_degrees>([^<]+)<\/wind_dir_degrees>/);
      const windSpdMatch = content.match(/<wind_speed_kt>([^<]+)<\/wind_speed_kt>/);
      const obsTimeMatch = content.match(/<observation_time>(.*?)<\/observation_time>/);

      const station = stationMatch ? stationMatch[1] : "unknown";
      const windDir = windDirMatch ? parseFloat(windDirMatch[1]) : undefined;
      const windSpd = windSpdMatch ? parseFloat(windSpdMatch[1]) : undefined;
      const obsTime = obsTimeMatch ? obsTimeMatch[1] : new Date().toISOString();

      bestReading = { station, windDir, windSpeedKts: windSpd, timestamp: obsTime };
      break; // Take first (nearest) station; can be enhanced to rank by distance
    }

    return bestReading;
  } catch (err) {
    console.error("Error fetching METAR:", err);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────
   CO-OPS Tide Adapter
   ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch CO-OPS station list (JSON) and find nearest tide station by distance.
 * URL: https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json
 */
export async function findNearestCOOPSStation(ghostNode: LatLon): Promise<string | null> {
  try {
    const url = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json";
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`CO-OPS station list fetch failed: ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (!data.stations || !Array.isArray(data.stations)) return null;

    // Find station nearest to ghost node
    let nearest = null;
    let minDist = Infinity;
    for (const st of data.stations) {
      if (!st.lat || !st.lon) continue;
      const dx = st.lat - ghostNode.lat;
      const dy = (st.lon - ghostNode.lon) * Math.cos((ghostNode.lat * Math.PI) / 180);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = st.id;
      }
    }
    return nearest;
  } catch (err) {
    console.error("Error finding nearest CO-OPS station:", err);
    return null;
  }
}

/**
 * Fetch latest water level from CO-OPS datagetter.
 * URL: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_level&...
 *
 * Returns latest reading with optional trend (rising/falling).
 */
export async function fetchCOOPSWaterLevel(stationId: string): Promise<TideReading | null> {
  try {
    // Fetch last 24 hours to compute trend
    const now = new Date();
    const begin = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const endStr = now.toISOString().replace(/[:-]/g, "").slice(0, 12); // YYYYMMDDHHMM
    const beginStr = begin.toISOString().replace(/[:-]/g, "").slice(0, 12);

    const url =
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?` +
      `product=water_level&begin_date=${beginStr}&end_date=${endStr}&` +
      `station=${stationId}&time_zone=GMT&units=metric&format=json`;

    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`CO-OPS datagetter failed for ${stationId}: ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    if (!data.data || data.data.length === 0) return null;

    const latest = data.data[data.data.length - 1];
    const waterLevel = parseFloat(latest.value);

    // Compute trend: compare latest vs 6 hours ago
    let trend: "rising" | "falling" | "steady" = "steady";
    if (data.data.length > 6) {
      const earlier = parseFloat(data.data[Math.max(0, data.data.length - 7)].value);
      if (waterLevel > earlier) trend = "rising";
      else if (waterLevel < earlier) trend = "falling";
    }

    return {
      station: stationId,
      waterLevelM: waterLevel,
      trend,
      timestamp: latest.t,
    };
  } catch (err) {
    console.error(`Error fetching CO-OPS water level for ${stationId}:`, err);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Composite: fetch all data for a ghost node
   ───────────────────────────────────────────────────────────────────────────────── */

export interface GhostNodeData {
  timestamp: string;
  buoys: BuoyReading[];
  metar?: METARReading;
  tide?: TideReading;
}

/**
 * Given a ghost node and list of candidate NDBC station IDs (from Phase 1 source index),
 * fetch all government data in parallel.
 */
export async function fetchAllGovernmentData(
  ghostNode: LatLon,
  ndbc_stationIds: string[]
): Promise<GhostNodeData> {
  const timestamp = new Date().toISOString();

  // Fetch in parallel
  const [buoys, metar, tideStationId] = await Promise.all([
    fetchNDBCBuoys(ndbc_stationIds),
    fetchMETARRadial(ghostNode.lat, ghostNode.lon, 160, 2),
    findNearestCOOPSStation(ghostNode),
  ]);

  let tide: TideReading | undefined;
  if (tideStationId) {
    tide = await fetchCOOPSWaterLevel(tideStationId);
  }

  return { timestamp, buoys, metar, tide };
}

/* ─────────────────────────────────────────────────────────────────────────────────
   Example usage
   ───────────────────────────────────────────────────────────────────────────────── */

/*
import { fetchAllGovernmentData } from "./adapters";

const ghostNode = { lat: -43.2092, lon: 147.7519 }; // Tasmania
const candidateStations = ["TASMAN_61020", "TASMAN_61021", "CORAL_61022", "SYDNEY_41046"];

const data = await fetchAllGovernmentData(ghostNode, candidateStations);
console.log("Buoys:", data.buoys.length);
console.log("METAR:", data.metar);
console.log("Tide:", data.tide);
*/
