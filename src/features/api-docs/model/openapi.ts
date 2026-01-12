import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { modelOptions } from "@/features/image-generation/model/image-generation-schema";
import { videoModelOptions } from "@/features/video-generation/model/video-generation-schema";
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

const videoGenerationFormDataSchema = z.object({
  prompt: z.string(),
  initImage: z
    .string()
    .openapi({ type: "string", format: "binary" })
    .optional(),
  model: z.enum(videoModelOptions),
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
  description: "이미지 생성 요청을 생성합니다.",
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
  description: "비디오 생성 요청을 생성합니다.",
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
  description: "이미지 생성 결과를 조회합니다.",
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
  description: "비디오 생성 결과를 조회합니다.",
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
  description: "사용 가능한 생성 모델 목록을 조회합니다.",
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

export function getOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "leesfield API",
      version: "v1",
      description:
        "leesfield 외부 REST API 문서입니다. 이미지/비디오 생성과 모델 조회를 제공합니다.",
    },
    tags: [
      { name: "Images", description: "이미지 생성" },
      { name: "Videos", description: "비디오 생성" },
      { name: "Models", description: "모델 목록" },
    ],
  });
}
