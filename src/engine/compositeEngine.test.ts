/**
 * Test run: Ghost Node at 43.2092° S, 147.7519° E
 * Location: Southern Tasmania, Australia (Southport / Eddystone Point area)
 *
 * This test demonstrates the composite engine running on a real-world coordinate
 * with synthesized government-source data (NDBC buoys in Tasman Sea / Coral Sea region).
 *
 * Run: npx ts-node src/engine/compositeEngine.test.ts
 */

import {
  compositeSwell,
  BuoyReading,
  METARReading,
  TideReading,
  windVsBeta,
  breakingDepthProxy,
  haversineMiles,
  computeBearing,
  DEFAULTS,
} from "./compositeEngine";

const GHOST_NODE = { lat: -43.2092, lon: 147.7519 }; // Tasmania, Australia
const BETA = 215; // Shore-normal bearing (approximate, facing SW into Tasman Sea)

console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
console.log("║              SURFCADDY · SVRP ENGINE TEST RUN                                 ║");
console.log("║              Ghost Node: Tasmania (43.2092°S, 147.7519°E)                    ║");
console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

// Synthesized government-source buoy data (NDBC stations in the region)
// Real stations in/near Tasman Sea and Coral Sea:
// 41046 (Sydney), 41047 (near NZ), 61020 (Tasman Sea WMO)
// For this test, we use plausible synthesized readings from real station locations

const buoys: BuoyReading[] = [
  {
    // Tasman Sea buoy (WMO 61020 approximate)
    id: "TASMAN_61020",
    lat: -42.5,
    lon: 145.0,
    H: 1.8, // meters (Southern Ocean swell typical)
    T: 14, // seconds (long-period Southern Hemisphere swell)
    directionFrom: 215, // SW, typical austral swell direction
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(), // 15 min old
  },
  {
    // Eastern Tasman buoy (WMO 61021 approximate)
    id: "TASMAN_61021",
    lat: -43.0,
    lon: 150.0,
    H: 1.5,
    T: 13,
    directionFrom: 210, // SW
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    // Coral Sea buoy (north, secondary source)
    id: "CORAL_61022",
    lat: -40.0,
    lon: 149.0,
    H: 0.8, // smaller, too far north and in fetch shadow
    T: 9,
    directionFrom: 180, // S, different corridor
    timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    // Sydney region buoy (41046 approximate)
    id: "SYDNEY_41046",
    lat: -33.9,
    lon: 151.9,
    H: 0.6, // too far north, weak at test location
    T: 8,
    directionFrom: 200,
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
  },
];

// Synthesized METAR (from nearest Australian airport — Hobart or Launceston region)
const metar: METARReading = {
  station: "YFML", // Hobart, Australia
  windDir: 240, // SW wind
  windSpeedKts: 18,
  timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
};

// Synthesized tide (from Australian tide tables, CO-OPS equivalent)
const tide: TideReading = {
  station: "HOBART_PORT",
  waterLevelM: 0.35, // spring tide, rising toward high
  trend: "rising",
  timestamp: new Date().toISOString(),
};

console.log("📍 GHOST NODE COORDINATES");
console.log(`   Latitude:  ${GHOST_NODE.lat}° (S)`);
console.log(`   Longitude: ${GHOST_NODE.lon}° (E)`);
console.log(`   Location:  Southern Tasmania, Southport area\n`);

console.log("🧭 BEACH PARAMETERS");
console.log(`   β (Shore-normal):  ${BETA}° (SW-facing, into Tasman Sea)\n`);

