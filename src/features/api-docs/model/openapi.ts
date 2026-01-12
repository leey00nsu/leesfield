import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { imageGenerationOpenApiSchema } from "@/features/image-generation/model/image-generation-schema";
import { videoGenerationOpenApiSchema } from "@/features/video-generation/model/video-generation-schema";
import { modelCatalog } from "@/features/model-management/model/model-catalog";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

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

const modelResponseSchema = z.object({
  items: z.array(z.unknown()),
});

registry.register("ErrorResponse", errorResponseSchema);
registry.register("GenerationResponse", generationResponseSchema);
registry.register("ModelResponse", modelResponseSchema);

registry.registerPath({
  method: "post",
  path: "/api/external/image-generation",
  tags: ["Images"],
  description: "Create an image generation request",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: imageGenerationOpenApiSchema,
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
  description: "Create a video generation request",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: videoGenerationOpenApiSchema,
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
  path: "/api/external/models",
  tags: ["Models"],
  description: "List available generation models",
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
      title: "lee's field API",
      version: "v1",
      description:
        "External REST API for image and video generation.",
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
      },
    },
    tags: [
      { name: "Images", description: "Image generation" },
      { name: "Videos", description: "Video generation" },
      { name: "Models", description: "Model catalog" },
    ],
  });
}
