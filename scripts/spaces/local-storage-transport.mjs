import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

export function localStorageConfiguration(env) {
  if (!env.SPACES_E2E_LOCAL_STORAGE) return null;
  const fixture = new URL(env.SPACES_E2E_LOCAL_STORAGE), origin = new URL(env.LEEMAGE_BASE_URL);
  if (env.NODE_ENV !== "development" || env.SPACES_E2E_ISOLATED !== "1" || fixture.protocol !== "http:" || fixture.hostname !== "127.0.0.1" || !fixture.port || fixture.pathname !== "/" || fixture.search || fixture.username || fixture.password || fixture.hash || origin.protocol !== "https:" || !/^storage-[a-f0-9-]+\.r2\.cloudflarestorage\.com$/.test(origin.hostname) || origin.port || origin.pathname !== "/" || origin.search || origin.username || origin.password || origin.hash || !/^[a-f0-9]{64}$/.test(env.SPACES_E2E_LOCAL_TOKEN ?? "")) throw new Error("Invalid isolated storage transport configuration");
  return { fixture, origin, token: env.SPACES_E2E_LOCAL_TOKEN };
}

export function installLocalStorageTransport(env = process.env) {
  const configuration = localStorageConfiguration(env);
  if (!configuration) return () => {};
  const { fixture, origin, token } = configuration;
  const original = { fetch: globalThis.fetch, request: https.request, lookup: dns.lookup };
  // Only this run's hostname is represented by a public-shaped documentation
  // address. Product URL/DNS/redirect/body validation still precedes the socket.
  dns.lookup = async (hostname, options) => hostname === origin.hostname
    ? (options?.all ? [{ address: "203.0.113.10", family: 4 }] : { address: "203.0.113.10", family: 4 })
    : original.lookup(hostname, options);
  globalThis.fetch = async (input, options) => {
    const target = new URL(input instanceof Request ? input.url : input);
    if (target.origin !== origin.origin) return original.fetch(input, options);
    const mapped = new URL(target.pathname + target.search, fixture);
    const request = new Request(input instanceof Request ? new Request(mapped, input) : mapped, options);
    request.headers.set("x-spaces-storage-token", token);
    return original.fetch(request);
  };
  https.request = function (options, callback) {
    if (options?.hostname !== origin.hostname) return original.request.apply(this, arguments);
    if (options.port && Number(options.port) !== 443) throw new Error("Invalid fixture storage port");
    return http.request({ ...options, protocol: "http:", hostname: fixture.hostname, port: Number(fixture.port), agent: false, lookup: undefined, servername: undefined,
      headers: { ...options.headers, "x-spaces-storage-token": token } }, callback);
  };
  syncBuiltinESMExports();
  return () => { globalThis.fetch = original.fetch; https.request = original.request; dns.lookup = original.lookup; syncBuiltinESMExports(); };
}
