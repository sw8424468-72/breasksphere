# SurfCaddy

![SurfCaddy logo](assets/surfcaddy-logo.svg)

SurfCaddy is a map-first surf reconnaissance field console. The map is the working surface; Ghost Node scans gather live observations around a coordinate, apply source-zone and travel-vector geometry, and return a field packet without inventing a surf score.

> **Source of truth:** this repository is the active SurfCaddy codebase. Keep active development here so old HTML experiments and Drive prototypes do not silently replace the current build.

## Current field console

Run the server and open `/surfcaddy`.

Implemented in the current build:

- Full-screen Leaflet world map.
- Movable center Ghost Node; **SCAN** evaluates the current map center.
- Live NDBC active-station discovery inside a 250-mile source zone.
- Live NDBC wave height / period / mean wave-direction adapter.
- Worldwide AviationWeather METAR lookup for local wind observations.
- NOAA CO-OPS water-level lookup where a station is within range.
- Offshore vector-consensus engine that keeps `direction FROM` separate from travel direction.
- No public surf score and no fabricated breaking-wave height.
- Buoy markers and source trace.
- NOAA MRMS radar overlay where that service has coverage.
- GPS-follow control.
- Device-heading readout while the map remains true-north-up.
- Field packet and recent scan timeline.
- HTTP + WebSocket Ghost Node delivery.

## Deliberately not faked

The global NOAA/NCEP GFS-Wave source is indexed, but a production GRIB point-sampling adapter is **not yet wired into the scan result**. Until that adapter is implemented and verified, the console does not label model values as live GFS-Wave values.

Likewise, the offshore composite is not a nearshore breaking-wave prediction. Bathymetry, beach tangent/orientation, bar/shoal geometry, refraction, and the beach-zone handoff belong in the nearshore stage rather than being hidden inside an arbitrary multiplier.

## Data flow

`PROSPECT → MEASURE → EVALUATE → FIT → REPORT`

1. **PROSPECT** — index approved sources around the Ghost Node.
2. **MEASURE** — fetch live observations with timestamps and positions.
3. **EVALUATE** — reject stale, out-of-zone, missing, or geometrically incompatible vectors.
4. **FIT** — form an offshore consensus from accepted observations.
5. **REPORT** — send the field packet, source trace, diagnostics, and flags to the map.

## Run

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/surfcaddy
```

Useful endpoints:

- `GET /health`
- `POST /api/ghost-node/drop`
- `GET /api/ghost-node/:nodeId`
- `GET /api/ghost-node/list`
- `WS /ws/ghost-node/:nodeId`

The old hand-entry calculator remains available under `/legacy/` for reference; it is no longer the operational home screen.

## Source boundaries

Current adapters use government/official observation services:

- NOAA National Data Buoy Center (NDBC)
- NOAA CO-OPS Tides & Currents
- AviationWeather.gov METAR
- NOAA/NCEP GFS-Wave is indexed for the model-adapter stage

Do not substitute third-party surf-report values into the engine and present them as SurfCaddy measurements.

## License

MIT © 2025–2026 Legend
