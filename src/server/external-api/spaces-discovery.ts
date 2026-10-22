import { z } from "zod";
import { canonicalNodeRegistry } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { isTemporarilyHiddenEditNodeKind, isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { externalSpaceUpdateSchema, nodeCapabilitySchema, spaceCapabilitiesResponseSchema, spaceModelInputResponseSchema } from "@/shared/api/spaces-contract";
import { hasFfmpegVideoProcessor } from "@/server/media-operations/ffmpeg-video-processor";
import { getExternalModelInput } from "./model-input";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { fileInputPort } from "@/shared/model-catalog/file-input-ports";
import { generationFields } from "@/shared/api/generation-input";

export async function getSpaceCapabilities(hasVideoProcessor = hasFfmpegVideoProcessor) {
  const videoAvailable = await hasVideoProcessor();
  return spaceCapabilitiesResponseSchema.parse({
    schemaVersion: 3, limits: { nodes: 500, edges: 2000, groups: 500 },
    graphSchema: z.toJSONSchema(externalSpaceUpdateSchema, { unrepresentable: "any" }),
    nodes: Object.values(canonicalNodeRegistry).filter(definition => !isTemporarilyHiddenEditNodeKind(definition.kind)).map(definition => {
      const retired = isUnavailableEditNodeKind(definition.kind);
      const reason: z.infer<typeof nodeCapabilitySchema>["reason"] = retired ? "RETIRED"
        : definition.executionMode === "browser-operation" ? "BROWSER_ONLY"
        : definition.executionMode === "none" ? "NOT_EXECUTABLE"
        : definition.executionMode === "server-operation" && !videoAvailable ? "PROCESSOR_UNAVAILABLE" : null;
      return { kind: definition.kind, configVersion: definition.configVersion,
        configSchema: z.toJSONSchema(definition.configSchema, { unrepresentable: "any" }),
        defaultConfig: defaultConfigForKind(definition.kind), ports: definition.ports,
        authorable: !retired, apiExecutable: reason === null, reason };
    }),
  });
}

export function spaceModelSummary(model: ModelCatalogItem) {
  return { id: model.id, key: model.key, label: model.label, type: model.type };
}

export function getSpaceModelInput(model: ModelCatalogItem) {
  if (model.type === "llm") {
    const supportsImages = model.providerConfig.supports_images === true;
    return spaceModelInputResponseSchema.parse({
      model: spaceModelSummary(model),
      inputSchema: z.toJSONSchema(canonicalNodeRegistry["generate.assistant"].configSchema, { unrepresentable: "any" }),
      files: supportsImages ? [
        { name: "images", portId: "images", multiple: true, maxItems: 4, maxBytes: 8 * 1024 * 1024 },
        { name: "videos", portId: "videos", multiple: true, maxItems: 2, maxBytes: 60 * 1024 * 1024 },
      ] : [],
      capabilities: { supportsImages, maxVideoDurationMs: 60_000 },
    });
  }
  const input = getExternalModelInput(model);
  const contract = getGradioContract(model);
  const fileNames = new Set(input.files.map(file => file.name));
  const properties = Object.fromEntries(Object.entries(input.inputSchema.properties ?? {}).map(([name, schema]) => {
    if (fileNames.has(name)) return [name, schema];
    const field = contract?.inputs.find(field => field.name === name);
    const path = field?.canonical === "prompt" || (!contract && name === "prompt") ? "prompt"
      : contract || !Object.hasOwn(generationFields[model.type], name) ? "parameters.dynamicParams." + name
      : "parameters." + name;
    return [name, { ...schema, "x-node-config-path": path }];
  }));
  return spaceModelInputResponseSchema.parse({ model: spaceModelSummary(model), inputSchema: { ...input.inputSchema, properties },
    files: input.files.map(({ name, multiple, maxBytes, maxItems }) => {
      const field = getGradioContract(model)?.inputs.find(field => field.name === name);
      const portId = field?.media ? fileInputPort(field.media, name)
        : name === "initImages" ? "references" : name === "initImage" ? "initImage"
        : name === "inputAudio" ? fileInputPort("audio", name) : null;
      return { name, multiple, maxBytes, maxItems, portId };
    }),
    capabilities: {},
  });
}
