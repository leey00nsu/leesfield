import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";

const registry = new OpenAPIRegistry();

const errorResponseSchema = z.object({
  message: z.string(),
  errors: z.unknown().optional(),
});

const generationResponseSchema = z.object({
  requestId: z.string(),
  status: z.string(),
  progress: z.number(),
});

registry.register("ErrorResponse", errorResponseSchema);
registry.register("GenerationResponse", generationResponseSchema);

registry.registerPath({
  method: "post",
  path: "/api/image-generation",
  tags: ["Images"],
  description: "Create an image generation request",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: imageGenerationSchema,
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
  path: "/api/video-generation",
  tags: ["Videos"],
  description: "Create a video generation request",
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: videoGenerationSchema,
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
    tags: [
      { name: "Images", description: "Image generation" },
      { name: "Videos", description: "Video generation" },
    ],
  });
}
