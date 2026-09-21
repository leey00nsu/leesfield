import { createServer } from "node:http";
import { performance } from "node:perf_hooks";
import { once } from "node:events";

const DEFAULT_DURATION_MS = 2_000;
const BURST_REQUESTS = 500;
const rates = [10, 50, 100];

function boundedDuration() {
  const raw = Number(process.env.LOAD_STUB_DURATION_MS ?? DEFAULT_DURATION_MS);
  if (!Number.isInteger(raw) || raw < 100 || raw > 30_000) {
    throw new Error("LOAD_STUB_DURATION_MS must be an integer between 100 and 30000");
  }
  return raw;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1);
  return Number(ordered[index].toFixed(2));
}

function summarize(name, startedAt, results) {
  const durations = results.map((result) => result.durationMs);
  const failures = results.filter((result) => !result.ok).length;
  return {
    name,
    requests: results.length,
    failures,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
    achievedRps: Number((results.length / Math.max(0.001, (performance.now() - startedAt) / 1000)).toFixed(2)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    maxMs: durations.length > 0 ? Number(Math.max(...durations).toFixed(2)) : null,
  };
}

async function request(url) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url);
    await response.text();
    return {
      ok: response.status === 200,
      durationMs: performance.now() - startedAt,
    };
  } catch {
    return {
      ok: false,
      durationMs: performance.now() - startedAt,
    };
  }
}

async function runRate(url, rate, durationMs) {
  const startedAt = performance.now();
  const deadline = startedAt + durationMs;
  const intervalMs = 1_000 / rate;
  let nextAt = startedAt;
  const requests = [];

  while (performance.now() < deadline) {
    const delay = nextAt - performance.now();
    if (delay > 0) await wait(delay);
    requests.push(request(url));
    nextAt += intervalMs;
  }

  return summarize(`${rate}rps`, startedAt, await Promise.all(requests));
}

async function runBurst(url) {
  const startedAt = performance.now();
  const requests = Array.from({ length: BURST_REQUESTS }, () => request(url));
  return summarize("burst-500", startedAt, await Promise.all(requests));
}

async function main() {
  const durationMs = boundedDuration();
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      return;
    }
    response.writeHead(404);
    response.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub server did not expose a local port");

  const url = `http://127.0.0.1:${address.port}/health`;
  try {
    const scenarios = [];
    for (const rate of rates) scenarios.push(await runRate(url, rate, durationMs));
    scenarios.push(await runBurst(url));
    const report = {
      target: "loopback-stub",
      durationMs,
      burstRequests: BURST_REQUESTS,
      scenarios,
    };
    console.log(JSON.stringify(report));
    if (scenarios.some((scenario) => scenario.failures > 0)) {
      throw new Error("loopback stub smoke recorded failed requests");
    }
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(`[load-stub] ${error instanceof Error ? error.message : "failed"}`);
  process.exitCode = 1;
});
