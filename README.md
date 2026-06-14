# Hardened router proxy for breasksphere

This component provides a hardened proxy endpoint (/proxy) that only fetches from an explicit allowlist of government weather sources. It enforces:

- HTTPS-only
- Exact-hostname allowlist
- DNS resolution and private IP blocking (SSRF protection)
- Manual redirect handling with allowlist checks
- Timeouts, response size limits, retries, and a basic circuit breaker

Included hosts:
- www.ndbc.noaa.gov
- ndbc.noaa.gov
- www.aviationweather.gov
- aviationweather.gov

Build & run

1. Install deps: npm install
2. Build: npm run build
3. Run: npm start

Development: npm run dev

Notes
- The allowlist is in src/allowlist.ts — add or remove exact hostnames only.
- For production, run behind a reverse proxy and use a secrets manager for any credentials.
