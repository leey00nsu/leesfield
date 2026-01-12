import type {
  OpenApiDocument,
  OpenApiMediaTypeObject,
  OpenApiOperation,
  OpenApiRequestBody,
  OpenApiResponse,
  OpenApiSchema,
} from "./openapi-types";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export type ApiSchemaProperty = {
  name: string;
  typeLabel: string;
  description?: string;
  required: boolean;
};

export type ApiRequestInfo = {
  schema: OpenApiSchema | null;
  properties: ApiSchemaProperty[] | null;
};

export type ApiResponseInfo = {
  status: string;
  description?: string;
  schema: OpenApiSchema | null;
  example?: unknown;
};

export type ApiOperation = {
  id: string;
  method: string;
  path: string;
  description?: string;
  request: ApiRequestInfo | null;
  responses: ApiResponseInfo[];
};

export type ApiSection = {
  id: string;
  title: string;
  description?: string;
  operations: ApiOperation[];
};

const HTTP_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

export function buildApiSections(document: OpenApiDocument): ApiSection[] {
  const tagDescriptions = new Map(
    (document.tags ?? []).map((tag) => [tag.name, tag.description]),
  );
  const sections = new Map<string, ApiSection>();

  Object.entries(document.paths ?? {}).forEach(([path, pathItem]) => {
    HTTP_METHODS.forEach((method) => {
      const operation = (pathItem as Record<string, OpenApiOperation>)[method];
      if (!operation) return;

      const tag = operation.tags?.[0] ?? "General";
      const sectionId = slugifyTag(tag);
      const section = sections.get(tag) ?? {
        id: sectionId,
        title: tag,
        description: tagDescriptions.get(tag),
        operations: [],
      };

      section.operations.push({
        id: operation.operationId ?? `${method}-${path}`,
        method: method.toUpperCase(),
        path,
        description: operation.description ?? operation.summary,
        request: extractRequestInfo(operation.requestBody, document),
        responses: extractResponses(operation.responses, document),
      });

      sections.set(tag, section);
    });
  });

  const orderedTags = (document.tags ?? [])
    .map((tag) => tag.name)
    .filter((tag) => sections.has(tag));
  const remainingTags = Array.from(sections.keys()).filter(
    (tag) => !orderedTags.includes(tag),
  );

  const orderedSections = [...orderedTags, ...remainingTags].map(
    (tag) => sections.get(tag)!,
  );

  orderedSections.forEach((section) => {
    section.operations.sort((a, b) => a.path.localeCompare(b.path));
  });

  return orderedSections;
}

export function slugifyTag(tag: string) {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatSchemaType(
  schema: OpenApiSchema | null,
  document?: OpenApiDocument,
) {
  if (!schema) return "object";
  if (schema.format === "binary") return "file";
  if (schema.enum) return "enum";
  if (schema.type === "array") {
    const itemType = formatSchemaType(
      resolveSchema(schema.items, document ?? null),
      document,
    );
    return `array<${itemType}>`;
  }
  return schema.type ?? "object";
}

export function buildExampleFromSchema(
  schema: OpenApiSchema | null,
  document?: OpenApiDocument | null,
  hintKey?: string,
): unknown | null {
  const resolved = resolveSchema(schema, document ?? null);
  if (!resolved) return null;
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.format === "binary") {
    const key = hintKey?.toLowerCase() ?? "";
    if (key.includes("video")) return "sample.mp4";
    if (key.includes("image") || key.includes("init")) return "sample.png";
    return "sample.bin";
  }
  if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
    return resolved.enum[0];
  }
  if (resolved.oneOf && resolved.oneOf.length > 0) {
    return buildExampleFromSchema(resolved.oneOf[0], document, hintKey);
  }
  if (resolved.anyOf && resolved.anyOf.length > 0) {
    return buildExampleFromSchema(resolved.anyOf[0], document, hintKey);
  }
  if (resolved.allOf && resolved.allOf.length > 0) {
    const merged = resolved.allOf.reduce<Record<string, unknown>>(
      (acc, item) => {
        const example = buildExampleFromSchema(item, document, hintKey);
        if (example && typeof example === "object" && !Array.isArray(example)) {
          Object.assign(acc, example);
        }
        return acc;
      },
      {},
    );
    return merged;
  }

  switch (resolved.type) {
    case "string":
      return buildStringExample(hintKey);
    case "number":
    case "integer":
      return buildNumberExample(hintKey);
    case "boolean":
      return true;
    case "array": {
      const itemExample = buildExampleFromSchema(
        resolved.items ?? null,
        document,
        hintKey,
      );
      return itemExample !== null ? [itemExample] : [];
    }
    case "object": {
      if (!resolved.properties) return {};
      return Object.fromEntries(
        Object.entries(resolved.properties).map(([key, value]) => [
          key,
          buildExampleFromSchema(value, document, key) ?? null,
        ]),
      );
    }
    default:
      return {};
  }
}

