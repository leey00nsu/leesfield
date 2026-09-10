import { Prisma } from "@prisma/client";
import {fileInputsFromAssets,parseFileInputPort} from "@/shared/model-catalog/file-input-ports";
import { ZodError } from "zod";
import { constructPrompt } from "@/shared/generation-graph/prompt-constructor";

import type { AudioGenerationFormValues } from "@/features/audio-generation/model/audio-generation-schema";
import type { ImageGenerationFormValues } from "@/features/image-generation/model/image-generation-schema";
import type { VideoGenerationFormValues } from "@/features/video-generation/model/video-generation-schema";
import { submitAudioGeneration } from "@/server/audio-generation/audio-generation-submission";
import { submitImageGeneration } from "@/server/image-generation/image-generation-submission";
import { mediaAssetService } from "@/server/media-assets/media-asset-service";
import { startMediaOperationWorker } from "@/server/media-operations/media-operation-worker";
import { getModelCatalog } from "@/server/model-catalog/catalog-service";
import {
  validateAudioGenerationPayload,
  validateImageGenerationPayload,
  validateVideoGenerationPayload,
} from "@/server/model-catalog/generation-validation";
import { resolveAudioStorageProvider } from "@/server/audio-generation/storage/storage-selector";
import { resolveImageStorageProvider } from "@/server/image-generation/storage/storage-selector";
import { resolveVideoStorageProvider } from "@/server/video-generation/storage/storage-selector";
import { submitVideoGeneration } from "@/server/video-generation/video-generation-submission";
import { findNodeDefinition, findPortDefinition } from "@/shared/generation-graph/node-registry";
import { isAllowedMediaMimeType, type MediaOperationDto, type MediaType } from "@/shared/media-assets/media-asset-contract";
import { isNodeStudioE2EMockBackgroundRemovalEnabled } from "@/server/media-assets/node-studio-e2e-media-fixtures";

import {
  executeNodeSchema,
  type NodeExecutionDto,
  type NodeExecutionInputSnapshot,
  type NodeExecutionMediaType,
} from "./node-execution-contract";
import {
  NodeExecutionConfigError,
  NodeExecutionInputError,
  NodeExecutionInputResolutionError,
  NodeExecutionProcessorUnavailableError,
  NodeExecutionStorageUnavailableError,
  NodeExecutionVersionConflictError,
} from "./node-execution-errors";
import {
  nodeExecutionRepository,
  type NodeExecutionRepository,
  type StoredExecutionRecord,
  type StoredNodeExecutionEdge,
  type StoredNodeExecutionTarget,
} from "./node-execution-repository";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ZodError<T> };

type NodeExecutionDependencies = {
  repository: NodeExecutionRepository;
  validateImage: (payload: unknown) => Promise<ValidationResult<ImageGenerationFormValues>>;
  validateVideo: (payload: unknown) => Promise<ValidationResult<VideoGenerationFormValues>>;
  validateAudio: (payload: unknown) => Promise<ValidationResult<AudioGenerationFormValues>>;
  submitImage: typeof submitImageGeneration;
  submitVideo: typeof submitVideoGeneration;
  submitAudio: typeof submitAudioGeneration;
  resolveAsset: typeof mediaAssetService.get;
  assertStorage: (mediaType: NodeExecutionMediaType) => void;
  createOperation: typeof mediaAssetService.createOperation;
  listNodeOperations: typeof mediaAssetService.listNodeOperations;
  getOperation: typeof mediaAssetService.getOperation;
  updateOperation: typeof mediaAssetService.updateOperation;
  cancelOperation: typeof mediaAssetService.cancelOperation;
  hasBackgroundRemovalProcessor: () => Promise<boolean>;
  startOperationWorker: () => void;
};

