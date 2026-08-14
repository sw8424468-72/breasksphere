export interface LatLon {
  lat: number;
  lon: number;
}

export interface BuoyReading extends LatLon {
  id: string;
  H?: number;
  T?: number;
  directionFrom?: number;
  timestamp: string;
}

export interface METARReading {
  station: string;
  windDir?: number;
  windSpeedKts?: number;
  timestamp: string;
}

export interface TideReading {
  station: string;
  waterLevelM: number;
  trend: "rising" | "falling" | "steady";
  timestamp: string;
}

export interface CompositeDefaults {
  MIN_BUOYS_TO_RUN: number;
  MIN_BUOYS_FOR_FULL: number;
  MAX_SOURCE_DISTANCE_MILES: number;
  MAX_DATA_AGE_MINUTES: number;
  CORRIDOR_LIMIT_DEG: number;
}

export const DEFAULTS: CompositeDefaults = {
  MIN_BUOYS_TO_RUN: 1,
  MIN_BUOYS_FOR_FULL: 3,
  MAX_SOURCE_DISTANCE_MILES: 250,
  MAX_DATA_AGE_MINUTES: 360,
  CORRIDOR_LIMIT_DEG: 90,
};

export interface PerBuoyDiagnostic {
  id: string;
  accepted: boolean;
  distanceMiles: number;
  bearingToTarget?: number;
  travelDirection?: number;
  corridorErrorDeg?: number;
  ageMinutes?: number;
  weight?: number;
  H_decayed?: number;
  energy?: number;
  transmissionFactor?: number;
  reason?: string;
}

export interface CompositeResult {
  composite: {
    dirOfTravelDeg?: number;
    directionFromDeg?: number;
    H_m?: number;
    T_s?: number;
    energyProxy?: number;
  };
  counts: {
    totalBuoys: number;
    usedBuoys: number;
    rejectedBuoys: number;
  };
  flags: {
    LIMITED: boolean;
    VALID_TRIANGLE: boolean;
    STALE_DATA: boolean;
    REJECTED_BUOY_IDS: string[];
  };
  diagnostic: {
    perBuoy: PerBuoyDiagnostic[];
  };
  readout: string;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const normalize360 = (deg: number) => ((deg % 360) + 360) % 360;
const round = (value: number, digits = 2) => {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
};

export function angularDifference(a: number, b: number): number {
  const d = Math.abs(normalize360(a) - normalize360(b));
  return d > 180 ? 360 - d : d;
}

export function haversineMiles(a: LatLon, b: LatLon): number {
  const earthRadiusMiles = 3958.7613;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function computeBearing(from: LatLon, to: LatLon): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalize360(toDeg(Math.atan2(y, x)));
}

export function directionFromToTravel(directionFrom: number): number {
  return normalize360(directionFrom + 180);
}

export function directionTravelToFrom(directionTravel: number): number {
  return normalize360(directionTravel + 180);
}

/**
 * Classifies observed wind against a seaward shore-normal bearing (beta).
 * Wind observations are reported as the direction the wind comes FROM, so this
 * converts to the direction of travel before comparing it to beta.
 */
export function windVsBeta(
  metar: METARReading,
  betaSeawardDeg: number
): { classification: "offshore" | "cross" | "onshore" | "unknown"; angle: number } {
  if (metar.windDir === undefined || !Number.isFinite(metar.windDir)) {
    return { classification: "unknown", angle: 0 };
  }
  const windTravel = directionFromToTravel(metar.windDir);
  const angle = round(angularDifference(windTravel, betaSeawardDeg), 1);
  if (angle <= 45) return { classification: "offshore", angle };
  if (angle >= 135) return { classification: "onshore", angle };
  return { classification: "cross", angle };
}

/**
 * Simple breaker-depth proxy using the commonly used breaker index H/d ≈ 0.78.
 * This is a diagnostic only; local bathymetry and bar geometry still control the
 * actual break.
 */
export function breakingDepthProxy(heightM?: number): number | undefined {
  if (heightM === undefined || !Number.isFinite(heightM) || heightM <= 0) return undefined;
  return round(heightM / 0.78, 2);
}

function ageMinutes(timestamp: string): number {
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (Date.now() - t) / 60000);
}

function weightedCircularMean(
  values: Array<{ deg: number; weight: number }>
): number | undefined {
  if (!values.length) return undefined;
  let x = 0;
  let y = 0;
  for (const v of values) {
    x += Math.cos(toRad(v.deg)) * v.weight;
    y += Math.sin(toRad(v.deg)) * v.weight;
  }
  if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) return undefined;
  return normalize360(toDeg(Math.atan2(y, x)));
}

function triangleQuality(bearings: number[]): boolean {
  if (bearings.length < 3) return false;
  const sorted = bearings.map(normalize360).sort((a, b) => a - b);
  let largestGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    largestGap = Math.max(largestGap, next - sorted[i]);
  }
  // If every accepted source sits inside a single half-plane, geometry is weak.
  return largestGap < 180;
}

/**
 * Composite live buoy observations at a target point.
 *
 * This engine intentionally does NOT invent a surf score or transform offshore
 * significant wave height into breaking-wave height. It checks whether each
 * observed swell vector is geometrically capable of travelling from that sensor
 * toward the target, then forms a weighted consensus of accepted observations.
 */
