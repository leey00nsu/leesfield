// Browser, server and operational scripts share this sink. Only diagnostics
// selected here may cross the logging boundary; never serialize caller objects.
const fields = new Set([
  "requestId", "jobId", "method", "route", "status", "durationMs", "errorType",
  "errorCode", "provider", "modelKey", "operation", "phase", "kind", "outcome",
  "worker", "state", "pending", "processing", "oldestPendingAgeSeconds",
  "failedCleanup", "attempt",
]);
const identifier = /^[A-Za-z0-9_$./:-]{1,96}$/;
const codePattern = /^[A-Z][A-Z0-9_]{1,63}$/;
const messages = new Set([
  "fetch failed", "Failed to fetch", "NetworkError when attempting to fetch resource.",
  "Maximum call stack size exceeded", "The operation was aborted.",
  "This operation was aborted", "The operation was aborted due to timeout",
]);

function read(value, key) {
  try { return value?.[key]; } catch { return undefined; }
}
function safeValue(key, value) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  if (key === "route") return /^\/[A-Za-z0-9_./:[\]-]{0,96}$/.test(value) ? value : "unknown";
  if (key === "method") return /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|UNKNOWN|OTHER)$/.test(value) ? value : "OTHER";
  return identifier.test(value) ? value : "redacted";
}
function safeFields(input) {
  const result = {};
  for (const key of fields) {
    const value = safeValue(key, read(input, key));
    if (value !== undefined) result[key] = value;
  }
  return result;
}
function frames(stack) {
  if (typeof stack !== "string") return [];
  // Ignore the message/header and eval/URL locations. Retain only source paths
  // rooted in known application/dependency directories, never home directories.
  return stack.slice(0, 16384).split("\n").slice(1, 25).flatMap(line => {
    if (/https?:|data:|eval|[?&#]/i.test(line)) return [];
    const match = line.match(/(?:^|[/\\(])((?:src|scripts|node_modules|\.next)\/[A-Za-z0-9_./@+-]+:\d{1,8}:\d{1,8})\)?$/);
    return match ? [match[1]] : [];
  }).slice(0, 8);
}
export function serializeError(error) {
  const seen = new WeakSet();
  let remaining = 12;
  function visit(value, depth) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) {
      return { type: typeof value, message: "[redacted]" };
    }
    if (seen.has(value)) return { type: "CircularError" };
    if (depth > 3 || remaining-- <= 0) return { type: "TruncatedError" };
    seen.add(value);
    const name = read(value, "name");
    const type = typeof name === "string" && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}Error$/.test(name)
      ? name : name === "Error" ? "Error" : "UnknownError";
    const message = read(value, "message");
    const candidate = typeof message === "string" ? message.slice(0, 128).split(":", 1)[0] : "";
    const rawCode = read(value, "code");
    const code = typeof rawCode === "string" && codePattern.test(rawCode) ? rawCode
      : codePattern.test(candidate) ? candidate : undefined;
    const result = {
      type,
      ...(code ? { code } : {}),
      message: code ?? (typeof message === "string" && messages.has(message) ? message : "[redacted]"),
      frames: frames(read(value, "stack")),
    };
    const cause = read(value, "cause");
    if (cause !== undefined) result.cause = visit(cause, depth + 1);
    const errors = read(value, "errors");
    if (Array.isArray(errors)) result.errors = errors.slice(0, 4).map(item => visit(item, depth + 1));
    const issues = read(value, "issues");
    if (Array.isArray(issues)) {
      result.issues = issues.slice(0, 8).map(issue => {
        const issueCode = read(issue, "code");
        const path = read(issue, "path");
        return {
          code: typeof issueCode === "string" && /^[a-z_]{1,48}$/.test(issueCode) ? issueCode : "unknown",
          path: Array.isArray(path) ? path.slice(0, 8).map(part =>
            typeof part === "number" && Number.isInteger(part) ? part :
              typeof part === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,47}$/.test(part) ? part : "[redacted]") : [],
        };
      });
    }
    return result;
  }
  try { return visit(error, 0); } catch { return { type: "UnserializableError" }; }
}

export function createLogger(context = () => ({})) {
  function emit(level, event, input, error, hasError = false) {
    try {
      const diagnostic = hasError ? serializeError(error) : undefined;
      const line = JSON.stringify({
        timestamp: new Date().toISOString(), level,
        event: typeof event === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(event) ? event : "unknown",
        ...safeFields(context()), ...safeFields(input),
        ...(diagnostic ? { errorType: diagnostic.type, error: diagnostic } : {}),
      });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    } catch {
      // Logging must never replace the original error or fail successful work.
    }
  }
  return {
    info: (event, input = {}) => emit("info", event, input),
    warn: (event, input = {}) => emit("warn", event, input),
    error: (event, error, input = {}) => emit("error", event, input, error, true),
    log: (level, event, input = {}) => emit(level, event, input),
  };
}
export const logger = createLogger();
