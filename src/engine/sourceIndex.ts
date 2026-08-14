import { LatLon, haversineMiles } from "./compositeEngine";

export interface SourceEntry {
  source: "NDBC" | "AVIATION_WEATHER" | "COOPS" | "GFS_WAVE";
  kind: "observation" | "metadata" | "model";
  label: string;
  url: string;
  stationId?: string;
  lat?: number;
  lon?: number;
  distanceMiles?: number;
  status: "candidate" | "reference";
}

interface NDBCStation extends LatLon {
  id: string;
  name: string;
  met: boolean;
}

const ACTIVE_STATIONS_URL = "https://www.ndbc.noaa.gov/activestations.xml";
const GFS_WAVE_URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod/";
const COOPS_URL = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json";
const AVIATION_WEATHER_URL = "https://aviationweather.gov/api/data/metar";

function parseStationAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

async function fetchActiveNDBCStations(): Promise<NDBCStation[]> {
  try {
    const response = await fetch(ACTIVE_STATIONS_URL, {
      headers: { "User-Agent": "SurfCaddy/1.0" },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const stations: NDBCStation[] = [];

    for (const match of xml.matchAll(/<station\b[^>]*\/>/g)) {
      const attrs = parseStationAttributes(match[0]);
      const lat = Number(attrs.lat);
      const lon = Number(attrs.lon);
      if (!attrs.id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      stations.push({
        id: attrs.id,
        lat,
        lon,
        name: attrs.name || attrs.id,
        met: attrs.met === "y",
      });
    }
    return stations;
  } catch {
    return [];
  }
}

/**
 * Prospect the target coordinate before the engine evaluates it.
 *
 * The index is intentionally a source inventory, not a promise that every source
 * will have a usable observation at that instant. NDBC candidates are selected
 * from the live active-station feed inside the configured radius. Global GFS-Wave
 * is indexed as a model source for the next adapter stage; this file does not
 * fabricate model values.
 */
export async function buildSourceIndex(
  ghostNode: LatLon,
  timestamp = new Date().toISOString(),
  radiusMiles = 250
): Promise<{ index: SourceEntry[]; generatedAt: string; radiusMiles: number }> {
  const index: SourceEntry[] = [];
  const ndbcStations = await fetchActiveNDBCStations();

  const nearby = ndbcStations
    .map((station) => ({ station, distanceMiles: haversineMiles(station, ghostNode) }))
    .filter(({ station, distanceMiles }) => station.met && distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 12);

  for (const { station, distanceMiles } of nearby) {
    index.push({
      source: "NDBC",
      kind: "observation",
      label: `${station.id} · ${station.name}`,
      stationId: station.id,
      lat: station.lat,
      lon: station.lon,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      url: `https://www.ndbc.noaa.gov/data/realtime2/${station.id}.txt`,
      status: "candidate",
    });
  }

  index.push(
    {
      source: "GFS_WAVE",
      kind: "model",
      label: "NOAA/NCEP GFS-Wave operational model archive",
      url: GFS_WAVE_URL,
      status: "reference",
    },
    {
      source: "AVIATION_WEATHER",
      kind: "metadata",
      label: "AviationWeather METAR observations",
      url: AVIATION_WEATHER_URL,
      status: "reference",
    },
    {
      source: "COOPS",
      kind: "metadata",
      label: "NOAA CO-OPS water levels and station metadata",
      url: COOPS_URL,
      status: "reference",
    }
  );

  return { index, generatedAt: timestamp, radiusMiles };
}
