import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  apiKeyHeader,
  apiPaths,
  errorResponseSchema,
  externalGenerationRequestSchema,
  externalGenerationMultipartSchema,
  externalGenerationResponseSchema,
  externalGenerationStatusSchema,
  externalModelsResponseSchema,
  externalModelInputResponseSchema,
  modelQuerySchema,
} from "@/shared/api/external-contract";

export type OpenApiTranslations = {
  infoDescription?: string;
  tags?: { generations?: string; models?: string };
  paths?: {
    generation?: string;
    status?: string;
    models?: string;
    modelSchema?: string;
  };
};

/** Public protocol only. Never load instance catalog data into this document. */
export function getOpenApiDocument(translations?: OpenApiTranslations) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    in: "header",
    name: apiKeyHeader,
  });
  const security = [{ ApiKeyAuth: [] }];
  const json = (schema: z.ZodType) => ({ "application/json": { schema } });
  const error = (description: string) => ({
    description,
    content: json(errorResponseSchema),
  });
  const authErrors = {
    401: error("API key required"),
    403: error("Invalid or revoked API key"),
  };
  registry.registerPath({
    method: "post",
    path: apiPaths.generations,
    tags: ["Generations"],
    security,
    description:
      translations?.paths?.generation ??
      "Create an image, video or audio job. Query the authenticated model list and its input schema first. All model inputs belong in dynamicParams.",
    request: {
      body: {
        required: true,
        content: {
          "application/json": { schema: externalGenerationRequestSchema },
          "multipart/form-data": { schema: externalGenerationMultipartSchema },
        },
      },
    },
    responses: {
      200: {
        description: "Job accepted",
        content: json(externalGenerationResponseSchema),
      },
      ...authErrors,
      400: error("Invalid model input or media type mismatch"),
      404: error("Model unavailable"),
      413: error("File exceeds upload limit"),
      415: error("Use application/json or multipart/form-data"),
      500: error("Generation submission failed"),
    },
  });
  registry.registerPath({
    method: "get",
    path: apiPaths.generations + "/{requestId}",
    tags: ["Generations"],
    security,
    description:
      translations?.paths?.status ??
      "Fetch the current API key owner's job status and results.",
    request: { params: z.object({ requestId: z.string().min(1) }) },
    responses: {
      200: {
        description: "Job status and media-specific result",
        content: json(externalGenerationStatusSchema),
      },
      ...authErrors,
      404: error("Job not found"),
    },
  });
  registry.registerPath({
    method: "get",
    path: apiPaths.models,
    tags: ["Models"],
    security,
    description:
      translations?.paths?.models ??
      "List active models available to the authenticated caller. Model data is not included in this public document.",
    request: { query: modelQuerySchema },
    responses: {
      200: {
        description: "Model summaries",
        content: json(externalModelsResponseSchema),
      },
      ...authErrors,
      400: error("Invalid query"),
    },
  });
  registry.registerPath({
    method: "get",
    path: apiPaths.modelSchema,
    tags: ["Models"],
    security,
    description:
      translations?.paths?.modelSchema ??
      "Fetch the selected model's dynamicParams JSON Schema and file fields. Send files as URL/data URL values, or file:<parameterName> multipart parts.",
    request: { params: z.object({ modelId: z.string().min(1) }) },
    responses: {
      200: {
        description: "Private model input schema",
        content: json(externalModelInputResponseSchema),
      },
      ...authErrors,
      404: error("Model unavailable"),
    },
  });
  const document = new OpenApiGeneratorV31(
    registry.definitions,
  ).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "leesfield API",
      version: "2.0.0",
      description: translations?.infoDescription,
    },
    tags: [
      { name: "Generations", description: translations?.tags?.generations },
      { name: "Models", description: translations?.tags?.models },
    ],
  });
  return { ...document, paths: document.paths ?? {} };
}