const defaultDependencies: NodeExecutionDependencies = {
  repository: nodeExecutionRepository,
  validateImage: validateImageGenerationPayload,
  validateVideo: validateVideoGenerationPayload,
  validateAudio: validateAudioGenerationPayload,
  submitImage: submitImageGeneration,
  submitVideo: submitVideoGeneration,
  submitAudio: submitAudioGeneration,
  resolveAsset: mediaAssetService.get.bind(mediaAssetService),
  createOperation: mediaAssetService.createOperation.bind(mediaAssetService),
  listNodeOperations: mediaAssetService.listNodeOperations.bind(mediaAssetService),
  getOperation: mediaAssetService.getOperation.bind(mediaAssetService),
  updateOperation: mediaAssetService.updateOperation.bind(mediaAssetService),
  cancelOperation: mediaAssetService.cancelOperation.bind(mediaAssetService),
  async hasBackgroundRemovalProcessor() {
    if (isNodeStudioE2EMockBackgroundRemovalEnabled()) return true;
    const catalog = await getModelCatalog();
    return catalog.some((model) =>
      model.type === "image" &&
      model.isActive &&
      model.provider === "hf_space" &&
      Boolean(model.meta.operations?.background_removal),
    );
  },
  startOperationWorker: startMediaOperationWorker,
  assertStorage(mediaType) {
    const provider = mediaType === "image"
      ? resolveImageStorageProvider().provider
      : mediaType === "video"
        ? resolveVideoStorageProvider().provider
        : resolveAudioStorageProvider().provider;
    if (provider !== "leemage") throw new NodeExecutionStorageUnavailableError();
  },
};

function parseInput(body: unknown) {
  try {
    return executeNodeSchema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) throw new NodeExecutionInputError(error.flatten());
    throw error;
  }
}

function targetKind(node: StoredNodeExecutionTarget) {
  return node.kind;
}

function mediaTypeForKind(kind: string | null): NodeExecutionMediaType | null {
  if (!kind) return null;
  const output = findNodeDefinition(kind)?.ports.find((port) =>
    port.direction === "output" &&
    (port.valueType === "image" || port.valueType === "audio" || port.valueType === "video"),
  );
  const valueType = output?.valueType;
  return valueType === "image" || valueType === "audio" || valueType === "video"
    ? valueType
    : null;
}

function edgeTargetPort(edge: StoredNodeExecutionEdge) {
  return edge.targetPortId;
}

function edgeSourcePort(edge: StoredNodeExecutionEdge) {
  return edge.sourcePortId;
}

function sourceKind(edge: StoredNodeExecutionEdge) {
  return edge.sourceNode.kind;
}

function selectedAssetId(edge: StoredNodeExecutionEdge, kind: string) {
  if (kind === "input.image" || kind === "input.audio" || kind === "input.video") {
    const config = edge.sourceNode.config;
    if (config && typeof config === "object" && "assetId" in config) {
      const value = (config as { assetId?: unknown }).assetId;
      return typeof value === "string" ? value : null;
    }
  }
  return edge.sourceNode.selectedOutputAssetId;
}

function inputPassThroughPort(kind: string) {
  if (kind === "input.image") return "reference";
  if (kind === "input.audio") return "audio";
  if (kind === "input.video") return "video";
  if (kind === "input.prompt") return "text";
  return null;
}

async function loadPassThroughEdge(
  ownerEmail: string,
  graphId: string,
  edge: StoredNodeExecutionEdge,
  dependencies: NodeExecutionDependencies,
  visited: Set<string>,
) {
  const kind = sourceKind(edge);
  const targetPortId = inputPassThroughPort(kind);
  if (!targetPortId) return null;
  if (visited.has(edge.sourceNodeId)) {
    throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
      edgeId: edge.id,
      sourceNodeId: edge.sourceNodeId,
      reason: "INPUT_PASS_THROUGH_CYCLE",
    });
  }
  visited.add(edge.sourceNodeId);
  const source = await dependencies.repository.getOwnedNode(ownerEmail, graphId, edge.sourceNodeId);
  if (source.id !== edge.sourceNodeId || source.kind !== kind) return null;
  const upstream = source.incomingEdges.find((candidate) => edgeTargetPort(candidate) === targetPortId &&
    !(kind === "input.image" && sourceKind(candidate) === "edit.image.splitGrid")) ?? null;
  if (!upstream) return null;
  const upstreamKind = sourceKind(upstream);
  const upstreamPortId = edgeSourcePort(upstream);
  const upstreamPort = findPortDefinition(upstreamKind, upstreamPortId, "output");
  const targetPort = findPortDefinition(kind, targetPortId, "input");
  if (!upstreamPort || !targetPort || upstreamPort.valueType !== targetPort.valueType) {
    throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
      edgeId: upstream.id,
      sourceNodeId: upstream.sourceNodeId,
    });
  }
  return upstream;
}

async function effectiveAssetIdFromEdge(
  ownerEmail: string,
  graphId: string,
  edge: StoredNodeExecutionEdge,
  dependencies: NodeExecutionDependencies,
  visited: Set<string> = new Set(),
): Promise<string | null> {
  const next = await loadPassThroughEdge(ownerEmail, graphId, edge, dependencies, visited);
  if (next) {
    return effectiveAssetIdFromEdge(ownerEmail, graphId, next, dependencies, visited);
  }
  return selectedAssetId(edge, sourceKind(edge));
}