function buildStringExample(hintKey?: string) {
  const key = hintKey?.toLowerCase() ?? "";
  if (key.includes("id")) return `${hintKey ?? "id"}_01`;
  if (key.includes("status")) return "processing";
  if (key.includes("email")) return "admin@leesfield.ai";
  if (key.includes("model")) return "image-core";
  if (key.includes("prompt")) return "샘플 프롬프트";
  if (key.includes("url")) return "https://cdn.leesfield.ai/sample.png";
  if (key.includes("label")) return "샘플";
  if (key.includes("name")) return "샘플";
  if (key.includes("type")) return "image";
  if (key.includes("version")) return "v1";
  if (key.includes("message")) return "OK";
  if (key.includes("token") || key.includes("key")) return "lf_live_****";
  if (key.includes("created") || key.includes("updated")) {
    return "2026-01-12T00:00:00Z";
  }
  if (key.includes("seed")) return "42";
  return "sample";
}

function buildNumberExample(hintKey?: string) {
  const key = hintKey?.toLowerCase() ?? "";
  if (key.includes("width")) return 1024;
  if (key.includes("height")) return 1024;
  if (key.includes("progress")) return 42;
  if (key.includes("fps")) return 30;
  if (key.includes("steps")) return 30;
  if (key.includes("count")) return 1;
  if (key.includes("duration")) return 5;
  if (key.includes("resolution")) return 1080;
  return 1;
}

function extractRequestInfo(
  requestBody: OpenApiOperation["requestBody"],
  document: OpenApiDocument,
): ApiRequestInfo | null {
  const body = requestBody as OpenApiRequestBody | undefined;
  if (!body || !body.content) return null;
  const preferredContentTypes = [
    "multipart/form-data",
    "application/json",
    "application/x-www-form-urlencoded",
  ];
  const preferredType = preferredContentTypes.find(
    (contentType) => body.content?.[contentType],
  );
  const fallbackType = Object.keys(body.content)[0];
  const contentType = preferredType ?? fallbackType;
  if (!contentType) return null;
  const content = body.content[contentType];
  if (!content) return null;

  const schema = resolveSchema(content.schema, document);
  return {
    schema,
    properties: extractSchemaProperties(schema, document),
  };
}

function extractResponses(
  responses: Record<string, OpenApiResponse> | undefined,
  document: OpenApiDocument,
): ApiResponseInfo[] {
  if (!responses) return [];

  const responseEntries = Object.entries(responses).map(
    ([status, response]) => {
      const content = response.content?.["application/json"];
      const schema = resolveSchema(content?.schema, document);
      const example = extractExample(content, schema);

      return {
        status,
        description: response.description,
        schema,
        example,
      };
    },
  );

  return responseEntries.sort((a, b) => {
    const aNumber = Number(a.status);
    const bNumber = Number(b.status);
    if (Number.isNaN(aNumber) && Number.isNaN(bNumber)) {
      return a.status.localeCompare(b.status);
    }
    if (Number.isNaN(aNumber)) return 1;
    if (Number.isNaN(bNumber)) return -1;
    return aNumber - bNumber;
  });
}

function extractSchemaProperties(
  schema: OpenApiSchema | null,
  document: OpenApiDocument,
): ApiSchemaProperty[] | null {
  const resolved = resolveSchema(schema, document);
  if (!resolved || resolved.type !== "object" || !resolved.properties) {
    return null;
  }

  const required = new Set(resolved.required ?? []);
  return Object.entries(resolved.properties).map(([name, property]) => {
    const propertySchema = resolveSchema(property, document);
    return {
      name,
      typeLabel: formatSchemaType(propertySchema, document),
      description: propertySchema?.description,
      required: required.has(name),
    };
  });
}

function resolveSchema(
  schema: OpenApiSchema | null | undefined,
  document: OpenApiDocument | null,
): OpenApiSchema | null {
  if (!schema) return null;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    if (!name) return schema;
    return document?.components?.schemas?.[name] ?? schema;
  }
  if (schema.allOf && schema.allOf.length > 0) {
    return resolveSchema(schema.allOf[0], document) ?? schema;
  }
  return schema;
}

function extractExample(
  content: OpenApiMediaTypeObject | undefined,
  schema: OpenApiSchema | null,
) {
  if (!content) return schema?.example;
  if (content.example !== undefined) return content.example;
  if (content.examples) {
    const firstExample = Object.values(content.examples)[0];
    if (firstExample?.value !== undefined) return firstExample.value;
  }
  return schema?.example;
}
