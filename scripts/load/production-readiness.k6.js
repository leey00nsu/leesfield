import http from "k6/http";
import { check, fail } from "k6";
import { Rate, Trend } from "k6/metrics";

const profile = __ENV.LOAD_PROFILE === "full" ? "full" : "smoke";
const stageDuration = profile === "full" ? "2m" : "5s";
const recoveryDuration = profile === "full" ? "30s" : "5s";
const burstStart = profile === "full" ? "7m" : "40s";
const targetDuration = profile === "full" ? "5m" : "60s";

const serverErrors = new Rate("read_server_errors");
const authErrors = new Rate("read_auth_errors");
const throttled = new Rate("read_throttled");
const unavailable = new Rate("read_unavailable");
const unexpectedResponses = new Rate("read_unexpected_responses");
const requestLatency = new Trend("read_request_latency", true);

export const options = {
  scenarios: {
    read_ramp: {
      executor: "ramping-arrival-rate",
      startRate: 10,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { target: 10, duration: stageDuration },
        { target: 0, duration: recoveryDuration },
        { target: 50, duration: stageDuration },
        { target: 0, duration: recoveryDuration },
        { target: 100, duration: stageDuration },
      ],
      tags: { load_mode: "read-ramp" },
    },
    burst_500: {
      executor: "shared-iterations",
      vus: 500,
      iterations: 500,
      startTime: burstStart,
      maxDuration: targetDuration,
      tags: { load_mode: "burst-500" },
    },
  },
  thresholds: {
    read_server_errors: ["rate<0.01"],
    read_auth_errors: ["rate==0"],
    read_unexpected_responses: ["rate<0.01"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

function configuredPath(name, fallback) {
  const value = __ENV[name] || fallback;
  if (!value.startsWith("/") || /[\r\n]/.test(value)) {
    fail(`${name} must be a local HTTP path beginning with /`);
  }
  return value;
}

export function setup() {
  if (__ENV.LOAD_CONFIRM !== "YES") {
    fail("set LOAD_CONFIRM=YES after reviewing the target and test profile");
  }

  const rawTarget = __ENV.LOAD_TARGET || "http://127.0.0.1:3000";
  let parsedTarget;
  try {
    parsedTarget = new URL(rawTarget);
  } catch {
    fail("LOAD_TARGET must be an absolute http(s) URL");
  }
  if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
    fail("LOAD_TARGET must use http or https");
  }
  if (
    !["127.0.0.1", "localhost", "::1"].includes(parsedTarget.hostname) &&
    __ENV.LOAD_ALLOW_NONLOCAL !== "YES"
  ) {
    fail("non-loopback targets require LOAD_ALLOW_NONLOCAL=YES");
  }

  const cookie = __ENV.LOAD_AUTH_COOKIE || "";
  if (/[\r\n]/.test(cookie)) fail("LOAD_AUTH_COOKIE cannot contain line breaks");

  return {
    target: rawTarget.replace(/\/$/, ""),
    cookie,
    paths: [
      { name: "history", path: configuredPath("LOAD_HISTORY_PATH", "/api/history?limit=20") },
      { name: "model", path: configuredPath("LOAD_MODEL_PATH", "/api/models") },
      { name: "monitoring", path: configuredPath("LOAD_MONITORING_PATH", "/api/monitoring/stats") },
    ],
  };
}

export default function productionReadinessRequest(data) {
  const roll = Math.random();
  const endpoint = roll < 0.4 ? data.paths[0] : roll < 0.8 ? data.paths[1] : data.paths[2];
  const headers = { Accept: "application/json" };
  if (data.cookie) headers.Cookie = data.cookie;

  const response = http.get(`${data.target}${endpoint.path}`, {
    headers,
    tags: { load_endpoint: endpoint.name },
  });
  requestLatency.add(response.timings.duration);
  const expected = (response.status >= 200 && response.status < 300) || response.status === 429 || response.status === 503;
  serverErrors.add(response.status >= 500 && response.status !== 503);
  authErrors.add(response.status === 401 || response.status === 403);
  throttled.add(response.status === 429);
  unavailable.add(response.status === 503);
  unexpectedResponses.add(!expected);
  check(response, {
    "response is successful or explicitly admission-limited": () => expected,
  });
}