async function effectivePromptFromEdge(
  ownerEmail: string, graphId: string, edge: StoredNodeExecutionEdge,
  dependencies: NodeExecutionDependencies, visited: Set<string> = new Set(),
): Promise<string | null> {
  if (sourceKind(edge) === "process.promptConstructor") {
    if (visited.has(edge.sourceNodeId)) throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", { reason: "PROMPT_INPUT_CYCLE" });
    const nextVisited = new Set(visited).add(edge.sourceNodeId);
    const source = await dependencies.repository.getOwnedNode(ownerEmail, graphId, edge.sourceNodeId);
    const sources = [];
    for (const incoming of source.incomingEdges.filter((candidate) => candidate.targetPortId === "text" && !candidate.hasPause).sort((a, b) => a.sortOrder - b.sortOrder)) {
      const config = incoming.sourceNode.config as { variableName?: string } | null;
      sources.push({ id: incoming.sourceNodeId, kind: sourceKind(incoming), variableName: config?.variableName,
        text: await effectivePromptFromEdge(ownerEmail, graphId, incoming, dependencies, new Set(nextVisited)) ?? "" });
    }
    try { return constructPrompt(String((source.config as { template?: string })?.template ?? ""), sources); }
    catch { throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", { reason: "PROMPT_OUTPUT_TOO_LARGE" }); }
  }
  const next = await loadPassThroughEdge(ownerEmail, graphId, edge, dependencies, visited);
  if (next) return effectivePromptFromEdge(ownerEmail, graphId, next, dependencies, visited);
  const text = (edge.sourceNode.config as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : null;
}

function portAcceptsMime(accepted: readonly string[] | undefined, mimeType: string) {
  if (!accepted?.length) return true;
  return accepted.some((candidate) =>
    candidate.endsWith("/*")
      ? mimeType.startsWith(candidate.slice(0, -1))
      : candidate.toLowerCase() === mimeType.toLowerCase(),
  );
}

type ResolvedNodeInputs = {
  prompt: string | null;
  settingsParameters: Record<string, unknown> | null;
  assets: Array<{
    assetId: string;
    portId: string;
    sortOrder: number;
    type: MediaType;
    mimeType: string;
    bytes: string | null;
    width: number | null;
    height: number | null;
    durationMs: number | null;
    url: string;
  }>;
};

async function resolveInputs(
  ownerEmail: string,
  graphId: string,
  node: StoredNodeExecutionTarget,
  kind: string,
  dependencies: NodeExecutionDependencies,
  parameters: Record<string, unknown>,
): Promise<ResolvedNodeInputs> {
  const definition = findNodeDefinition(kind);
  if (!definition) throw new NodeExecutionConfigError({ node: ["NODE_TYPE_UNSUPPORTED"] });
  const candidates: Array<{
    edge: StoredNodeExecutionEdge;
    assetId: string;
    portId: string;
    sortOrder: number;
    type: MediaType;
  }> = [];
  let prompt: string | null = null;
  let settingsParameters: Record<string, unknown> | null = null;
  const counts = new Map<string, number>();
  const orderedPort = kind === "edit.image.gif" ? "frames" : kind === "edit.video.stitch" ? "clips" : null;
  // Upstream filmstrips persist edge IDs. Order edges before expanding list
  // outputs so each edge's assets stay together and snapshots match the plan.
  const clipRanks = new Map<string, number>();
  if (orderedPort && Array.isArray(parameters.clipOrder)) {
    for (const id of parameters.clipOrder) {
      if (typeof id === "string" && !clipRanks.has(id)) clipRanks.set(id, clipRanks.size);
    }
  }

  const incomingEdges = [...node.incomingEdges].sort((left, right) => {
    const leftPort = edgeTargetPort(left);
    const rightPort = edgeTargetPort(right);
    const clipRank = leftPort === orderedPort && rightPort === orderedPort
      ? (clipRanks.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (clipRanks.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      : 0;
    return leftPort.localeCompare(rightPort) || clipRank || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
  });
  for (const edge of incomingEdges) {
    const fromKind = sourceKind(edge);
    const targetPortId = edgeTargetPort(edge);
    const sourcePortId = fromKind ? edgeSourcePort(edge) : null;
    if (!fromKind || !targetPortId || !sourcePortId) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
        edgeId: edge.id,
        sourceNodeId: edge.sourceNodeId,
      });
    }
    const targetPort = findPortDefinition(kind, targetPortId, "input");
    const sourcePort = findPortDefinition(fromKind, sourcePortId, "output");
    if (!targetPort || !sourcePort || targetPort.valueType !== sourcePort.valueType) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
        edgeId: edge.id,
        sourceNodeId: edge.sourceNodeId,
      });
    }
    if (targetPort.valueType === "settings") {
      if (kind !== "edit.video.easeCurve" || fromKind !== "edit.video.easeCurve") {
        throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
          edgeId: edge.id,
          sourceNodeId: edge.sourceNodeId,
        });
      }
      const sourceDefinition = findNodeDefinition(fromKind);
      const sourceConfig = sourceDefinition?.configSchema.safeParse(edge.sourceNode.config);
      if (!sourceConfig?.success) {
        throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
          edgeId: edge.id,
          sourceNodeId: edge.sourceNodeId,
        });
      }
      settingsParameters = (sourceConfig.data as { parameters: Record<string, unknown> }).parameters;
      counts.set(targetPortId, (counts.get(targetPortId) ?? 0) + 1);
      continue;
    }
    if (targetPort.valueType === "text") {
      const value = await effectivePromptFromEdge(ownerEmail, graphId, edge, dependencies);
      if (!["input.prompt", "process.promptConstructor"].includes(fromKind) || value === null) {
        throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
          edgeId: edge.id,
          sourceNodeId: edge.sourceNodeId,
        });
      }
      prompt = value;
      counts.set(targetPortId, (counts.get(targetPortId) ?? 0) + 1);
      continue;
    }
    if (!(targetPort.valueType === "image" || targetPort.valueType === "audio" || targetPort.valueType === "video")) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", { edgeId: edge.id });
    }
    if (sourcePort.valueShape === "ordered-list" && targetPort.valueShape === "ordered-list") {
      const outputs = (edge.sourceNode.outputs ?? []).filter((output) => output.portId === sourcePortId);
      if (edge.sourceNode.selectedOutputAssetId &&
        outputs.some((output) => output.assetId === edge.sourceNode.selectedOutputAssetId)) {
        let sortOrder = counts.get(targetPortId) ?? 0;
        for (const output of outputs) {
          candidates.push({
            edge,
            assetId: output.assetId,
            portId: targetPortId,
            sortOrder,
            type: targetPort.valueType,
          });
          sortOrder += 1;
        }
        counts.set(targetPortId, sortOrder);
        continue;
      }
    }
    const assetId = await effectiveAssetIdFromEdge(ownerEmail, graphId, edge, dependencies);
    if (assetId) {
      const sortOrder = counts.get(targetPortId) ?? 0;
      candidates.push({ edge, assetId, portId: targetPortId, sortOrder, type: targetPort.valueType });
      counts.set(targetPortId, sortOrder + 1);
      continue;
    }
    throw new NodeExecutionInputResolutionError("NODE_INPUT_SELECTION_REQUIRED", {
      edgeId: edge.id,
      sourceNodeId: edge.sourceNodeId,
    });
  }

  for (const port of definition.ports.filter((candidate) => candidate.direction === "input")) {
    const count = counts.get(port.id) ?? 0;
    if (count < port.minConnections) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_SELECTION_REQUIRED", { portId: port.id });
    }
    if (port.maxConnections !== null && count > port.maxConnections) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_LIMIT_EXCEEDED", {
        portId: port.id,
        count,
        limit: port.maxConnections,
      });
    }
  }

  const records = await dependencies.repository.getAssets(
    ownerEmail,
    candidates.map((candidate) => candidate.assetId),
  );
  const byId = new Map(records.map((asset) => [asset.id, asset]));
  const assets = await Promise.all(candidates.map(async (candidate) => {
    const asset = byId.get(candidate.assetId);
    const targetPort = findPortDefinition(kind, candidate.portId, "input");
    if (
      !asset ||
      asset.ownerEmail !== ownerEmail ||
      asset.status !== "completed" ||
      asset.type !== candidate.type ||
      !isAllowedMediaMimeType(candidate.type, asset.mimeType) ||
      !portAcceptsMime(targetPort?.acceptedMimeTypes, asset.mimeType)
    ) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_INVALID", {
        edgeId: candidate.edge.id,
        sourceNodeId: candidate.edge.sourceNodeId,
      });
    }
    const dto = await dependencies.resolveAsset(ownerEmail, asset.id);
    return {
      assetId: asset.id,
      portId: candidate.portId,
      sortOrder: candidate.sortOrder,
      type: asset.type,
      mimeType: dto.mimeType,
      bytes: dto.bytes,
      width: dto.width,
      height: dto.height,
      durationMs: dto.durationMs,
      url: dto.url,
    };
  }));
  return { prompt, settingsParameters, assets };
}

