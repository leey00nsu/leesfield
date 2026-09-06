import { z } from "zod";
import { splitTemplateSchema } from "./split-grid-template";

export const canonicalNodeKinds = [
  "input.image",
  "input.audio",
  "input.video",
  "input.prompt",
  "process.promptConstructor",
  "generate.image",
  "generate.audio",
  "generate.video",
  "edit.image.annotation",
  "edit.image.resize",
  "edit.image.removeBackground",
  "edit.image.splitGrid",
  "edit.image.gif",
  "edit.video.stitch",
  "edit.video.trim",
  "edit.video.frameGrab",
  "edit.video.easeCurve",
  "output.single",
  "output.gallery",
  "inspect.imageCompare",
] as const;

export const canonicalNodeKindSchema = z.enum(canonicalNodeKinds);
export type CanonicalNodeKind = z.infer<typeof canonicalNodeKindSchema>;

export const portValueTypeSchema = z.enum(["text", "image", "audio", "video", "settings", "media"]);
export type PortValueType = z.infer<typeof portValueTypeSchema>;

export type PortDefinition = {
  id: string;
  direction: "input" | "output";
  valueType: PortValueType;
  required: boolean;
  edgeCardinality: "one" | "many";
  valueShape: "single" | "ordered-list";
  ordered: boolean;
  minConnections: number;
  maxConnections: number | null;
  acceptedMimeTypes?: readonly string[];
  requiredCapabilities?: readonly string[];
  homogeneous?: boolean;
};

export type NodeExecutionMode = "none" | "server-generation" | "server-operation" | "browser-operation";

export type NodeDefinition = {
  kind: CanonicalNodeKind;
  configVersion: 1;
  configSchema: z.ZodType<Record<string, unknown>>;
  ports: readonly PortDefinition[];
  executionMode: NodeExecutionMode;
};

const idSchema = z.string().trim().min(1).max(128);
const parametersSchema = z.record(z.string(), z.json());
export const nodePresentationSchema = z.object({
  customTitle: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(4_000).optional(),
  isOptional: z.boolean().optional(),
}).strict();
export type NodePresentation = z.infer<typeof nodePresentationSchema>;

const presentationField = { presentation: nodePresentationSchema.optional(),
  templateSource: z.object({ nodeId: idSchema, localNodeId: idSchema, index: z.number().int().min(0).max(399) }).strict().optional() };
const emptyConfigSchema = z.object(presentationField).strict();
const assetInputConfigSchema = z.object({
  assetId: idSchema.nullable(),
  filename: z.string().trim().min(1).max(255).optional(),
  splitSource: z.object({ nodeId: idSchema, index: z.number().int().min(0).max(399) }).strict().optional(),
  ...presentationField,
}).strict();
const promptInputConfigSchema = z.object({
  text: z.string().max(20_000),
  variableName: z.string().trim().min(1).max(128).optional(),
  ...presentationField,
}).strict();
const generationConfigSchema = z
  .object({
    prompt: z.string().max(20_000),
    modelKey: z.string().trim().min(1).max(200).nullable(),
    parameters: parametersSchema,
    ...presentationField,
  })
  .strict();
const annotationShapeBaseSchema = {
  id: idSchema,
  x: z.number(),
  y: z.number(),
  stroke: z.string().min(1).max(64),
  strokeWidth: z.number().positive().max(64),
  opacity: z.number().min(0).max(1),
};
const annotationShapeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("rectangle"),
    ...annotationShapeBaseSchema,
    width: z.number(), height: z.number(), fill: z.string().min(1).max(64).nullable(),
  }).strict(),
  z.object({
    type: z.literal("circle"),
    ...annotationShapeBaseSchema,
    radiusX: z.number().nonnegative(), radiusY: z.number().nonnegative(), fill: z.string().min(1).max(64).nullable(),
  }).strict(),
  z.object({
    type: z.literal("arrow"), ...annotationShapeBaseSchema,
    points: z.array(z.number()).length(4),
  }).strict(),
  z.object({
    type: z.literal("freehand"), ...annotationShapeBaseSchema,
    points: z.array(z.number()).min(4).max(20_000),
  }).strict(),
  z.object({
    type: z.literal("text"), ...annotationShapeBaseSchema,
    text: z.string().max(2_000), fill: z.string().min(1).max(64),
    fontSize: z.number().positive().max(512),
  }).strict(),
]);

