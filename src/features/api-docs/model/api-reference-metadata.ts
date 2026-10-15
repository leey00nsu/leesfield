import type { OpenApiDocument, OpenApiSchema } from "./openapi-types";
import { externalOperationPermissions } from "@/shared/api/platform-permissions";
import { generationBodyLimitBytes, bodyReadTimeoutMs, maxExternalFiles, maxExternalFileBytes, maxExternalTotalFileBytes } from "@/shared/api/request-limits";

const defaultActions: Record<string, string> = {
  "GET /api/external/history": "List generation history.",
  "GET /api/external/history/status": "Count active generation jobs.",
  "GET /api/external/history/{historyId}": "Get a job's inputs and results.",
  "DELETE /api/external/history/{historyId}": "Delete a history record and its files.",
  "GET /api/external/prompt-presets": "List prompt presets.",
  "GET /api/external/prompt-presets/{key}": "Get a preset's prompt and suggested settings.",
  "POST /api/external/prompt-presets": "Create a prompt preset.",
  "PATCH /api/external/prompt-presets/{key}": "Update a preset or enable or disable it.",
  "DELETE /api/external/prompt-presets/{key}": "Delete a prompt preset.",
  "POST /api/external/prompt-presets/{key}/restore": "Restore a built-in preset's name and prompt.",
  "GET /api/external/monitoring/overview": "Get request counts, success rates and processing times.",
  "GET /api/external/monitoring/stats": "Get request and error statistics over time.",
  "GET /api/external/monitoring/requests": "List API requests.",
  "GET /api/external/monitoring/requests/detail": "Get a request's inputs and results.",
  "GET /api/external/monitoring/top": "Compare usage, errors and processing times by model or API key.",
  "GET /api/external/monitoring/api-keys": "List API keys for filtering request metrics.",
  "GET /api/external/admin/models": "List registered models.",
  "POST /api/external/admin/models": "Register a model.",
  "PATCH /api/external/admin/models/{modelKey}": "Update model settings or enable or disable a model.",
  "DELETE /api/external/admin/models/{modelKey}": "Delete a registered model.",
  "POST /api/external/admin/models/import": "Import a model draft from Hugging Face.",
  "GET /api/external/admin/models/modal-comfyui": "List image and video workflows from the connected Modal service.",
  "POST /api/external/admin/models/modal-comfyui": "Import a Modal workflow as a model draft.",
  "POST /api/external/generations": "Start an image, video or audio generation job.",
  "GET /api/external/generations/{requestId}": "Get a generation job's status and results.",
  "GET /api/external/models": "List available image, video and audio models.",
  "GET /api/external/models/{modelId}/schema": "Get a model's input schema and file requirements."
};
export interface ApiReferenceTranslations {
  parameters?: Record<string, string>;
  notes?: Record<string, string>;
}
export function applyApiReferenceMetadata(document: OpenApiDocument, translations?: ApiReferenceTranslations) {
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "patch", "delete"] as const) {
      const operation = item[method];
      if (!operation) continue;
      const key = method.toUpperCase() + " " + path;
      operation.description = operation.description?.split(/\n\s*\n/)[0] ?? defaultActions[key];
      // Default registry prose is replaced too; localized prose already starts with the action.
      if (!operation.description?.includes("\n") && !translations?.parameters) operation.description = defaultActions[key] ?? operation.description;
      operation["x-required-permissions"] = [externalOperationPermissions[key]];
      operation["x-resource-scope"] = path.startsWith("/api/external/admin/") ? "global"
        : path === "/api/external/generations/{requestId}" ? "account-and-api-key"
        : path.startsWith("/api/external/models") ? "catalog" : "owner";
      const note = translations?.notes?.[key];
      operation["x-usage-notes"] = note ? note.split(/\n\s*\n/) : [];
      if (path === "/api/external/generations" && method === "post") {
        operation["x-conditional-permissions"] = [{ field: "promptPreset", permission: "presets:read", condition: "present" }];
        operation["x-request-limits"] = {
          bodyBytes: generationBodyLimitBytes, bodyTimeoutMs: bodyReadTimeoutMs,
          files: maxExternalFiles, fileBytes: maxExternalFileBytes, totalFileBytes: maxExternalTotalFileBytes,
        };
        if (!note) operation["x-usage-notes"] = ["Use the model input schema to build dynamicParams."];
      }
      if (path === "/api/external/generations/{requestId}" && !note)
        operation["x-usage-notes"] = ["Use the same account and API key that created the job."];
      if (path.startsWith("/api/external/monitoring/")) {
        operation["x-conditional-permissions"] = [{ field: "scope", permission: "monitoring:read-all", condition: "all" }];
        if (operation.parameters?.some((p) => !("$ref" in p) && p.name === "from"))
          operation["x-query-limits"] = { rangeDays: 31, defaultDays: path.endsWith("/stats") ? 30 : 7 };
      }
      if (operation.requestBody && !("$ref" in operation.requestBody) && path !== "/api/external/generations")
        operation["x-request-limits"] = { bodyBytes: path.startsWith("/api/external/prompt-presets") ? 96 * 1024 : path.endsWith("/import") ? 8 * 1024 * 1024 : 1024 * 1024 };
      for (const parameter of operation.parameters ?? []) {
        if ("$ref" in parameter) continue;
        if (translations?.parameters?.[parameter.name]) parameter.description = translations.parameters[parameter.name];
        const schema = parameter.schema as OpenApiSchema | undefined;
        if (!schema) continue;
        if (parameter.in === "header" && parameter.name.includes("Idempotency")) {
          Object.assign(schema, { minLength: 1, maxLength: 200, pattern: "^[!-~]+$", "x-normalization": "trim", "x-invalid-behavior": "ignored" });
        }
        if (parameter.in === "query") {
          const history = path.startsWith("/api/external/history");
          const monitoring = path.startsWith("/api/external/monitoring/");
          if ((history || monitoring) && (parameter.name === "limit" || parameter.name === "offset")) {
            parameter.schema = {
              type: "integer", minimum: parameter.name === "limit" ? 1 : 0,
              maximum: parameter.name === "limit" ? history ? 100 : 200 : 1000,
              default: parameter.name === "offset" ? 0 : history ? 24 : path.endsWith("/top") ? 5 : 50,
              "x-normalization": "parse-integer-clamp",
            };
          }
          if ((history || monitoring) && ["query", "q", "model", "prompt"].includes(parameter.name))
            Object.assign(schema, { maxLength: 200, "x-normalization": "trim-truncate" });
          if (parameter.name === "scope") schema.default = "owner";
          if (parameter.name === "hidden" && history) parameter.schema = { type: "boolean", default: false, "x-normalization": "boolean-aliases" };
          if (parameter.name === "includeTotal") parameter.schema = { type: "boolean", default: true, "x-normalization": "boolean-aliases" };
          if (parameter.name === "includeInactive") schema.default = path.includes("/admin/") ? "true" : "false";
          if (parameter.name === "type" && (history || monitoring) && schema.enum?.includes("all")) schema.default = "all";
          if (parameter.name === "sort" && history) schema.default = "date_desc";
          if (parameter.name === "metric") schema.default = "requests";
          if (parameter.name === "tz") schema.default = "UTC";
        }
      }
      if (operation.requestBody && !("$ref" in operation.requestBody)) {
        for (const media of Object.values(operation.requestBody.content)) {
          const schema = media.schema;
          if (!schema || "$ref" in schema) continue;
          for (const [name, property] of Object.entries(schema.properties ?? {})) {
            if ("$ref" in property) continue;
            const label = name === "model" ? "modelId" : name;
            if (translations?.parameters?.[label]) property.description = translations.parameters[label];
          }
        }
      }
    }
  }
}