function inputSnapshot(inputs: ResolvedNodeInputs): NodeExecutionInputSnapshot[] {
  return inputs.assets.map(({ assetId, portId, sortOrder }) => ({ assetId, portId, sortOrder }));
}

function jsonRecord(input: Record<string, unknown>): Record<string, Prisma.InputJsonValue | null> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value as Prisma.InputJsonValue | null]),
  );
}

function mapValidationError(error: ZodError, mediaType: NodeExecutionMediaType) {
  const inputIssue = error.issues.find((issue) =>
    (mediaType === "image" && issue.path[0] === "initImages") ||
    (mediaType === "video" && issue.path[0] === "initImage"),
  );
  const params = inputIssue && "params" in inputIssue
    ? inputIssue.params as Record<string, unknown> | undefined
    : undefined;
  if (params?.nodeInputReason === "unsupported") {
    return new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
      count: params.count ?? 0,
      limit: 0,
    });
  }
  if (params?.nodeInputReason === "limit_exceeded") {
    return new NodeExecutionInputResolutionError("NODE_INPUT_LIMIT_EXCEEDED", {
      count: params.count ?? 0,
      limit: params.limit ?? 0,
    });
  }
  return new NodeExecutionConfigError(error.flatten());
}

function toDto(record: StoredExecutionRecord): NodeExecutionDto {
  return {
    executionId: record.executionId,
    executionKind: "generation",
    mediaType: record.mediaType,
    graphNodeId: record.graphNodeId,
    status: record.status,
    progress: record.progress,
    errorCode: record.status === "failed"
      ? record.errorMessage === "Modal 생성 실패: MODAL_TIMEOUT" ? "MODAL_TIMEOUT"
        : record.errorMessage === "Modal 생성 실패: MODAL_OUTPUT_MEDIA" ? "MODAL_OUTPUT_MEDIA" : "GENERATION_FAILED"
      : null,
    modelKey: record.modelKey,
    outputAssetIds: record.outputs.flatMap((output) => output.assetId ? [output.assetId] : []),
    createdAt: record.createdAt.toISOString(),
  };
}