const annotationConfigSchema = z.object({
  parameters: z.object({ shapes: z.array(annotationShapeSchema).max(500).default([]) }).strict(),
  ...presentationField,
}).strict();
const resizeConfigSchema = z.object({
  parameters: z.object({
    mode: z.enum(["exact", "maxEdge", "scale"]).default("exact"),
    width: z.number().int().min(1).max(8192).default(128),
    height: z.number().int().min(1).max(8192).default(128),
    maxEdge: z.number().int().min(1).max(8192).default(128),
    scalePct: z.number().min(1).max(800).default(100),
    fit: z.enum(["contain", "cover", "stretch"]).default("contain"),
    padColor: z.string().min(1).max(64).default("#00000000"),
    format: z.enum(["keep", "png", "jpeg", "webp"]).default("png"),
    quality: z.number().min(0).max(1).default(0.9),
  }).strict(),
  ...presentationField,
}).strict();
const removeBackgroundConfigSchema = z.object({
  parameters: z.object({
    model: z.enum(["isnet_quint8", "isnet_fp16", "isnet"]).default("isnet_fp16"),
  }).strict(),
  ...presentationField,
}).strict();
const splitGridConfigSchema = z.object({
  template: splitTemplateSchema.optional(),
  parameters: z.object({
    rows: z.number().int().min(1).max(20).default(2),
    cols: z.number().int().min(1).max(20).default(2),
    colOffsets: z.array(z.number().gt(0).lt(1)).max(19).default([]),
    rowOffsets: z.array(z.number().gt(0).lt(1)).max(19).default([]),
  }).strict(),
  materialization: z.object({
    rows: z.number().int().min(1).max(20),
    cols: z.number().int().min(1).max(20),
    cells: z.array(z.object({
      baseNodeId: idSchema,
      nodeIds: z.array(idSchema).max(500),
      groupId: idSchema.nullable(),
    }).strict()).max(400),
  }).strict().optional(),
  ...presentationField,
}).strict().superRefine((config, ctx) => {
  if (config.template && config.template.nodes.length * config.parameters.rows * config.parameters.cols > 499) {
    ctx.addIssue({ code: "custom", path: ["template"], message: "Cell template exceeds the Space node limit." });
  }
});
const gifConfigSchema = z.object({
  parameters: z.object({
    fps: z.number().min(1).max(60).default(8),
    loopCount: z.number().int().min(0).max(65_535).default(0),
    colorCount: z.number().int().min(2).max(256).default(128),
    dither: z.boolean().default(false),
    targetMaxBytes: z.number().int().positive().max(100 * 1024 * 1024).nullable().default(128 * 1024),
    clipOrder: z.array(idSchema).max(500).default([]),
  }).strict(),
  ...presentationField,
}).strict();
const stitchConfigSchema = z.object({
  parameters: z.object({
    repeat: z.number().int().min(1).max(3).default(1),
    stripAudio: z.boolean().default(false),
    clipOrder: z.array(idSchema).max(500).default([]),
  }).strict(),
  ...presentationField,
}).strict();
const trimConfigSchema = z.object({
  parameters: z.object({
    startMs: z.number().int().min(0).max(600_000).default(0),
    endMs: z.number().int().min(1).max(600_000).default(5_000),
    stripAudio: z.boolean().default(false),
  }).strict().refine((parameters) => parameters.endMs > parameters.startMs, {
    message: "endMs must be greater than startMs",
    path: ["endMs"],
  }),
  ...presentationField,
}).strict();
const frameGrabConfigSchema = z.object({
  parameters: z.object({
    position: z.enum(["first", "last"]).default("first"),
  }).strict(),
  ...presentationField,
}).strict();
const easeCurveConfigSchema = z.object({
  parameters: z.object({
    outputDurationMs: z.number().int().min(100).max(600_000).default(1_500),
    easingPreset: z.enum([
      "linear",
      "easeInQuad",
      "easeOutQuad",
      "easeInOutQuad",
      "easeInCubic",
      "easeOutCubic",
      "easeInOutCubic",
      "easeInSine",
      "easeOutSine",
      "easeInOutSine",
      "easeInExpo",
      "easeOutExpo",
      "easeInOutExpo",
    ]).nullable().default("easeInOutSine"),
    bezier: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]).default([0.42, 0, 0.58, 1]),
  }).strict(),
  ...presentationField,
}).strict();
const outputConfigSchema = z
  .object({
    mediaType: z.enum(["image", "audio", "video"]).nullable(),
    excludedAssetIds: z.array(idSchema).max(2_000).default([]),
    ...presentationField,
  })
  .strict();

const input = (
  id: string,
  valueType: PortValueType,
  options: Partial<Omit<PortDefinition, "id" | "direction" | "valueType">> = {},
): PortDefinition => ({
  id,
  direction: "input",
  valueType,
  required: false,
  edgeCardinality: "one",
  valueShape: "single",
  ordered: false,
  minConnections: 0,
  maxConnections: 1,
  ...options,
});

