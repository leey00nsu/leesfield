import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { modelOptions } from "@/features/image-generation/model/image-generation-schema";
import { videoModelOptions } from "@/features/video-generation/model/video-generation-schema";
import { videoModelMeta } from "@/features/video-generation/model/video-generation-schema";
import { modelCatalog } from "@/features/model-management/model/model-catalog";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
});

const errorResponseSchema = z.object({
  message: z.string(),
  errors: z
    .array(
      z.object({
        field: z.string(),
        messages: z.array(z.string()),
      }),
    )
    .optional(),
});

const generationResponseSchema = z.object({
  requestId: z.string(),
  status: z.string(),
  progress: z.number(),
});

const imageResultSchema = z.object({
  images: z.array(
    z.object({
      url: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
    }),
  ),
});

const videoResultSchema = z.object({
  videos: z.array(
    z.object({
      url: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      durationSec: z.number().optional(),
    }),
  ),
});

const imageStatusResponseSchema = z.object({
  requestId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number(),
  result: imageResultSchema.optional(),
  errorMessage: z.string().optional(),
});

const videoStatusResponseSchema = z.object({
  requestId: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  progress: z.number(),
  result: videoResultSchema.optional(),
  errorMessage: z.string().optional(),
});

const modelResponseSchema = z.object({
  items: z.array(z.unknown()),
});

export type OpenApiTranslations = {
  infoDescription?: string;
  tags?: {
    images?: string;
    videos?: string;
    models?: string;
  };
  paths?: {
    imageGeneration?: string;
    videoGeneration?: string;
    imageStatus?: string;
    videoStatus?: string;
    models?: string;
  };
};

const imageGenerationFormDataSchema = z.object({
  prompt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  initImages: z
    .array(z.string().openapi({ type: "string", format: "binary" }))
    .optional(),
  model: z.enum(modelOptions),
  imageCount: z.number().int(),
  steps: z.number().int(),
  seed: z.string().optional(),
});

const videoGenerationFormDataBaseSchema = z.object({
  prompt: z.string(),
  aspectRatio: z.string(),
  resolution: z.number().int(),
  durationSec: z.number(),
  fps: z.number().int(),
  steps: z.number().int(),
  guidanceScale: z.number(),
  seed: z.string().optional(),
});

const videoInitImageSchema = z
  .string()
  .openapi({ type: "string", format: "binary" });

const videoInitImageRequiredModels = videoModelOptions.filter(
  (model) => videoModelMeta[model]?.supportsInitImage,
);
const videoInitImageOptionalModels = videoModelOptions.filter(
  (model) => !videoModelMeta[model]?.supportsInitImage,
);

const videoFormVariants = [
  ...videoInitImageRequiredModels.map((model) =>
    videoGenerationFormDataBaseSchema.extend({
      model: z.literal(model),
      initImage: videoInitImageSchema,
    }),
  ),
  ...videoInitImageOptionalModels.map((model) =>
    videoGenerationFormDataBaseSchema.extend({
      model: z.literal(model),
      initImage: videoInitImageSchema.optional(),
    }),
  ),
];

const videoGenerationFormDataSchema = z.discriminatedUnion(
  "model",
  videoFormVariants as [typeof videoFormVariants[number], ...typeof videoFormVariants],
);

registry.register("ErrorResponse", errorResponseSchema);
registry.register("GenerationResponse", generationResponseSchema);
registry.register("ModelResponse", modelResponseSchema);

registry.registerPath({
  method: "post",
  path: "/api/external/image-generation",
  tags: ["Images"],
  description: "Creates an image generation request.",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: imageGenerationFormDataSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: generationResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/external/video-generation",
  tags: ["Videos"],
  description: "Creates a video generation request.",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: videoGenerationFormDataSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: generationResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/external/image-generation/{requestId}",
  tags: ["Images"],
  description: "Fetches the image generation result.",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      requestId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: imageStatusResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/external/video-generation/{requestId}",
  tags: ["Videos"],
  description: "Fetches the video generation result.",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      requestId: z.string(),
    }),
  },
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: videoStatusResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    404: {
      description: "Not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/external/models",
  tags: ["Models"],
  description: "Fetches available generation models.",
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: modelResponseSchema,
          example: { items: modelCatalog },
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorResponseSchema,
        },
      },
    },
  },
});

export function getOpenApiDocument(translations?: OpenApiTranslations) {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const tags = {
    images: translations?.tags?.images ?? "Image generation",
    videos: translations?.tags?.videos ?? "Video generation",
    models: translations?.tags?.models ?? "Model catalog",
  };
  const paths = {
    imageGeneration:
      translations?.paths?.imageGeneration ??
      "Creates an image generation request.",
    videoGeneration:
      translations?.paths?.videoGeneration ??
      "Creates a video generation request.",
    imageStatus:
      translations?.paths?.imageStatus ??
      "Fetches the image generation result.",
    videoStatus:
      translations?.paths?.videoStatus ??
      "Fetches the video generation result.",
    models:
      translations?.paths?.models ??
      "Fetches available generation models.",
  };

  const document = generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "leesfield API",
      version: "v1",
      description:
        translations?.infoDescription ??
        "External REST API documentation for leesfield. Provides image/video generation and model listing.",
    },
    tags: [
      { name: "Images", description: tags.images },
      { name: "Videos", description: tags.videos },
      { name: "Models", description: tags.models },
    ],
  });

  const updateDescription = (
    path: string,
    method: "get" | "post",
    description: string,
  ) => {
    const pathItem = document.paths?.[path];
    if (!pathItem) return;
    const operation = pathItem[method];
    if (operation) {
      operation.description = description;
    }
  };

  updateDescription(
    "/api/external/image-generation",
    "post",
    paths.imageGeneration,
  );
  updateDescription(
    "/api/external/video-generation",
    "post",
    paths.videoGeneration,
  );
  updateDescription(
    "/api/external/image-generation/{requestId}",
    "get",
    paths.imageStatus,
  );
  updateDescription(
    "/api/external/video-generation/{requestId}",
    "get",
    paths.videoStatus,
  );
  updateDescription("/api/external/models", "get", paths.models);

  return document;
}