function operationToDto(operation: MediaOperationDto): NodeExecutionDto {
  const errorCode = operation.status === "failed"
    ? operation.errorCode === "PROCESSOR_UNAVAILABLE"
      ? "PROCESSOR_UNAVAILABLE"
      : operation.errorCode === "MEDIA_UPLOAD_FAILED"
        ? "MEDIA_UPLOAD_FAILED"
        : "PROCESSOR_FAILED"
    : null;
  return {
    executionId: operation.id,
    executionKind: "media_operation",
    mediaType: mediaTypeForKind(operation.type) ?? "image",
    graphNodeId: operation.graphNodeId ?? "",
    status: operation.status,
    progress: operation.progress,
    errorCode,
    modelKey: null,
    outputAssetIds: operation.outputAssetIds,
    createdAt: operation.createdAt,
  };
}

function expectedOperationOutputs(kind: string, parameters: Record<string, unknown>) {
  if (kind !== "edit.image.splitGrid") return 1;
  const rows = typeof parameters.rows === "number" ? parameters.rows : 2;
  const cols = typeof parameters.cols === "number" ? parameters.cols : 2;
  return rows * cols;
}

const IMAGE_OPERATION_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_OPERATION_MAX_EDGE = 8_192;
const IMAGE_OPERATION_MAX_PIXELS = 32 * 1024 * 1024;

