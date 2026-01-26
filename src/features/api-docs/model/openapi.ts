import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
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
  errors: z.unknown().optional(),
  requestId: z.string().optional(),
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
  model: z
    .string()
    .openapi({
      description: "Use /api/external/models to fetch available model keys.",
    }),
  imageCount: z.number().int(),
  steps: z.number().int(),
  modeChoice: z.string().optional(),
  guidanceScale: z.number().optional(),
  promptUpsampling: z.boolean().optional(),
  seed: z.string().optional(),
});

const videoGenerationFormDataSchema = z.object({
  prompt: z.string(),
  initImage: z
    .string()
    .optional()
    .openapi({ type: "string", format: "binary" }),
  model: z
    .string()
    .openapi({
      description: "Use /api/external/models to fetch available model keys.",
    }),
  aspectRatio: z.string(),
  resolution: z.number().int(),
  durationSec: z.number(),
  fps: z.number().int(),
  steps: z.number().int(),
  guidanceScale: z.number(),
  seed: z.string().optional(),
});

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
          examples: {
            invalidRequest: {
              value: {
                message: "INVALID_REQUEST",
                errors: {
                  formErrors: [],
                  fieldErrors: {
                    prompt: ["프롬프트를 입력해주세요."],
                  },
                },
              },
            },
            invalidFormData: {
              value: {
                message: "INVALID_FORM_DATA",
              },
            },
          },
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
          examples: {
            invalidRequest: {
              value: {
                message: "INVALID_REQUEST",
                errors: {
                  formErrors: [],
                  fieldErrors: {
                    prompt: ["프롬프트를 입력해주세요."],
                  },
                },
              },
            },
            invalidFormData: {
              value: {
                message: "INVALID_FORM_DATA",
              },
            },
          },
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/external/image-generation/{requestId}",
  tags: ["Images"],
  description: "Fetches image generation status.",
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
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
          example: {
            message: "INVALID_REQUEST",
          },
        },
      },
    },
    404: {
      description: "Not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
          example: {
            message: "NOT_FOUND",
          },
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/external/video-generation/{requestId}",
  tags: ["Videos"],
  description: "Fetches video generation status.",
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
    400: {
      description: "Invalid request",
      content: {
        "application/json": {
          schema: errorResponseSchema,
          example: {
            message: "INVALID_REQUEST",
          },
        },
      },
    },
    404: {
      description: "Not found",
      content: {
        "application/json": {
          schema: errorResponseSchema,
          example: {
            message: "NOT_FOUND",
          },
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
          example: {
            message: "API_KEY_REQUIRED",
          },
        },
      },
    },
    403: {
      description: "Forbidden",
      content: {
        "application/json": {
          schema: errorResponseSchema,
          examples: {
            invalidApiKey: {
              value: {
                message: "INVALID_API_KEY",
              },
            },
            revokedApiKey: {
              value: {
                message: "API_KEY_REVOKED",
              },
            },
          },
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
      "Creates an image generation request. Model keys are available via /api/external/models.",
    videoGeneration:
      translations?.paths?.videoGeneration ??
      "Creates a video generation request. Model keys are available via /api/external/models.",
    imageStatus:
      translations?.paths?.imageStatus ??
      "Fetches image generation status.",
    videoStatus:
      translations?.paths?.videoStatus ??
      "Fetches video generation status.",
    models:
      translations?.paths?.models ??
      "Fetches available generation models.",
  };

  const result = generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "LeesField API",
      version: "1.0.0",
      description:
        translations?.infoDescription ??
        "This document describes the LeesField API.",
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
    description?: string,
  ) => {
    if (!description) return;
    result.paths[path] = result.paths[path] ?? {};
    result.paths[path][method] = {
      ...result.paths[path][method],
      description,
    };
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

  return result;
}
