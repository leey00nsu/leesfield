import type { OpenApiDocument } from "./openapi-types";

type ErrorExample = { value: { message: string; reason?: "OWNER_LIMIT" | "PROVIDER_LIMIT" | "GLOBAL_LIMIT" } };

const messages: Record<string, string> = {
  "400": "INVALID_REQUEST",
  "401": "API_KEY_REQUIRED",
  "403": "INVALID_API_KEY",
  "404": "NOT_FOUND",
  "408": "BODY_TIMEOUT",
  "409": "CONFLICT",
  "410": "MEDIA_UPLOAD_EXPIRED",
  "413": "BODY_TOO_LARGE",
  "415": "UNSUPPORTED_MEDIA_TYPE",
  "422": "MEDIA_MIME_MISMATCH",
  "429": "RATE_LIMITED",
  "499": "BODY_ABORTED",
  "500": "INTERNAL_SERVER_ERROR",
  "502": "HISTORY_FILE_DELETE_FAILED",
  "503": "RATE_LIMIT_UNAVAILABLE",
};

function examplesFor(path: string, method: string, status: string): Record<string, ErrorExample> {
  let message = messages[status];
  const spaces = path.startsWith("/api/external/spaces");
  const assets = path.startsWith("/api/external/assets");
  const presets = path.startsWith("/api/external/prompt-presets");
  const history = path.startsWith("/api/external/history");
  const admin = path.startsWith("/api/external/admin/models");
  const nodeSubmission = spaces && method === "post" && path.endsWith("/executions");
  const generationSubmission = method === "post" && path === "/api/external/generations";

  if (status === "400") {
    if (history) message = path.includes("{historyId}") ? "INVALID_QUERY" : "INVALID_HISTORY_CURSOR";
    if (admin) message = path.endsWith("/import") ? "IMPORT_FAILED"
      : path.endsWith("/modal-comfyui") ? "MODAL_CONTRACT_INVALID" : "INVALID_PAYLOAD";
  }
  if (status === "404") {
    if (history) message = "HISTORY_NOT_FOUND";
    else if (presets) message = "PRESET_NOT_FOUND";
    else if (assets) message = path.includes("{uploadId}") ? "MEDIA_UPLOAD_NOT_FOUND" : "MEDIA_ASSET_NOT_FOUND";
    else if ((path.includes("/models") && !admin) || generationSubmission) message = "MODEL_NOT_FOUND";
    else if (spaces) message = path.includes("{executionId}") ? "NODE_EXECUTION_NOT_FOUND"
      : path.includes("{nodeId}") ? "GRAPH_NODE_NOT_FOUND" : "GRAPH_NOT_FOUND";
  }
  if (status === "409") {
    if (history) message = "HISTORY_ACTIVE";
    else if (presets) message = "PRESET_CONFLICT";
    else if (assets) message = "MEDIA_UPLOAD_CONFIRMING";
    else if (generationSubmission) message = "IDEMPOTENCY_CONFLICT";
    else if (spaces) message = method === "patch" ? "ASSISTANT_SELECTION_CONFLICT"
      : method === "delete" ? "GRAPH_ACTIVE_EXECUTION" : "GRAPH_VERSION_CONFLICT";
  }
  const examples: Record<string, ErrorExample> = { [message]: { value: { message } } };
  if (status === "409" && nodeSubmission) {
    examples.IDEMPOTENCY_CONFLICT = { value: { message: "IDEMPOTENCY_CONFLICT" } };
    examples.NODE_GENERATION_ACTIVE = { value: { message: "NODE_GENERATION_ACTIVE" } };
  }
  // Only job submission can exhaust the admission queue. Read limits have no reason.
  if (nodeSubmission || generationSubmission) {
    const reasons = status === "429" ? ["OWNER_LIMIT", "PROVIDER_LIMIT"] as const
      : status === "503" ? ["GLOBAL_LIMIT"] as const : [];
    for (const reason of reasons) examples[reason] = { value: { message: "GENERATION_QUEUE_FULL", reason } };
  }
  return examples;
}

/** Explicit examples keep optional error fields out of unrelated responses. */
export function applyErrorResponseExamples(document: OpenApiDocument) {
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      for (const [status, response] of Object.entries(item[method]?.responses ?? {})) {
        if (!(status in messages) || "$ref" in response) continue;
        const media = response.content?.["application/json"];
        if (!media || media.example !== undefined || media.examples) continue;
        response.content = { ...response.content, "application/json": { ...media, examples: examplesFor(path, method, status) } };
      }
    }
  }
}