function assertBrowserImageOperationCapabilities(
  kind: string,
  parameters: Record<string, unknown>,
  inputs: ResolvedNodeInputs["assets"],
) {
  for (const input of inputs) {
    const bytes = input.bytes === null ? Number.NaN : Number(input.bytes);
    const width = input.width;
    const height = input.height;
    if (
      !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > IMAGE_OPERATION_MAX_BYTES ||
      !Number.isInteger(width) || (width ?? 0) <= 0 || (width ?? 0) > IMAGE_OPERATION_MAX_EDGE ||
      !Number.isInteger(height) || (height ?? 0) <= 0 || (height ?? 0) > IMAGE_OPERATION_MAX_EDGE ||
      (width ?? 0) * (height ?? 0) > IMAGE_OPERATION_MAX_PIXELS
    ) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
        assetId: input.assetId,
        reason: "IMAGE_OPERATION_LIMIT_EXCEEDED",
      });
    }
  }

  if (kind !== "edit.image.resize") return;
  const source = inputs[0];
  if (!source?.width || !source.height) return;
  let width = source.width;
  let height = source.height;
  const mode = parameters.mode;
  if (mode === "exact") {
    width = Number(parameters.width);
    height = Number(parameters.height);
  } else if (mode === "scale") {
    const scale = Number(parameters.scalePct) / 100;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  } else if (mode === "maxEdge") {
    const scale = Math.min(1, Number(parameters.maxEdge) / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const edgeScale = Math.min(1, IMAGE_OPERATION_MAX_EDGE / Math.max(width, height));
  width = Math.max(1, Math.round(width * edgeScale));
  height = Math.max(1, Math.round(height * edgeScale));
  if (width * height > IMAGE_OPERATION_MAX_PIXELS) {
    throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
      assetId: source.assetId,
      reason: "IMAGE_OPERATION_OUTPUT_LIMIT_EXCEEDED",
    });
  }
}

const VIDEO_OPERATION_MAX_BYTES = 500 * 1024 * 1024;
const AUDIO_OPERATION_MAX_BYTES = 100 * 1024 * 1024;
const VIDEO_OPERATION_MAX_DURATION_MS = 10 * 60 * 1_000;
const VIDEO_OPERATION_MAX_EDGE = 8_192;
const VIDEO_OPERATION_MAX_PIXELS = 32 * 1024 * 1024;

function assertBrowserVideoOperationCapabilities(
  kind: string,
  parameters: Record<string, unknown>,
  inputs: ResolvedNodeInputs["assets"],
) {
  for (const input of inputs) {
    const bytes = input.bytes === null ? Number.NaN : Number(input.bytes);
    const byteLimit = input.type === "audio" ? AUDIO_OPERATION_MAX_BYTES : VIDEO_OPERATION_MAX_BYTES;
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > byteLimit) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
        assetId: input.assetId,
        reason: "VIDEO_OPERATION_BYTE_LIMIT_EXCEEDED",
      });
    }
    if (
      input.durationMs !== null &&
      (!Number.isInteger(input.durationMs) || input.durationMs <= 0 || input.durationMs > VIDEO_OPERATION_MAX_DURATION_MS)
    ) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
        assetId: input.assetId,
        reason: "VIDEO_OPERATION_DURATION_LIMIT_EXCEEDED",
      });
    }
    if (
      input.type === "video" &&
      input.width !== null &&
      input.height !== null &&
      (
        input.width <= 0 || input.height <= 0 ||
        input.width > VIDEO_OPERATION_MAX_EDGE || input.height > VIDEO_OPERATION_MAX_EDGE ||
        input.width * input.height > VIDEO_OPERATION_MAX_PIXELS
      )
    ) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
        assetId: input.assetId,
        reason: "VIDEO_OPERATION_DIMENSION_LIMIT_EXCEEDED",
      });
    }
  }

  const videos = inputs.filter((input) => input.type === "video");
  if (kind === "edit.video.trim") {
    const startMs = Number(parameters.startMs);
    const endMs = Number(parameters.endMs);
    const sourceDurationMs = videos[0]?.durationMs;
    if (endMs <= startMs || (sourceDurationMs !== null && sourceDurationMs !== undefined && endMs > sourceDurationMs)) {
      throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
        assetId: videos[0]?.assetId,
        reason: "VIDEO_OPERATION_INTERVAL_INVALID",
      });
    }
  }
  if (kind === "edit.video.stitch") {
    const repeat = Number(parameters.repeat);
    const durations = videos.map((input) => input.durationMs);
    if (durations.every((duration): duration is number => duration !== null)) {
      const outputDurationMs = durations.reduce((sum, duration) => sum + duration, 0) * repeat;
      if (outputDurationMs > VIDEO_OPERATION_MAX_DURATION_MS) {
        throw new NodeExecutionInputResolutionError("NODE_INPUT_UNSUPPORTED", {
          reason: "VIDEO_OPERATION_OUTPUT_DURATION_LIMIT_EXCEEDED",
        });
      }
    }
  }
}

function assertBrowserOperationCapabilities(
  kind: string,
  parameters: Record<string, unknown>,
  inputs: ResolvedNodeInputs["assets"],
) {
  if (kind.startsWith("edit.image.")) {
    assertBrowserImageOperationCapabilities(kind, parameters, inputs);
    return;
  }
  if (kind.startsWith("edit.video.")) {
    assertBrowserVideoOperationCapabilities(kind, parameters, inputs);
    return;
  }
}

