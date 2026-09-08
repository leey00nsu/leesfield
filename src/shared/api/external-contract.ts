import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
extendZodWithOpenApi(z);

export const mediaTypes = ["image", "video", "audio"] as const;
export type GenerationMedia = (typeof mediaTypes)[number];
export const generationStatusSchema = z.enum([
  "pending",
  "processing",
  "uploading",
  "completed",
  "failed",
  "cancelled",
]);
export const generationResponseSchema = z.object({
  requestId: z.string(),
  status: generationStatusSchema,
  progress: z.number(),
});
export const errorResponseSchema = z.object({
  message: z.string(),
  errors: z.unknown().optional(),
  requestId: z.string().optional(),
});
const image = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});
const video = image.extend({ durationSec: z.number().optional() });
const audio = z.object({ url: z.string(), durationSec: z.number().optional() });
export const statusResponseSchemas = {
  image: generationResponseSchema.extend({
    result: z.object({ images: z.array(image) }).optional(),
    errorMessage: z.string().optional(),
  }),
  video: generationResponseSchema.extend({
    result: z.object({ videos: z.array(video) }).optional(),
    errorMessage: z.string().optional(),
  }),
  audio: generationResponseSchema.extend({
    result: z.object({ audios: z.array(audio) }).optional(),
    errorMessage: z.string().optional(),
  }),
};
export const modelQuerySchema = z.object({
  type: z.enum(mediaTypes).optional(),
  q: z.string().optional(),
});

export const apiPaths = {
  generations: "/api/external/generations",
  models: "/api/external/models",
  modelSchema: "/api/external/models/{modelId}/schema",
};
export const apiKeyHeader = "X-API-Key";
export const externalFilePrefix = "file:";
export const maxExternalFileBytes = 10 * 1024 * 1024;
export const externalGenerationRequestSchema = z
  .object({
    type: z.enum(mediaTypes),
    model: z
      .string()
      .trim()
      .min(1)
      .describe("Model ID from the authenticated model list."),
    dynamicParams: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
// OpenAPI 3.1 supports propertyNames; zod-to-openapi's metadata type also serves 3.0.
const multipartMetadata = {
  description: "Multipart envelope with model-declared file fields.",
  propertyNames: {
    anyOf: [
      { enum: Object.keys(externalGenerationRequestSchema.shape) },
      { pattern: "^" + externalFilePrefix + ".+" },
    ],
  },
};
export const externalGenerationMultipartSchema = externalGenerationRequestSchema
  .extend({
    dynamicParams: z
      .string()
      .optional()
      .describe(
        "JSON-encoded input values from the authenticated model schema. Files use file:<parameterName> parts, repeated for arrays; do not also set the same parameter in dynamicParams.",
      ),
  })
  .catchall(
    z.string().openapi({
      format: "binary",
      description:
        "File upload, at most " + maxExternalFileBytes + " bytes per file.",
    }),
  )
  .openapi(multipartMetadata);
export const externalGenerationResponseSchema = generationResponseSchema.extend(
  { type: z.enum(mediaTypes) },
);
export const externalGenerationStatusSchema = z.discriminatedUnion("type", [
  statusResponseSchemas.image.extend({ type: z.literal("image") }),
  statusResponseSchemas.video.extend({ type: z.literal("video") }),
  statusResponseSchemas.audio.extend({ type: z.literal("audio") }),
]);
export const externalModelSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(mediaTypes),
});
export const externalModelsResponseSchema = z.object({
  items: z.array(externalModelSummarySchema),
});
export const externalModelInputResponseSchema = z.object({
  model: externalModelSummarySchema,
  inputSchema: z
    .record(z.string(), z.unknown())
    .describe(
      "JSON Schema for this model's dynamicParams. x-step is measured from x-step-base.",
    ),
  files: z.array(
    z.object({
      name: z.string(),
      multiple: z.boolean(),
      multipartField: z.string(),
      maxBytes: z.number(),
    }),
  ),
});
