import { z } from "zod";
import type { OpenAPIRegistry, RouteConfig } from "@asteasolutions/zod-to-openapi";
import { errorResponseSchema } from "@/shared/api/external-contract";
import { externalSpaceCreateSchema, externalSpaceUpdateSchema, externalSpaceSchema, externalSpacesResponseSchema, externalSpaceListQuerySchema, externalExecuteNodeSchema, spaceCapabilitiesResponseSchema, externalSpaceModelsQuerySchema, spaceModelsResponseSchema, spaceModelInputResponseSchema } from "@/shared/api/spaces-contract";
import { externalAssetsQuerySchema, externalAssetsResponseSchema, externalAssetResponseSchema, externalAssetUploadSchema, externalUploadResponseSchema, externalUploadConfirmSchema, externalUploadedResponseSchema } from "@/shared/api/assets-contract";
import { externalExecutionQuerySchema, externalExecutionResponseSchema, externalExecutionsResponseSchema, externalAssistantSelectionSchema, externalNodeOutputResponseSchema, externalIdempotencyKeySchema } from "@/shared/api/space-executions-contract";
import { canonicalNodeSchema } from "@/shared/generation-graph/canonical-graph";

export function registerSpacesApi(registry: OpenAPIRegistry, security: RouteConfig["security"]) {
  // The runtime config is arbitrary JSON validated against each registry kind.
  // Avoid recursive z.json() in OpenAPI; capabilities supplies the per-kind schemas.
  const nodes = z.array(canonicalNodeSchema.extend({ config: z.record(z.string(), z.unknown()) })).max(500);
  const spaceResponse = z.object({ space: z.object({ ...externalSpaceSchema.shape, nodes }) });
  const graphInput = externalSpaceUpdateSchema.extend({ nodes }).openapi({ example: {
    schemaVersion: 3, expectedVersion: 1, title: "API space",
    nodes: [
      { id: "source-video", kind: "input.video", position: { x: 0, y: 0 }, configVersion: 1, selectedOutputAssetId: null, config: { assetId: "<VIDEO_ASSET_ID>" } },
      { id: "frames", kind: "edit.video.extractFrames", position: { x: 400, y: 0 }, configVersion: 1, selectedOutputAssetId: null, config: { parameters: { timestampMs: 1500 } } },
      { id: "frame-output", kind: "output.single", position: { x: 800, y: 0 }, configVersion: 1, selectedOutputAssetId: null, config: { mediaType: "image" } },
    ],
    edges: [
      { id: "video-input", sourceNodeId: "source-video", sourcePortId: "video", targetNodeId: "frames", targetPortId: "video", sortOrder: 0 },
      { id: "frame-result", sourceNodeId: "frames", sourcePortId: "frame", targetNodeId: "frame-output", targetPortId: "image", sortOrder: 0 },
    ], groups: [], selectionChanges: [],
  } });
  const headers = { "X-Request-ID": { description: "Request trace ID", schema: { type: "string" as const } } };
  const retryHeaders = { ...headers, "Retry-After": { description: "Seconds before retry", schema: { type: "integer" as const } } };
  const error = (description: string) => ({ description, headers, content: { "application/json": { schema: errorResponseSchema } } });
  const commonErrors = {
    401: error("API key required"), 403: error("Invalid/revoked key or PLATFORM_PERMISSION_REQUIRED"),
    429: { ...error("Owner/key request rate limit"), headers: retryHeaders },
    500: error("Unexpected server error"),
    503: { ...error("Rate limit storage or service unavailable"), headers: retryHeaders },
  };
  function add(method: RouteConfig["method"], path: string, description: string, output: z.ZodType | null,
    options: { input?: z.ZodType; query?: z.ZodObject; status?: number; binary?: boolean; errors?: Record<number, string> } = {}) {
    const isExecution = method === "post" && path.endsWith("/executions");
    const params = Object.fromEntries([...path.matchAll(/{([^}]+)}/g)].map(match => [match[1], z.string().min(1)]));
    registry.registerPath({
      method, path, description, security, tags: [path.startsWith("/api/external/assets") ? "Assets" : "Spaces"],
      request: {
        ...(Object.keys(params).length ? { params: z.object(params) } : {}),
        ...(options.query ? { query: options.query } : {}),
        ...(isExecution ? { headers: z.object({ "Idempotency-Key": externalIdempotencyKeySchema.optional().describe("Optional, trim then 1–128 visible ASCII characters; invalid values return 400. Scoped to owner, API key, space and node. Retained until node/space deletion, including failed/cancelled jobs. Same original body replays after graph changes; different body returns 409.") }) } : {}),
        ...(options.input ? { body: { required: true, content: {
          [options.binary ? "application/octet-stream" : "application/json"]: { schema: options.input },
        }, description: options.binary ? "Raw file bytes. Use the returned upload URL (including target) and declared MIME as Content-Type. Never JSON-encode file contents." : "Graph PUT up to 8388608 bytes; other JSON bodies up to 1048576 bytes." } } : {}),
      },
      responses: {
        [options.status ?? 200]: { description: "Success", headers, ...(output ? { content: { "application/json": { schema: output } } } : {}) },
        ...commonErrors,
        ...(options.query ? { 400: error("Invalid query") } : {}),
        ...(options.input && !options.binary ? { 400: error("Invalid JSON or input"), 408: error("BODY_TIMEOUT: application body reading exceeded 30 seconds; upstream buffering is excluded"), 413: error("Request body exceeds limit"), 415: error("Use application/json, optionally with charset"), 499: error("BODY_ABORTED: caller disconnected; this response may not be delivered") } : {}),
        ...Object.fromEntries(Object.entries(options.errors ?? {}).map(([status, description]) => [status, error(description)])),
      },
    });
  }
  const spaces = "/api/external/spaces";
  const space = spaces + "/{spaceId}";
  const executions = space + "/nodes/{nodeId}/executions";
  const execution = executions + "/{executionId}";
  add("get", spaces, "List owned spaces.", externalSpacesResponseSchema, { query: externalSpaceListQuerySchema });
  add("post", spaces, "Create a space.", spaceResponse, { input: externalSpaceCreateSchema, status: 201 });
  add("get", space, "Get a space’s nodes, connections and selected results.", spaceResponse, { errors: { 404: "GRAPH_NOT_FOUND" } });
  add("put", space, "Save a space’s nodes, connections and title.", spaceResponse, { input: graphInput, errors: { 404: "Owned graph or referenced asset not found", 409: "GRAPH_VERSION_CONFLICT" } });
  add("delete", space, "Delete a space.", null, { status: 204, errors: { 404: "GRAPH_NOT_FOUND", 409: "GRAPH_ACTIVE_EXECUTION" } });
  add("post", space + "/copy", "Copy a space.", spaceResponse, { status: 201, errors: { 400: "Unsupported space format or invalid output reference", 404: "GRAPH_NOT_FOUND" } });
  add("get", spaces + "/capabilities", "Discover available nodes and their input and execution requirements.", spaceCapabilitiesResponseSchema);
  add("get", spaces + "/models", "List models available in spaces.", spaceModelsResponseSchema, { query: externalSpaceModelsQuerySchema });
  add("get", spaces + "/models/{modelId}/schema", "Get a model’s inputs and file connection requirements.", spaceModelInputResponseSchema, { errors: { 404: "MODEL_NOT_FOUND" } });
  add("get", executions, "List a node’s executions.", externalExecutionsResponseSchema, { query: externalExecutionQuerySchema, errors: { 404: "Owned graph or node not found" } });
  add("post", executions, "Execute one saved node.", externalExecutionResponseSchema, { input: externalExecuteNodeSchema, status: 202, errors: { 400: "Invalid graph/input, unsupported or browser-only node", 404: "Owned graph, node, asset or model not found", 409: "GRAPH_VERSION_CONFLICT, IDEMPOTENCY_CONFLICT or NODE_GENERATION_ACTIVE" } });
  add("get", execution, "Get a node execution’s status and results.", externalExecutionResponseSchema, { errors: { 404: "NODE_EXECUTION_NOT_FOUND" } });
  add("delete", execution, "Request cancellation of a node execution.", externalExecutionResponseSchema, { errors: { 404: "NODE_EXECUTION_NOT_FOUND" } });
  add("patch", execution, "Select an item from an Assistant list.", externalExecutionResponseSchema, { input: externalAssistantSelectionSchema, errors: { 404: "NODE_EXECUTION_NOT_FOUND", 409: "ASSISTANT_SELECTION_CONFLICT" } });
  add("get", space + "/nodes/{nodeId}/output", "Get results for an output, gallery or image comparison node.", externalNodeOutputResponseSchema, { errors: { 400: "Node does not support output resolution", 404: "Owned graph, node or asset not found" } });
  const assets = "/api/external/assets";
  add("get", assets, "Search completed assets.", externalAssetsResponseSchema, { query: externalAssetsQuerySchema });
  add("get", assets + "/{assetId}", "Get an asset and usable URL.", externalAssetResponseSchema, { errors: { 404: "MEDIA_ASSET_NOT_FOUND" } });
  add("post", assets + "/uploads", "Create a file upload URL.", externalUploadResponseSchema, { input: externalAssetUploadSchema, status: 201, errors: { 413: "MEDIA_FILE_TOO_LARGE or MEDIA_QUOTA_EXCEEDED", 422: "MEDIA_MIME_MISMATCH" } });
  add("put", assets + "/uploads/{uploadId}/content", "Transfer a file to the issued URL.", externalUploadedResponseSchema, {
    input: z.string().openapi({ type: "string", format: "binary" }), binary: true,
    query: z.object({ target: z.string().min(1).describe("Use the exact target from the issued upload URL.") }),
    errors: { 404: "MEDIA_UPLOAD_NOT_FOUND", 409: "MEDIA_UPLOAD_CONFIRMING or MEDIA_UPLOAD_FAILED", 410: "MEDIA_UPLOAD_EXPIRED", 413: "MEDIA_FILE_TOO_LARGE", 422: "MEDIA_MIME_MISMATCH or MEDIA_SIZE_MISMATCH" },
  });
  add("post", assets + "/uploads/{uploadId}/confirm", "Confirm an upload and receive its asset ID.", externalAssetResponseSchema, { input: externalUploadConfirmSchema, errors: { 404: "MEDIA_UPLOAD_NOT_FOUND", 409: "MEDIA_UPLOAD_CONFIRMING or MEDIA_UPLOAD_FAILED", 410: "MEDIA_UPLOAD_EXPIRED", 413: "MEDIA_FILE_TOO_LARGE", 422: "Uploaded bytes, MIME or metadata verification failed" } });
}
