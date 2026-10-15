import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { getModelRegistrationDocumentationSchema } from "./model-registration-schema";
import { applyApiReferenceMetadata, type ApiReferenceTranslations } from "./api-reference-metadata";
import type { SecurityRequirementObject } from "openapi3-ts/oas31";
import { externalHistoryQuerySchema, externalHistorySelectorSchema, externalHistoryResponseSchema, externalHistoryStatusSchema, externalHistoryDetailSchema } from "@/shared/api/platform-contract";
import { promptPresetSchema, promptPresetKeySchema, promptPresetModalitySchema, createPromptPresetSchema, updatePromptPresetSchema, promptPresetRevisionSchema } from "@/shared/prompt-presets/prompt-preset-contract";
import { externalMonitoringOperationQueries, externalMonitoringOverviewSchema, externalMonitoringStatsSchema, externalMonitoringRequestsSchema, externalMonitoringTopSchema, externalMonitoringApiKeysSchema, externalMonitoringDetailSchema } from "@/shared/api/platform-monitoring-contract";
import { externalAdminModelQuerySchema, externalAdminModelListSchema, externalAdminModelSchema, externalAdminModelUpdateSchema, externalAdminHfImportSchema, externalAdminHfImportResponseSchema, externalAdminModalImportSchema, externalAdminModalListSchema, externalAdminModalImportResponseSchema } from "@/shared/api/platform-admin-contract";
import {
  apiKeyHeader,
  apiPaths,
  errorResponseSchema,
  externalGenerationRequestSchema,
  externalGenerationMultipartSchema,
  externalGenerationResponseSchema,
  externalGenerationStatusSchema,
  externalModelsResponseSchema,
  externalModelInputResponseSchema,
  modelQuerySchema,
  externalApiVersion,
  generationBodyLimitBytes,
  bodyReadTimeoutMs,
  maxExternalFileBytes,
  maxExternalFiles,
  maxExternalTotalFileBytes,
  maxIdempotencyKeyLength,
} from "@/shared/api/external-contract";

export type OpenApiTranslations = ApiReferenceTranslations & {
  infoDescription?: string;
  tags?: { generations?: string; models?: string; history?: string; promptPresets?: string; monitoring?: string; modelAdministration?: string };
  platform?: Record<string, string>;
  paths?: {
    generation?: string;
    status?: string;
    models?: string;
    modelSchema?: string;
  };
};