const output = (
  id: string,
  valueType: PortValueType,
  options: Partial<Omit<PortDefinition, "id" | "direction" | "valueType">> = {},
): PortDefinition => ({
  id,
  direction: "output",
  valueType,
  required: false,
  edgeCardinality: "many",
  valueShape: "single",
  ordered: false,
  minConnections: 0,
  maxConnections: null,
  ...options,
});

const imageMime = ["image/*"] as const;
const audioMime = ["audio/*"] as const;
const videoMime = ["video/*"] as const;

function definition(
  kind: CanonicalNodeKind,
  configSchema: NodeDefinition["configSchema"],
  ports: readonly PortDefinition[],
  executionMode: NodeExecutionMode = "none",
): NodeDefinition {
  return { kind, configVersion: 1, configSchema, ports, executionMode };
}

export const canonicalNodeRegistry: Readonly<Record<CanonicalNodeKind, NodeDefinition>> = {
  "input.image": definition("input.image", assetInputConfigSchema, [
    input("reference", "image", { acceptedMimeTypes: imageMime }),
    output("image", "image", { acceptedMimeTypes: imageMime }),
  ]),
  "input.audio": definition("input.audio", assetInputConfigSchema, [
    input("audio", "audio", { acceptedMimeTypes: audioMime }),
    output("audio", "audio", { acceptedMimeTypes: audioMime }),
  ]),
  "input.video": definition("input.video", assetInputConfigSchema, [
    input("video", "video", { acceptedMimeTypes: videoMime }),
    output("video", "video", { acceptedMimeTypes: videoMime }),
  ]),
  "input.prompt": definition("input.prompt", promptInputConfigSchema, [
    input("text", "text"),
    output("text", "text"),
  ]),
  "process.promptConstructor": definition("process.promptConstructor", z.object({ template: z.string().max(20_000), ...presentationField }).strict(), [
    input("text", "text", { edgeCardinality: "many", maxConnections: null, ordered: true }),
    output("text", "text"),
  ]),
  "generate.image": definition(
    "generate.image",
    generationConfigSchema,
    [
      input("prompt", "text"),
      input("primary", "image", {
        acceptedMimeTypes: imageMime,
        requiredCapabilities: ["image_input"],
      }),
      input("references", "image", {
        edgeCardinality: "many",
        valueShape: "ordered-list",
        ordered: true,
        maxConnections: null,
        acceptedMimeTypes: imageMime,
        requiredCapabilities: ["image_reference"],
      }),
      output("image", "image", { acceptedMimeTypes: imageMime }),
    ],
    "server-generation",
  ),
  "generate.audio": definition(
    "generate.audio",
    generationConfigSchema,
    [input("prompt", "text"), output("audio", "audio", { acceptedMimeTypes: audioMime })],
    "server-generation",
  ),
  "generate.video": definition(
    "generate.video",
    generationConfigSchema,
    [
      input("prompt", "text"),
      input("initImage", "image", {
        acceptedMimeTypes: imageMime,
        requiredCapabilities: ["image_input"],
      }),
      output("video", "video", { acceptedMimeTypes: videoMime }),
    ],
    "server-generation",
  ),
  "edit.image.annotation": definition(
    "edit.image.annotation",
    annotationConfigSchema,
    [
      input("image", "image", { required: true, minConnections: 1, acceptedMimeTypes: imageMime }),
      output("image", "image", { acceptedMimeTypes: imageMime }),
    ],
    "browser-operation",
  ),
  "edit.image.resize": definition(
    "edit.image.resize",
    resizeConfigSchema,
    [
      input("image", "image", { required: true, minConnections: 1, acceptedMimeTypes: imageMime }),
      output("image", "image", { acceptedMimeTypes: imageMime }),
    ],
    "browser-operation",
  ),
  "edit.image.removeBackground": definition(
    "edit.image.removeBackground",
    removeBackgroundConfigSchema,
    [
      input("image", "image", {
        required: true,
        minConnections: 1,
        acceptedMimeTypes: imageMime,
        requiredCapabilities: ["background_removal"],
      }),
      output("image", "image", { acceptedMimeTypes: imageMime }),
    ],
    "server-operation",
  ),
  "edit.image.splitGrid": definition(
    "edit.image.splitGrid",
    splitGridConfigSchema,
    [
      input("image", "image", { required: true, minConnections: 1, acceptedMimeTypes: imageMime }),
      output("images", "image", {
        valueShape: "ordered-list",
        ordered: true,
        acceptedMimeTypes: imageMime,
      }),
    ],
    "browser-operation",
  ),
  "edit.image.gif": definition(
    "edit.image.gif",
    gifConfigSchema,
    [
      input("frames", "image", {
        required: true,
        edgeCardinality: "many",
        valueShape: "ordered-list",
        ordered: true,
        minConnections: 1,
        maxConnections: null,
        acceptedMimeTypes: imageMime,
      }),
      output("image", "image", { acceptedMimeTypes: ["image/gif"] }),
    ],
    "browser-operation",
  ),
  "edit.video.stitch": definition(
    "edit.video.stitch",
    stitchConfigSchema,
    [
      input("clips", "video", {
        required: true,
        edgeCardinality: "many",
        valueShape: "ordered-list",
        ordered: true,
        minConnections: 2,
        maxConnections: null,
        acceptedMimeTypes: videoMime,
        requiredCapabilities: ["video_encode", "video_mux"],
      }),
      input("soundtrack", "audio", { acceptedMimeTypes: audioMime }),
      output("video", "video", { acceptedMimeTypes: videoMime }),
    ],
    "browser-operation",
  ),
  "edit.video.trim": definition(
    "edit.video.trim",
    trimConfigSchema,
    [
      input("video", "video", {
        required: true,
        minConnections: 1,
        acceptedMimeTypes: videoMime,
        requiredCapabilities: ["video_encode", "video_mux"],
      }),
      output("video", "video", { acceptedMimeTypes: videoMime }),
    ],
    "browser-operation",
  ),
  "edit.video.frameGrab": definition(
    "edit.video.frameGrab",
    frameGrabConfigSchema,
    [
      input("video", "video", { required: true, minConnections: 1, acceptedMimeTypes: videoMime }),
      output("image", "image", { acceptedMimeTypes: ["image/png"] }),
    ],
    "browser-operation",
  ),
  "edit.video.easeCurve": definition(
    "edit.video.easeCurve",
    easeCurveConfigSchema,
    [
      input("video", "video", {
        required: true,
        minConnections: 1,
        acceptedMimeTypes: videoMime,
        requiredCapabilities: ["video_encode", "video_mux"],
      }),
      output("video", "video", { acceptedMimeTypes: videoMime }),
      input("settings", "settings"),
      output("settings", "settings"),
    ],
    "browser-operation",
  ),
  "output.single": definition("output.single", outputConfigSchema, [
    input("image", "image", { acceptedMimeTypes: imageMime }),
    input("video", "video", { acceptedMimeTypes: videoMime }),
    input("audio", "audio", { acceptedMimeTypes: audioMime }),
  ]),
  "output.gallery": definition("output.gallery", outputConfigSchema, [
    input("image", "image", {
      edgeCardinality: "many", valueShape: "ordered-list", ordered: true,
      maxConnections: null, acceptedMimeTypes: imageMime, homogeneous: true,
    }),
    input("video", "video", {
      edgeCardinality: "many", valueShape: "ordered-list", ordered: true,
      maxConnections: null, acceptedMimeTypes: videoMime, homogeneous: true,
    }),
    input("audio", "audio", {
      edgeCardinality: "many", valueShape: "ordered-list", ordered: true,
      maxConnections: null, acceptedMimeTypes: audioMime, homogeneous: true,
    }),
  ]),
  "inspect.imageCompare": definition("inspect.imageCompare", emptyConfigSchema, [
    input("before", "image", { required: true, minConnections: 1, acceptedMimeTypes: imageMime }),
    input("after", "image", { required: true, minConnections: 1, acceptedMimeTypes: imageMime }),
  ]),
};

export function findNodeDefinition(kind: string) {
  return canonicalNodeKindSchema.safeParse(kind).success
    ? canonicalNodeRegistry[kind as CanonicalNodeKind]
    : null;
}

export function findPortDefinition(kind: string, portId: string, direction: PortDefinition["direction"]) {
  return findNodeDefinition(kind)?.ports.find(
    (port) => port.id === portId && port.direction === direction,
  );
}

export function validateNodeConfig(kind: string, configVersion: number, config: unknown) {
  const definition = findNodeDefinition(kind);
  if (!definition) return { supported: false as const, reason: "UNKNOWN_NODE_KIND" as const };
  if (definition.configVersion !== configVersion) {
    return { supported: false as const, reason: "UNKNOWN_CONFIG_VERSION" as const };
  }
  const parsed = definition.configSchema.safeParse(config);
  if (!parsed.success) {
    return {
      supported: false as const,
      reason: "INVALID_NODE_CONFIG" as const,
      details: parsed.error.flatten(),
    };
  }
  return { supported: true as const, config: parsed.data };
}
