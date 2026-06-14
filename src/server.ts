import express, { Request, Response } from "express";
import { URL } from "url";
import dns from "dns/promises";
import net from "net";
import { ALLOWED_HOSTNAMES } from "./allowlist";

// Configuration
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_RETRIES = 2;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60_000;

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function isCircuitOpen() {
  return Date.now() < circuitOpenUntil;
}
function recordFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_RESET_MS;
  }
}
function recordSuccess() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function isPrivateIp(ip: string) {
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] >= 224) return true;
  }
  if (net.isIP(ip) === 6) {
    if (ip.startsWith("fe80") || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  }
  return false;
}

async function resolveAndCheckIP(hostname: string) {
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) throw new Error("No DNS records");
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error(`Resolved IP ${r.address} is private/reserved`);
      }
    }
    return records.map(r => r.address);
  } catch (err) {
    throw new Error(`DNS lookup failed for ${hostname}: ${(err as Error).message}`);
  }
}

function domainAllowed(hostname: string): boolean {
  const cleaned = hostname.toLowerCase();
  for (const p of ALLOWED_HOSTNAMES) {
    if (cleaned === p.toLowerCase()) return true;
  }
  return false;
}

async function safeFetchRaw(urlStr: string, init: RequestInit = {}): Promise<Response> {
  if (isCircuitOpen()) throw new Error("Circuit breaker open - skipping fetch");

  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "https:") throw new Error("Only HTTPS is allowed");

  if (!domainAllowed(url.hostname)) throw new Error(`Hostname ${url.hostname} is not on the allowlist`);

  await resolveAndCheckIP(url.hostname);

  let redirectCount = 0;
  let currentUrl = url.toString();

  const attemptFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(currentUrl, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "breasksphere-router/1.0",
          ...(init.headers || {}),
        },
      });

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) throw new Error("Too many redirects");
        const location = res.headers.get("location")!;
        const next = new URL(location, currentUrl).toString();
        const nextHost = new URL(next).hostname;

        if (!domainAllowed(nextHost)) throw new Error(`Redirect to disallowed host: ${nextHost}`);

        await resolveAndCheckIP(nextHost);

        currentUrl = next;
        return attemptFetch();
      }

      if (res.status >= 500) throw new Error(`Upstream server error ${res.status}`);

      const cl = res.headers.get("content-length");
      if (cl && Number(cl) > MAX_RESPONSE_BYTES) throw new Error("Response too large");

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json") && !ct.includes("html") && !ct.includes("xml") && !ct.includes("text")) {
        throw new Error(`Unexpected content-type: ${ct}`);
      }

      clearTimeout(timeout);
      return res as unknown as Response;
    } finally {
      clearTimeout(timeout);
    }
  };

  let attempt = 0;
  while (true) {
    try {
      const response = await attemptFetch();
      recordSuccess();
      return response;
    } catch (err) {
      attempt++;
      const msg = (err as Error).message || String(err);
      const isTransient = msg.includes("Upstream server error") || msg.includes("network") || msg.includes("timed out") || msg.includes("aborted");
      if (attempt > MAX_RETRIES || !isTransient) {
        recordFailure();
        throw err;
      }
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
      continue;
    }
  }
}

const app = express();

app.get("/proxy", async (req: Request, res: Response) => {
  const url = (req.query.url as string) || "";
  if (!url) return res.status(400).json({ error: "Missing url parameter" });

  try {
    const upstreamRes = await safeFetchRaw(url, { method: "GET" });

    const reader = (upstreamRes as any).body?.getReader();
    if (!reader) return res.status(500).json({ error: "No body stream" });

    let bytes = 0;
    res.status((upstreamRes as any).status || 200);
    (upstreamRes as any).headers.forEach((v: string, k: string) => {
      if (k.toLowerCase() === "set-cookie") return;
      res.setHeader(k, v);
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        return res.status(413).json({ error: "Upstream response too large" });
      }
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    const message = (err as Error).message || String(err);
    return res.status(502).json({ error: "Fetch failed", detail: message });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, circuitOpen: isCircuitOpen(), failures: consecutiveFailures });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Hardened router listening on ${PORT}`);
});