console.log("📊 CANDIDATE BUOYS (Government sources)\n");
buoys.forEach((b) => {
  const dist = haversineMiles(b, GHOST_NODE);
  const bearing = computeBearing(b, GHOST_NODE);
  const age = Math.round((Date.now() - new Date(b.timestamp).getTime()) / 1000 / 60);
  console.log(`   ${b.id}`);
  console.log(`     Lat/Lon: ${b.lat}°, ${b.lon}°`);
  console.log(`     Distance: ${dist.toFixed(1)} mi  |  Bearing to beach: ${bearing.toFixed(0)}°`);
  console.log(`     H: ${b.H}m  |  T: ${b.T}s  |  Dir: ${b.directionFrom}° (from)`);
  console.log(`     Age: ${age} min old\n`);
});

console.log("💨 METAR (Nearest Aviation Station)");
console.log(`   Station: ${metar.station}`);
console.log(`   Wind: ${metar.windSpeedKts} kt from ${metar.windDir}°`);
console.log(`   Age: ${Math.round((Date.now() - new Date(metar.timestamp).getTime()) / 1000 / 60)} min\n`);

console.log("🌊 TIDE (Government Tide Station)");
console.log(`   Station: ${tide.station}`);
console.log(`   Level: ${tide.waterLevelM}m  |  Trend: ${tide.trend}\n`);

// ─────────────────────────────────────────────────────────────────────────────────
// RUN COMPOSITE ENGINE
// ─────────────────────────────────────────────────────────────────────────────────

const result = compositeSwell(buoys, GHOST_NODE, DEFAULTS);

console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
console.log("║                        COMPOSITE ENGINE OUTPUT                               ║");
console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

console.log("✅ COMPOSITE SWELL (Geometry Only)");
console.log(`   Direction (OF TRAVEL): ${result.composite.dirOfTravelDeg ?? "N/A"}°`);
console.log(
  `   Height proxy (H):      ${result.composite.H_m ?? "N/A"} m`
);
console.log(`   Period (T):            ${result.composite.T_s ?? "N/A"} s`);
console.log(
  `   Energy proxy:          ${result.composite.energyProxy ?? "N/A"}\n`
);

console.log("📈 COUNTS");
console.log(`   Total buoys:           ${result.counts.totalBuoys}`);
console.log(`   Used in composite:     ${result.counts.usedBuoys}`);
console.log(`   Rejected:              ${result.counts.rejectedBuoys}`);
if (result.flags.REJECTED_BUOY_IDS && result.flags.REJECTED_BUOY_IDS.length) {
  console.log(`   Rejected IDs:          ${result.flags.REJECTED_BUOY_IDS.join(", ")}\n`);
} else {
  console.log("");
}

console.log("🚩 FLAGS");
console.log(
  `   LIMITED (< 3 buoys):   ${result.flags.LIMITED ? "YES ⚠️" : "NO ✓"}`
);
console.log(
  `   VALID_TRIANGLE:        ${result.flags.VALID_TRIANGLE ? "YES ✓" : "NO"}`
);
console.log(
  `   STALE_DATA:            ${result.flags.STALE_DATA ? "YES ⚠️" : "NO ✓"}\n`
);

console.log("🔍 PER-BUOY DIAGNOSTICS");
(result.diagnostic?.perBuoy || []).forEach((d) => {
  const marker = d.accepted ? "✓" : "✗";
  console.log(
    `   ${marker} ${d.id.padEnd(20)} | Distance: ${String(d.distanceMiles).padEnd(6)} mi | Weight: ${String(d.weight ?? 0).padEnd(6)} | ${d.reason ?? ""}`
  );
  if (d.accepted) {
    console.log(
      `      H_decay: ${d.H_decayed}m  |  E: ${d.energy}  |  TF: ${d.transmissionFactor}`
    );
  }
});
console.log("");

// ─────────────────────────────────────────────────────────────────────────────────
// WIND vs BETA CHECK
// ─────────────────────────────────────────────────────────────────────────────────

