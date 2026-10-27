import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";

export async function startAssistantProvider() {
  const token = randomBytes(32).toString("hex"), hostname = "assistant-" + randomUUID() + ".example.com";
  let calls = 0;
  const server = http.createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions" || request.headers["x-spaces-assistant-token"] !== token) {
      response.writeHead(403).end(); return;
    }
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (Buffer.byteLength(body) > 8192) { response.writeHead(413).end(); return; }
    }
    try {
      const payload = JSON.parse(body);
      if (!["fixture-a", "fixture-b"].includes(payload.model) || payload.stream !== false
        || payload.messages.length !== 1 || payload.messages[0].role !== "user" || typeof payload.messages[0].content !== "string") throw new Error("Invalid provider input");
      calls++;
      response.writeHead(200, { "content-type": "application/json", connection: "close" });
      response.end(JSON.stringify({ choices: [{ message: { content: "Assistant result: " + payload.messages[0].content } }] }));
    } catch { response.writeHead(400).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: "http://127.0.0.1:" + server.address().port, origin: "https://" + hostname, token,
    calls: () => calls, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}

export function assistantTransportConfiguration(env) {
  if (!env.SPACES_E2E_ASSISTANT_URL) return null;
  const local = new URL(env.SPACES_E2E_ASSISTANT_URL), origin = new URL(env.SPACES_E2E_ASSISTANT_ORIGIN);
  if (env.NODE_ENV !== "development" || env.SPACES_E2E_ISOLATED !== "1" || local.protocol !== "http:" || local.hostname !== "127.0.0.1"
    || !local.port || local.pathname !== "/" || local.search || local.hash || local.username || local.password
    || origin.protocol !== "https:" || !/^assistant-[a-f0-9-]+\.example\.com$/.test(origin.hostname)
    || origin.port || origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password
    || !/^[a-f0-9]{64}$/.test(env.SPACES_E2E_ASSISTANT_TOKEN ?? "")) throw new Error("Invalid isolated assistant transport");
  return { local, origin, token: env.SPACES_E2E_ASSISTANT_TOKEN };
}

export function installAssistantTransport(env = process.env) {
  const config = assistantTransportConfiguration(env);
  if (!config) return () => {};
  const original = { request: https.request, lookup: dns.lookup };
  dns.lookup = async (hostname, options) => hostname === config.origin.hostname
    ? options?.all ? [{ address: "203.0.113.10", family: 4 }] : { address: "203.0.113.10", family: 4 }
    : original.lookup(hostname, options);
  // Product URL/DNS/body/timeout checks still run before this exact socket.
  https.request = function (options, callback) {
    if (options?.hostname !== config.origin.hostname) return original.request.apply(this, arguments);
    if (options.method !== "POST" || options.path !== "/v1/chat/completions" || options.port && Number(options.port) !== 443)
      throw new Error("Unexpected isolated assistant request");
    return http.request({ ...options, protocol: "http:", hostname: config.local.hostname, port: Number(config.local.port),
      agent: false, lookup: undefined, servername: undefined, headers: { ...options.headers, "x-spaces-assistant-token": config.token } }, callback);
  };
  syncBuiltinESMExports();
  return () => { https.request = original.request; dns.lookup = original.lookup; syncBuiltinESMExports(); };
}
