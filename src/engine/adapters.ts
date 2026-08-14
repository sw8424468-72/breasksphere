import {
  BuoyReading,
  METARReading,
  TideReading,
  LatLon,
  haversineMiles,
} from "./compositeEngine";

const USER_AGENT = "SurfCaddy/1.0";
const NDBC_ACTIVE_STATIONS = "https://www.ndbc.noaa.gov/activestations.xml";
const AVIATION_METAR_API = "https://aviationweather.gov/api/data/metar";
const COOPS_STATIONS = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json";
const COOPS_DATA = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "" || value === "MM") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseXmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

/** Fetch the newest standard-meteorological row for an NDBC station. */
export async function fetchNDBCRealtime(stationId: string): Promise<BuoyReading | null> {
  try {
    const url = `https://www.ndbc.noaa.gov/data/realtime2/${encodeURIComponent(stationId)}.txt`;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) return null;

    const lines = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const headerLine = lines.find((line) => line.startsWith("#") && /\bWVHT\b/.test(line));
    const dataLine = lines.find((line) => !line.startsWith("#"));
    if (!headerLine || !dataLine) return null;

    const headers = headerLine.replace(/^#/, "").trim().split(/\s+/);
    const values = dataLine.split(/\s+/);
    const valueAt = (name: string) => {
      const index = headers.indexOf(name);
      return index >= 0 ? values[index] : undefined;
    };

    const year = parseNumber(values[0]);
    const month = parseNumber(values[1]);
    const day = parseNumber(values[2]);
    const hour = parseNumber(values[3]);
    const minute = parseNumber(values[4]);
    if ([year, month, day, hour, minute].some((v) => v === undefined)) return null;

    const fullYear = year! < 100 ? (year! < 50 ? 2000 + year! : 1900 + year!) : year!;
    const timestamp = new Date(
      Date.UTC(fullYear, month! - 1, day!, hour!, minute!, 0)
    ).toISOString();

    return {
      id: stationId,
      lat: 0,
      lon: 0,
      H: parseNumber(valueAt("WVHT")),
      T: parseNumber(valueAt("DPD")) ?? parseNumber(valueAt("APD")),
      directionFrom: parseNumber(valueAt("MWD")),
      timestamp,
    };
  } catch (error) {
    console.error(`NDBC ${stationId} fetch failed`, error);
    return null;
  }
}

