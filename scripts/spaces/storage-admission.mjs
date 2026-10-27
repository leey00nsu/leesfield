import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { randomBytes } from "node:crypto";

// Leemage counts presign + confirm together (20/min/project), including
// generated results. Pace actual SDK requests across all browser workers;
// browser upload pacing alone cannot account for server-side generations.
export async function startStorageAdmission() {
  const token = randomBytes(32).toString("hex"), shutdown = new AbortController();
  const buckets = {
    upload: { interval: 3_150, tail: Promise.resolve(), last: 0, count: 0, waitMs: 0 },
    api: { interval: 650, tail: Promise.resolve(), last: 0, count: 0, waitMs: 0 },
  };
  const server = createServer((request, response) => {
    const key = request.url?.slice(1), bucket = Object.hasOwn(buckets, key) ? buckets[key] : undefined;
    if (request.method !== "POST" || !bucket || request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(403).end(); return;
    }
    const queuedAt = Date.now();
    const admission = bucket.tail.then(async () => {
      await delay(Math.max(0, bucket.last + bucket.interval - Date.now()), undefined, { signal: shutdown.signal });
      if (request.aborted || response.destroyed) return;
      bucket.last = Date.now(); bucket.count += 1;
      bucket.waitMs += Date.now() - queuedAt;
      response.writeHead(204).end();
    });
    bucket.tail = admission.catch(() => { if (!response.destroyed) response.writeHead(503).end(); });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    snapshot: () => Object.fromEntries(Object.entries(buckets).map(([name, bucket]) => [name, { count: bucket.count, waitMs: bucket.waitMs, intervalMs: bucket.interval }])),
    async close() {
      shutdown.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      process.stdout.write(`Storage admission: ${buckets.upload.count} real upload API calls, ${buckets.api.count} other API calls\n`);
    },
  };
}