export function compositeSwell(
  buoys: BuoyReading[],
  ghostNode: LatLon,
  config: CompositeDefaults = DEFAULTS
): CompositeResult {
  const diagnostics: PerBuoyDiagnostic[] = [];
  const accepted: Array<{
    buoy: BuoyReading;
    travelDirection: number;
    weight: number;
    transmission: number;
    distance: number;
    bearing: number;
    age: number;
  }> = [];

  for (const buoy of buoys) {
    const distance = haversineMiles(buoy, ghostNode);
    const bearing = computeBearing(buoy, ghostNode);
    const age = ageMinutes(buoy.timestamp);
    const H = buoy.H;
    const T = buoy.T;
    const directionFrom = buoy.directionFrom;

    const diagnostic: PerBuoyDiagnostic = {
      id: buoy.id,
      accepted: false,
      distanceMiles: round(distance, 1),
      bearingToTarget: round(bearing, 1),
      ageMinutes: round(age, 1),
    };

    if (
      H === undefined ||
      T === undefined ||
      directionFrom === undefined ||
      !Number.isFinite(H) ||
      !Number.isFinite(T) ||
      !Number.isFinite(directionFrom) ||
      H <= 0 ||
      T <= 0
    ) {
      diagnostic.reason = "missing wave height / period / direction";
      diagnostics.push(diagnostic);
      continue;
    }

    const travelDirection = directionFromToTravel(directionFrom);
    const corridorError = angularDifference(travelDirection, bearing);
    diagnostic.travelDirection = round(travelDirection, 1);
    diagnostic.corridorErrorDeg = round(corridorError, 1);

    if (distance > config.MAX_SOURCE_DISTANCE_MILES) {
      diagnostic.reason = `outside ${config.MAX_SOURCE_DISTANCE_MILES} mi source zone`;
      diagnostics.push(diagnostic);
      continue;
    }

    if (age > config.MAX_DATA_AGE_MINUTES) {
      diagnostic.reason = "stale observation";
      diagnostics.push(diagnostic);
      continue;
    }

    if (corridorError > config.CORRIDOR_LIMIT_DEG) {
      diagnostic.reason = "swell travel vector misses target corridor";
      diagnostics.push(diagnostic);
      continue;
    }

    const transmission = Math.max(0, Math.cos(toRad(corridorError)));
    const distanceWeight = 1 / (1 + distance / 100);
    const freshnessWeight = Math.exp(-age / 360);
    const weight = Math.max(0.001, transmission * distanceWeight * freshnessWeight);
    const energy = H * H * T;

    diagnostic.accepted = true;
    diagnostic.reason = "accepted by source-zone + vector geometry";
    diagnostic.transmissionFactor = round(transmission, 3);
    diagnostic.weight = round(weight, 4);
    // Keep measured offshore height intact. Do not fabricate shelf attenuation.
    diagnostic.H_decayed = round(H, 3);
    diagnostic.energy = round(energy, 3);
    diagnostics.push(diagnostic);

    accepted.push({
      buoy,
      travelDirection,
      weight,
      transmission,
      distance,
      bearing,
      age,
    });
  }

  const rejectedIds = diagnostics.filter((d) => !d.accepted).map((d) => d.id);
  const flags = {
    LIMITED: accepted.length < config.MIN_BUOYS_FOR_FULL,
    VALID_TRIANGLE: triangleQuality(accepted.map((a) => a.bearing)),
    STALE_DATA: buoys.length > 0 && buoys.every((b) => ageMinutes(b.timestamp) > config.MAX_DATA_AGE_MINUTES),
    REJECTED_BUOY_IDS: rejectedIds,
  };

  if (accepted.length < config.MIN_BUOYS_TO_RUN) {
    return {
      composite: {},
      counts: {
        totalBuoys: buoys.length,
        usedBuoys: 0,
        rejectedBuoys: buoys.length,
      },
      flags,
      diagnostic: { perBuoy: diagnostics },
      readout:
        buoys.length === 0
          ? "No live buoy wave observations were available inside the source zone. No surf value was invented."
          : "No buoy vectors passed the source-zone and travel-corridor checks. No composite was produced.",
    };
  }

  const totalWeight = accepted.reduce((sum, a) => sum + a.weight, 0);
  const weighted = (selector: (a: (typeof accepted)[number]) => number) =>
    accepted.reduce((sum, a) => sum + selector(a) * a.weight, 0) / totalWeight;

  const direction = weightedCircularMean(
    accepted.map((a) => ({ deg: a.travelDirection, weight: a.weight }))
  );
  const H = weighted((a) => a.buoy.H!);
  const T = weighted((a) => a.buoy.T!);
  const energyProxy = weighted((a) => a.buoy.H! * a.buoy.H! * a.buoy.T!);
  const directionFrom = direction === undefined ? undefined : directionTravelToFrom(direction);

  const composite = {
    dirOfTravelDeg: direction === undefined ? undefined : round(direction, 1),
    directionFromDeg: directionFrom === undefined ? undefined : round(directionFrom, 1),
    H_m: round(H, 2),
    T_s: round(T, 1),
    energyProxy: round(energyProxy, 2),
  };

  const directionText =
    composite.dirOfTravelDeg === undefined
      ? "direction unavailable"
      : `${composite.dirOfTravelDeg}°T travel / ${composite.directionFromDeg}°T from`;

  return {
    composite,
    counts: {
      totalBuoys: buoys.length,
      usedBuoys: accepted.length,
      rejectedBuoys: buoys.length - accepted.length,
    },
    flags,
    diagnostic: { perBuoy: diagnostics },
    readout:
      `Offshore observation composite: ${composite.H_m} m @ ${composite.T_s} s, ${directionText}. ` +
      `${accepted.length}/${buoys.length} buoy vectors accepted. ` +
      `${flags.LIMITED ? "Source geometry is limited. " : "Source geometry has multi-station support. "}` +
      "This is an offshore observation read, not a breaking-wave prediction or surf score.",
  };
}