/** Public protocol only. Never load instance catalog data into this document. */
export function getOpenApiDocument(translations?: OpenApiTranslations) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    in: "header",
    name: apiKeyHeader,
  });
  registry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "API key token. An explicit X-API-Key takes precedence, even if empty or invalid.",
  });
  const security: SecurityRequirementObject[] = [{ ApiKeyAuth: [] }, { BearerAuth: [] }];
  const responseHeaders = {
    "X-Request-ID": {
      description: "HTTP request identifier. May be absent for a pre-authentication INGRESS_BUSY response.",
      schema: { type: "string" as const },
    },
    "Cache-Control": { schema: { type: "string" as const, const: "no-store" } },
  };
  const retryHeaders = {
    ...responseHeaders,
    "Retry-After": {
      description: "Seconds before retrying (rate limit or queue rejection). A pre-authentication INGRESS_BUSY response has no Retry-After.",
      schema: { type: "integer" as const, minimum: 1 },
    },
  };
  const json = (schema: z.ZodType) => ({ "application/json": { schema } });
  const error = (description: string) => ({
    description,
    headers: responseHeaders,
    content: json(errorResponseSchema),
  });
  const authErrors = {
    401: error("API key required"),
    403: error("Invalid or revoked API key"),
    500: error("Unexpected server error"),
  };
  registry.registerPath({
    method: "post",
    path: apiPaths.generations,
    tags: ["Generations"],
    security,
    description:
      translations?.paths?.generation ??
      "Create an image, video or audio job. Query the authenticated model list and its input schema first. All model inputs belong in dynamicParams.",
    request: {
      headers: z.object({
        "Idempotency-Key": z.string().optional().describe(
          `Optional retry key scoped to the API key: trim surrounding whitespace, then 1–${maxIdempotencyKeyLength} visible ASCII characters. Invalid/empty keys are ignored. The same API key, retry key and normalized payload reuse the job; a different payload returns 409. Use a new retry key for a new job.`,
        ),
        "X-Idempotency-Key": z.string().optional().describe(
          "Alias used only when Idempotency-Key is absent. An empty/invalid primary header does not fall back to this alias.",
        ),
      }),
      body: {
        required: true,
        description: `JSON or multipart: at most ${generationBodyLimitBytes} bytes including the entire envelope; read timeout ${bodyReadTimeoutMs} ms. Multipart: up to ${maxExternalFiles} files, ${maxExternalFileBytes} bytes each, total file bytes at most ${maxExternalTotalFileBytes}. Follow model files.maxItems; file parts must be model-declared and must not duplicate dynamicParams values.`,
        content: {
          "application/json": { schema: externalGenerationRequestSchema },
          "multipart/form-data": { schema: externalGenerationMultipartSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Job accepted",
        headers: responseHeaders,
        content: json(externalGenerationResponseSchema),
      },
      ...authErrors,
      400: error("Invalid model input, PRESET_INACTIVE or PRESET_MODALITY_MISMATCH"),
      403: error("Invalid/revoked API key, or PLATFORM_PERMISSION_REQUIRED for a promptPreset reference"),
      404: error("Model unavailable or PRESET_NOT_FOUND"),
      408: error("BODY_TIMEOUT: body read exceeded 30 seconds"),
      409: error("IDEMPOTENCY_CONFLICT: same key with a different normalized payload, or PRESET_CONFLICT: stale preset revision"),
      413: error("Body, file size or file count exceeds upload limit"),
      415: error("Use application/json or multipart/form-data"),
      429: { ...error("Rate limit or owner/provider queue limit; honor Retry-After"), headers: retryHeaders },
      499: error("BODY_ABORTED: caller aborted body upload; response delivery is not guaranteed"),
      500: error("Generation submission failed"),
      503: { ...error("GLOBAL_LIMIT or service temporarily unavailable. Retry-After and X-Request-ID may be absent."), headers: retryHeaders },
    },
  });
  registry.registerPath({
    method: "get",
    path: apiPaths.generations + "/{requestId}",
    tags: ["Generations"],
    security,
    description:
      translations?.paths?.status ??
      "Fetch job status and results submitted by this owner with this same API key. A different key belonging to the same owner cannot read the job.",
    request: { params: z.object({ requestId: z.string().min(1) }) },
    responses: {
      200: {
        description: "Job status and media-specific result",
        headers: responseHeaders,
        content: json(externalGenerationStatusSchema),
      },
      ...authErrors,
      404: error("Job not found"),
    },
  });
  registry.registerPath({
    method: "get",
    path: apiPaths.models,
    tags: ["Models"],
    security,
    description:
      translations?.paths?.models ??
      "List active image/video/audio models available to the authenticated caller. Assistant LLMs and instance catalog data are not included in this public document.",
    request: { query: modelQuerySchema },
    responses: {
      200: {
        description: "Model summaries",
        headers: responseHeaders,
        content: json(externalModelsResponseSchema),
      },
      ...authErrors,
      400: error("Invalid query"),
    },
  });
  registry.registerPath({
    method: "get",
    path: apiPaths.modelSchema,
    tags: ["Models"],
    security,
    description:
      translations?.paths?.modelSchema ??
      "Fetch the selected model's dynamicParams JSON Schema and file fields. Send files as URL/data URL values, or file:<parameterName> multipart parts.",
    request: { params: z.object({ modelId: z.string().min(1) }) },
    responses: {
      200: {
        description: "Model input schema",
        headers: responseHeaders,
        content: json(externalModelInputResponseSchema),
      },
      ...authErrors,
      404: error("Model unavailable"),
    },
  });
  const platformErrors = {
    ...authErrors,
    403: error("Invalid/revoked key or PLATFORM_PERMISSION_REQUIRED"),
    429: { ...error("Owner read limit"), headers: retryHeaders },
    503: { ...error("Service temporarily unavailable"), headers: retryHeaders },
  };
  for (const [path, schema, description] of [
    ["/api/external/history", externalHistoryResponseSchema, "Owner history including UI/API generation and completed edits. platform:read or higher. Cursor filters must match; limit <=100, offset <=1000, search <=200. includeTotal=false avoids counts. Visible history is the default; hidden=true lists only hidden records."],
    ["/api/external/history/status", externalHistoryStatusSchema, "Active owner generation count. platform:read or higher. Hidden records are excluded by default."],
  ] as const) registry.registerPath({
    method: "get", path, tags: ["History"], security, description,
    request: { query: externalHistoryQuerySchema },
    responses: { 200: { description: "Owner history", headers: responseHeaders, content: json(schema) }, ...platformErrors, 400: error("INVALID_HISTORY_CURSOR") },
  });
  registry.registerPath({
    method: "get", path: "/api/external/history/{historyId}", tags: ["History"], security,
    description: "Owner JSON detail, stored input settings, input/output URLs and warnings. platform:read or higher. Unlike generation status, includes UI jobs and jobs submitted with other keys of this owner.",
    request: { params: z.object({ historyId: z.string().min(1) }), query: externalHistorySelectorSchema },
    responses: { 200: { description: "History detail", headers: responseHeaders, content: json(externalHistoryDetailSchema) }, ...platformErrors, 400: error("INVALID_QUERY"), 404: error("HISTORY_NOT_FOUND") },
  });
  registry.registerPath({
    method: "delete", path: "/api/external/history/{historyId}", tags: ["History"], security,
    description: "Delete owner history with platform:write or higher. pending/processing/uploading and files used by other generations, Spaces or edits are protected with 409 HISTORY_ACTIVE. Unlike UI hide/restore, this permanently deletes history and unused files. File cleanup failure preserves the record.",
    request: { params: z.object({ historyId: z.string().min(1) }), query: externalHistorySelectorSchema },
    responses: { 204: { description: "Deleted", headers: responseHeaders }, ...platformErrors, 400: error("INVALID_QUERY"), 404: error("HISTORY_NOT_FOUND"), 409: error("HISTORY_ACTIVE"), 502: error("HISTORY_FILE_DELETE_FAILED") },
  });
  const presetResponses = {
    ...platformErrors, 400: error("Invalid preset input or query"), 404: error("PRESET_NOT_FOUND"),
    409: error("PRESET_CONFLICT or PRESET_LIMIT_REACHED"), 408: error("BODY_TIMEOUT"),
    413: error("Preset body exceeds 98304 bytes"), 415: error("Use application/json"), 499: error("BODY_ABORTED"),
  };
  const presetParams = z.object({ key: promptPresetKeySchema });
  const presetItem = z.object({ item: promptPresetSchema });
  registry.registerPath({
    method: "get", path: "/api/external/prompt-presets", tags: ["Prompt presets"], security,
    description: "Owner preset catalog including builtins. platform:read or higher.",
    request: { query: z.object({ modality: promptPresetModalitySchema.optional(), includeInactive: z.enum(["true", "false"]).optional() }) },
    responses: { 200: { description: "Presets", headers: responseHeaders, content: json(z.object({ items: z.array(promptPresetSchema) })) }, ...presetResponses },
  });
  registry.registerPath({
    method: "get", path: "/api/external/prompt-presets/{key}", tags: ["Prompt presets"], security,
    description: "Read owner preset before applying its prompt and recommendations to model input. platform:read or higher.",
    request: { params: presetParams },
    responses: { 200: { description: "Preset", headers: responseHeaders, content: json(presetItem) }, ...presetResponses },
  });
  for (const [method, path, schema, status, description] of [
    ["post", "/api/external/prompt-presets", createPromptPresetSchema, 201, "Create a personal preset"],
    ["patch", "/api/external/prompt-presets/{key}", updatePromptPresetSchema, 200, "Update or activate/deactivate a preset"],
    ["delete", "/api/external/prompt-presets/{key}", promptPresetRevisionSchema, 200, "Delete a personal preset"],
    ["post", "/api/external/prompt-presets/{key}/restore", promptPresetRevisionSchema, 200, "Restore the builtin prompt and name"],
  ] as const) registry.registerPath({
    method, path, tags: ["Prompt presets"], security,
    description: description + ". platform:write or higher. Mutations to an existing preset require expectedRevision; stale revisions return 409.",
    request: { ...(path.includes("{key}") ? { params: presetParams } : {}), body: { required: true, content: json(schema), description: "At most 98304 bytes; application/json." } },
    responses: { [status]: { description: "Preset saved", headers: responseHeaders, content: json(method === "delete" ? z.object({ deleted: z.literal(true) }) : presetItem) }, ...presetResponses },
  });
  for (const [path, schema] of [
    ["overview", externalMonitoringOverviewSchema], ["stats", externalMonitoringStatsSchema],
    ["requests", externalMonitoringRequestsSchema], ["top", externalMonitoringTopSchema],
    ["api-keys", externalMonitoringApiKeysSchema], ["requests/detail", externalMonitoringDetailSchema],
  ] as const) registry.registerPath({
    method: "get", path: "/api/external/monitoring/" + path, tags: ["Monitoring"], security,
    description: "platform:read or higher; owner scope by default, including UI jobs. scope=all requires platform:admin. Owner key filters must belong to this owner. Date range capped at 31 days; limit<=200, offset<=1000, search<=200. includeTotal=false avoids request counts. Key metadata is masked.",
    request: { query: externalMonitoringOperationQueries[path] },
    responses: { 200: { description: "Monitoring data", headers: responseHeaders, content: json(schema) },
      ...platformErrors, 400: error("Invalid scope or detail selector"), 404: error("API_KEY_NOT_FOUND or NOT_FOUND"),
    },
  });
  const modelAdminErrors = { ...platformErrors, 400: error("Invalid model input, immutable field, missing credential, or invalid import"),
    404: error("NOT_FOUND"), 409: error("CONFLICT"), 408: error("BODY_TIMEOUT"),
    413: error("Body too large"), 415: error("Use application/json"), 499: error("BODY_ABORTED"),
    503: { ...error("MODEL_CREDENTIAL_UNAVAILABLE or temporary service failure"), headers: retryHeaders },
  };
  const modelKeyParams = z.object({ modelKey: z.string().min(1) });
  registry.registerPath({
    method: "get", path: "/api/external/admin/models", tags: ["Model administration"], security,
    description: "platform:admin required. Includes inactive and LLM models by default. Configuration is a safe projection; credentials and machine command/environment locators are omitted.",
    request: { query: externalAdminModelQuerySchema },
    responses: { 200: { description: "Administrative model catalog", headers: responseHeaders, content: json(externalAdminModelListSchema) }, ...modelAdminErrors },
  });
  registry.registerPath({
    method: "get", path: "/api/external/admin/models/modal-comfyui", tags: ["Model administration"], security,
    description: "platform:admin required. Discover managed image/video workflows using the server's Modal connection.",
    responses: { 200: { description: "Workflow metadata", headers: responseHeaders, content: json(externalAdminModalListSchema) }, ...modelAdminErrors },
  });
  for (const [method, path, input, output, status, description] of [
    ["post", "/api/external/admin/models", getModelRegistrationDocumentationSchema(), externalAdminModelSchema, 201, "Register a model"],
    ["patch", "/api/external/admin/models/{modelKey}", externalAdminModelUpdateSchema, externalAdminModelSchema, 200, "Edit or activate/deactivate a model"],
    ["post", "/api/external/admin/models/import", externalAdminHfImportSchema, externalAdminHfImportResponseSchema, 200, "Import a Hugging Face draft; does not save it"],
    ["post", "/api/external/admin/models/modal-comfyui", externalAdminModalImportSchema, externalAdminModalImportResponseSchema, 200, "Import a managed workflow draft; does not save it"],
  ] as const) registry.registerPath({
    method, path, tags: ["Model administration"], security,
    description: description + ". platform:admin required. Provider-specific input validation matches model administration. Stored credentials are never returned; apiKey is write-only for LLM models.",
    request: { ...(path.includes("{modelKey}") ? { params: modelKeyParams } : {}), body: { required: true,
      description: path.endsWith("/import") ? "JSON body up to 8388608 bytes." : "JSON body up to 1048576 bytes.",
      content: json(input),
    } },
    responses: { [status]: { description: "Model or draft", headers: responseHeaders, content: json(output) }, ...modelAdminErrors },
  });
  registry.registerPath({
    method: "delete", path: "/api/external/admin/models/{modelKey}", tags: ["Model administration"], security,
    description: "Delete a model with platform:admin; invalidate the catalog cache and preserve existing default replacement behavior.",
    request: { params: modelKeyParams },
    responses: { 200: { description: "Deleted model", headers: responseHeaders, content: json(externalAdminModelSchema) }, ...modelAdminErrors },
  });
  const document = new OpenApiGeneratorV31(
    registry.definitions,
  ).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "leesfield API",
      version: externalApiVersion,
      description: translations?.infoDescription,
    },
    tags: [
      { name: "Generations", description: translations?.tags?.generations },
      { name: "Models", description: translations?.tags?.models },
      { name: "History", description: translations?.tags?.history ?? "Generation history" },
      { name: "Prompt presets", description: translations?.tags?.promptPresets ?? "Prompt presets" },
      { name: "Monitoring", description: translations?.tags?.monitoring ?? "Request metrics" },
      { name: "Model administration", description: translations?.tags?.modelAdministration ?? "Model management" },
    ],
  });
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of ["get", "post", "patch", "delete"] as const) {
      const description = translations?.platform?.[method.toUpperCase() + " " + path];
      if (item[method] && description) item[method].description = description;
    }
  }
  applyApiReferenceMetadata(document, translations);
  return { ...document, paths: document.paths ?? {} };
}