export function createNodeExecutionService(
  overrides: Partial<NodeExecutionDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return {
    async execute(ownerEmail: string, graphId: string, nodeId: string, body: unknown) {
      const input = parseInput(body);
      const node = await dependencies.repository.getOwnedNode(ownerEmail, graphId, nodeId);
      if (node.graph.version !== input.expectedGraphVersion) {
        throw new NodeExecutionVersionConflictError();
      }
      const kind = targetKind(node);
      const mediaType = mediaTypeForKind(kind);
      const definition = kind ? findNodeDefinition(kind) : null;
      if (!kind || !mediaType || !definition || definition.executionMode === "none") {
        throw new NodeExecutionConfigError({ node: ["NODE_TYPE_UNSUPPORTED"] });
      }
      const parsedConfig = definition.configSchema.safeParse(node.config);
      if (!parsedConfig.success || node.configVersion !== definition.configVersion) {
        throw new NodeExecutionConfigError(
          parsedConfig.success ? { node: ["UNKNOWN_CONFIG_VERSION"] } : parsedConfig.error.flatten(),
        );
      }
      const config = parsedConfig.data as {
        prompt: string;
        modelKey: string | null;
        parameters: Record<string, unknown>;
      };
      const resolved = await resolveInputs(ownerEmail, graphId, node, kind, dependencies, config.parameters);
      if (definition.executionMode === "browser-operation" || definition.executionMode === "server-operation") {
        dependencies.assertStorage(mediaType);
        if (
          definition.executionMode === "server-operation" &&
          kind === "edit.image.removeBackground" &&
          !(await dependencies.hasBackgroundRemovalProcessor())
        ) {
          throw new NodeExecutionProcessorUnavailableError();
        }
        const ownParameters = (parsedConfig.data as { parameters: Record<string, unknown> }).parameters;
        const parameters = kind === "edit.video.easeCurve" && resolved.settingsParameters
          ? resolved.settingsParameters
          : ownParameters;
        if (definition.executionMode === "browser-operation") {
          assertBrowserOperationCapabilities(kind, parameters, resolved.assets);
        }
        const expectedOutputCount = expectedOperationOutputs(kind, parameters);
        const outputPort = definition.ports.find((port) => port.direction === "output");
        if (!outputPort) throw new NodeExecutionConfigError({ node: ["NODE_OUTPUT_INVALID"] });
        const operation = await dependencies.createOperation(ownerEmail, {
          graphId,
          graphNodeId: node.id,
          type: kind,
          configVersion: definition.configVersion,
          parameters,
          expectedOutputCount,
          inputs: inputSnapshot(resolved),
        });
        if (definition.executionMode === "server-operation") dependencies.startOperationWorker();
        return {
          operation,
          record: {
            id: operation.id,
            status: operation.status,
            progress: operation.progress,
          },
          mediaType,
          plan: definition.executionMode === "browser-operation" ? {
            kind,
            parameters,
            inputs: resolved.assets.map(({ assetId, portId, sortOrder, type, mimeType, bytes, width, height, durationMs, url }) => ({
              assetId,
              portId,
              sortOrder,
              type,
              mimeType,
              bytes,
              width,
              height,
              durationMs,
              url,
            })),
            outputPortId: outputPort.id,
            outputMediaType: mediaType,
            expectedOutputCount,
          } : undefined,
        };
      }
      const prompt = resolved.prompt ?? config.prompt;
      const fileInputs = fileInputsFromAssets(resolved.assets);
      const assetInputs = inputSnapshot(resolved);
      dependencies.assertStorage(mediaType);

      if (mediaType === "image") {
        const initImages = resolved.assets
          .filter((asset) => asset.type === "image" && !parseFileInputPort(asset.portId))
          .map((asset) => asset.url);
        const candidate = { prompt, model: config.modelKey, ...config.parameters, initImages, fileInputs };
        const validated = await dependencies.validateImage(candidate);
        if (!validated.success) throw mapValidationError(validated.error, mediaType);
        const submission = await dependencies.submitImage({
          payload: validated.data,
          ownerEmail,
          graphNodeId: node.id,
          requestSnapshot: jsonRecord({
            ...validated.data,
            initImages: [],
            inputAssets: assetInputs,
            graphId,
            graphNodeId: node.id,
          }),
        });
        return { ...submission, mediaType };
      }
      if (mediaType === "video") {
        const initImage = resolved.assets.find((asset) => asset.portId === "initImage")?.url ?? "";
        const candidate = { prompt, model: config.modelKey, ...config.parameters, initImage, fileInputs };
        const validated = await dependencies.validateVideo(candidate);
        if (!validated.success) throw mapValidationError(validated.error, mediaType);
        const submission = await dependencies.submitVideo({
          payload: validated.data,
          ownerEmail,
          graphNodeId: node.id,
          requestSnapshot: jsonRecord({
            ...validated.data,
            initImage: null,
            inputAssets: assetInputs,
            graphId,
            graphNodeId: node.id,
          }),
        });
        return { ...submission, mediaType };
      }
      const candidate = { prompt, model: config.modelKey, ...config.parameters };
      const validated = await dependencies.validateAudio(candidate);
      if (!validated.success) throw mapValidationError(validated.error, mediaType);
      const submission = await dependencies.submitAudio({
        payload: validated.data,
        ownerEmail,
        graphNodeId: node.id,
        requestSnapshot: jsonRecord({
          ...validated.data,
          inputAudio: null,
          inputAssets: assetInputs,
          graphId,
          graphNodeId: node.id,
        }),
      });
      return { ...submission, mediaType };
    },

    async list(ownerEmail: string, graphId: string, nodeId: string) {
      const node = await dependencies.repository.getOwnedNode(ownerEmail, graphId, nodeId);
      const kind = targetKind(node);
      const mediaType = mediaTypeForKind(kind);
      if (!mediaType) throw new NodeExecutionConfigError({ node: ["NODE_TYPE_UNSUPPORTED"] });
      const definition = kind ? findNodeDefinition(kind) : null;
      if (definition?.executionMode === "browser-operation" || definition?.executionMode === "server-operation") {
        return (await dependencies.listNodeOperations(ownerEmail, graphId, nodeId)).map(operationToDto);
      }
      const records = await dependencies.repository.listExecutions(ownerEmail, nodeId, mediaType, 20);
      return records.map(toDto);
    },

    async get(ownerEmail: string, graphId: string, nodeId: string, executionId: string) {
      const node = await dependencies.repository.getOwnedNode(ownerEmail, graphId, nodeId);
      const definition = findNodeDefinition(targetKind(node) ?? "");
      if (definition?.executionMode === "browser-operation" || definition?.executionMode === "server-operation") {
        const operation = await dependencies.getOperation(ownerEmail, executionId);
        if (operation.graphId !== graphId || operation.graphNodeId !== nodeId) {
          throw new NodeExecutionConfigError({ node: ["NODE_EXECUTION_TARGET_INVALID"] });
        }
        return operationToDto(operation);
      }
      return toDto(await dependencies.repository.findExecution(ownerEmail, graphId, nodeId, executionId));
    },

    async cancel(ownerEmail: string, graphId: string, nodeId: string, executionId: string) {
      const node = await dependencies.repository.getOwnedNode(ownerEmail, graphId, nodeId);
      const definition = findNodeDefinition(targetKind(node) ?? "");
      if (definition?.executionMode === "browser-operation" || definition?.executionMode === "server-operation") {
        const operation = await dependencies.getOperation(ownerEmail, executionId);
        if (operation.graphId !== graphId || operation.graphNodeId !== nodeId) {
          throw new NodeExecutionConfigError({ node: ["NODE_EXECUTION_TARGET_INVALID"] });
        }
        return operationToDto(await dependencies.cancelOperation(ownerEmail, executionId));
      }
      return toDto(await dependencies.repository.cancelExecution(ownerEmail, graphId, nodeId, executionId));
    },

    async update(ownerEmail: string, graphId: string, nodeId: string, executionId: string, body: unknown) {
      const node = await dependencies.repository.getOwnedNode(ownerEmail, graphId, nodeId);
      const definition = findNodeDefinition(targetKind(node) ?? "");
      if (definition?.executionMode !== "browser-operation") {
        throw new NodeExecutionConfigError({ node: ["NODE_TYPE_UNSUPPORTED"] });
      }
      const operation = await dependencies.getOperation(ownerEmail, executionId);
      if (operation.graphId !== graphId || operation.graphNodeId !== nodeId) {
        throw new NodeExecutionConfigError({ node: ["NODE_EXECUTION_TARGET_INVALID"] });
      }
      return operationToDto(await dependencies.updateOperation(ownerEmail, executionId, body));
    },
  };
}

export const nodeExecutionService = createNodeExecutionService();