const windCheck = windVsBeta(metar, BETA);
console.log("💨 WIND vs β ANALYSIS");
console.log(`   Wind direction: ${metar.windDir}°  |  β (shore-normal): ${BETA}°`);
console.log(
  `   Classification: ${windCheck.classification.toUpperCase()}  |  Angle: ${windCheck.angle}°`
);
const windEffect =
  windCheck.classification === "offshore"
    ? "Favorable (cleans up face)"
    : windCheck.classification === "cross"
      ? "Mixed (texture possible)"
      : "Unfavorable (onshore, choppy)";
console.log(`   Effect: ${windEffect}\n`);

// ─────────────────────────────────────────────────────────────────────────────────
// TIDE CHECK
// ─────────────────────────────────────────────────────────────────────────────────

const breakingDepth = breakingDepthProxy(result.composite.H_m);
console.log("🌊 TIDE & DEPTH ANALYSIS");
console.log(`   Water level: ${tide.waterLevelM}m  |  Trend: ${tide.trend}`);
console.log(
  `   Est. breaking depth: ${breakingDepth ?? "N/A"} m (using H × 0.78)`
);
const tideEffect =
  tide.trend === "rising"
    ? "Softening (depth increasing)"
    : "Sharpening (depth decreasing)";
console.log(`   Tide effect: ${tideEffect}\n`);

// ─────────────────────────────────────────────────────────────────────────────────
// PLAIN-LANGUAGE READOUT
// ─────────────────────────────────────────────────────────────────────────────────

console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
console.log("║                    PLAIN-LANGUAGE READOUT (No Prediction)                    ║");
console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");
console.log(result.readout);
console.log("");

// ─────────────────────────────────────────────────────────────────────────────────
// SUMMARY & VALIDATION
// ─────────────────────────────────────────────────────────────────────────────────

console.log("╔════════════════════════════════════════════════════════════════════════════════╗");
console.log("║                          VALIDATION SUMMARY                                  ║");
console.log("╚════════════════════════════════════════════════════════════════════════════════╝\n");

const isValid = result.counts.usedBuoys >= DEFAULTS.MIN_BUOYS_TO_RUN;
const isFullQuality = result.counts.usedBuoys >= DEFAULTS.MIN_BUOYS_FOR_FULL && !result.flags.LIMITED;

console.log(`Engine Status:        ${isValid ? "✓ VALID" : "✗ INSUFFICIENT DATA"}`);
console.log(
  `Quality:              ${isFullQuality ? "✓ FULL TRIANGLE" : "⚠️  LIMITED (but runnable)"}`
);
console.log(`Data freshness:       ${!result.flags.STALE_DATA ? "✓ CURRENT" : "⚠️  STALE"}`);
console.log(`Composite direction:  ${result.composite.dirOfTravelDeg !== undefined ? `✓ ${result.composite.dirOfTravelDeg}°` : "✗ UNAVAILABLE"}`);
console.log(`Composite height:     ${result.composite.H_m !== undefined ? `✓ ${result.composite.H_m}m` : "✗ UNAVAILABLE"}`);

console.log("\n🔬 GEOMETRY INTERPRETATION");
if (result.composite.dirOfTravelDeg !== undefined && result.composite.H_m !== undefined) {
  console.log(`   Swell direction: ${result.composite.dirOfTravelDeg}° (OF_TRAVEL)`);
  console.log(`   Swell height: ${result.composite.H_m}m significant wave height`);
  console.log(`   Period: ${result.composite.T_s}s (typical austral swell)`);
  console.log(`   Source: Tasman Sea / Southern Ocean austral swells`);
  console.log(`   Note: Engine reports GEOMETRY ONLY. No forecast. No score. Surfer decides.`);
} else {
  console.log(`   Insufficient accepted buoy data for composite direction.`);
  console.log(`   Review rejection reasons in diagnostic output above.`);
}

console.log(
  "\n✨ Test complete. Engine ready for Phase 2 adapters (fetch real NDBC/METAR/CO-OPS data)."
);
console.log(
  "                    and Phase 5 endpoint wrapper (HTTP + WebSocket delivery).\n"
);