/** Active NDBC station positions, parsed from NOAA's live XML inventory. */
export async function fetchNDBCStationTable(): Promise<Map<string, { lat: number; lon: number }>> {
  const stations = new Map<string, { lat: number; lon: number }>();
  try {
    const response = await fetch(NDBC_ACTIVE_STATIONS, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return stations;
    const xml = await response.text();

    for (const match of xml.matchAll(/<station\b[^>]*\/>/g)) {
      const attrs = parseXmlAttributes(match[0]);
      const lat = Number(attrs.lat);
      const lon = Number(attrs.lon);
      if (attrs.id && Number.isFinite(lat) && Number.isFinite(lon)) {
        stations.set(attrs.id, { lat, lon });
      }
    }
  } catch (error) {
    console.error("NDBC active-station inventory failed", error);
  }
  return stations;
}

export async function fetchNDBCBuoys(stationIds: string[]): Promise<BuoyReading[]> {
  if (!stationIds.length) return [];
  const metadata = await fetchNDBCStationTable();
  const readings = await Promise.all(stationIds.map((id) => fetchNDBCRealtime(id)));

  return readings.flatMap((reading) => {
    if (!reading) return [];
    const position = metadata.get(reading.id);
    if (!position) return [];
    reading.lat = position.lat;
    reading.lon = position.lon;
    return [reading];
  });
}

/**
 * Get the nearest recent METAR in a geographic box around the target.
 * AviationWeather is worldwide; the request is made server-side because its API
 * does not provide browser CORS access.
 */
export async function fetchMETARRadial(
  centerLat: number,
  centerLon: number,
  radiusKm = 160,
  hoursBeforeNow = 2
): Promise<METARReading | null> {
  try {
    const latDelta = radiusKm / 111;
    const lonScale = Math.max(0.15, Math.cos((centerLat * Math.PI) / 180));
    const lonDelta = radiusKm / (111 * lonScale);
    const south = Math.max(-90, centerLat - latDelta);
    const north = Math.min(90, centerLat + latDelta);
    const west = Math.max(-180, centerLon - lonDelta);
    const east = Math.min(180, centerLon + lonDelta);

    const params = new URLSearchParams({
      bbox: `${south},${west},${north},${east}`,
      format: "json",
      hours: String(hoursBeforeNow),
    });
    const response = await fetch(`${AVIATION_METAR_API}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (response.status === 204 || !response.ok) return null;

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;

    let best: { row: any; distance: number } | null = null;
    for (const row of rows) {
      const lat = parseNumber(row.lat ?? row.latitude);
      const lon = parseNumber(row.lon ?? row.longitude);
      if (lat === undefined || lon === undefined) continue;
      const distance = haversineMiles({ lat, lon }, { lat: centerLat, lon: centerLon });
      if (!best || distance < best.distance) best = { row, distance };
    }
    if (!best) return null;

    const row = best.row;
    return {
      station: String(row.icaoId ?? row.station_id ?? row.stationId ?? "unknown"),
      windDir: parseNumber(row.wdir ?? row.windDir ?? row.wind_dir_degrees),
      windSpeedKts: parseNumber(row.wspd ?? row.windSpeed ?? row.wind_speed_kt),
      timestamp: String(row.obsTime ?? row.reportTime ?? row.observation_time ?? new Date().toISOString()),
    };
  } catch (error) {
    console.error("AviationWeather METAR fetch failed", error);
    return null;
  }
}

export async function findNearestCOOPSStation(
  ghostNode: LatLon,
  maxDistanceMiles = 300
): Promise<string | null> {
  try {
    const response = await fetch(COOPS_STATIONS, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data.stations)) return null;

    let best: { id: string; distance: number } | null = null;
    for (const station of data.stations) {
      const lat = parseNumber(station.lat);
      const lon = parseNumber(station.lng ?? station.lon);
      if (lat === undefined || lon === undefined || !station.id) continue;
      const distance = haversineMiles({ lat, lon }, ghostNode);
      if (distance <= maxDistanceMiles && (!best || distance < best.distance)) {
        best = { id: String(station.id), distance };
      }
    }
    return best?.id ?? null;
  } catch (error) {
    console.error("CO-OPS station discovery failed", error);
    return null;
  }
}

export async function fetchCOOPSWaterLevel(stationId: string): Promise<TideReading | null> {
  try {
    const params = new URLSearchParams({
      date: "today",
      station: stationId,
      product: "water_level",
      datum: "MLLW",
      time_zone: "gmt",
      units: "metric",
      application: "SurfCaddy",
      format: "json",
    });
    const response = await fetch(`${COOPS_DATA}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!Array.isArray(payload.data) || payload.data.length === 0) return null;

    const valid = payload.data
      .map((row: any) => ({ row, value: parseNumber(row.v ?? row.value) }))
      .filter((item: any) => item.value !== undefined);
    if (!valid.length) return null;

    const latest = valid[valid.length - 1];
    const earlier = valid[Math.max(0, valid.length - 11)];
    const delta = latest.value - earlier.value;
    const trend: TideReading["trend"] =
      Math.abs(delta) < 0.02 ? "steady" : delta > 0 ? "rising" : "falling";

    return {
      station: stationId,
      waterLevelM: latest.value,
      trend,
      timestamp: String(latest.row.t ?? new Date().toISOString()),
    };
  } catch (error) {
    console.error(`CO-OPS ${stationId} fetch failed`, error);
    return null;
  }
}

export interface GhostNodeData {
  timestamp: string;
  buoys: BuoyReading[];
  metar?: METARReading;
  tide?: TideReading;
}

export async function fetchAllGovernmentData(
  ghostNode: LatLon,
  ndbcStationIds: string[]
): Promise<GhostNodeData> {
  const timestamp = new Date().toISOString();
  const [buoys, metar, tideStationId] = await Promise.all([
    fetchNDBCBuoys(ndbcStationIds),
    fetchMETARRadial(ghostNode.lat, ghostNode.lon, 160, 2),
    findNearestCOOPSStation(ghostNode),
  ]);

  const tide = tideStationId ? await fetchCOOPSWaterLevel(tideStationId) : null;
  return {
    timestamp,
    buoys,
    metar: metar ?? undefined,
    tide: tide ?? undefined,
  };
}
