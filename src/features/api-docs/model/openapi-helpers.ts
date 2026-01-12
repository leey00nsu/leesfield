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

function extractRequestInfo(
  requestBody: OpenApiOperation["requestBody"],
  document: OpenApiDocument,
): ApiRequestInfo | null {
  const body = requestBody as OpenApiRequestBody | undefined;
  if (!body || !body.content) return null;
  const jsonContent = body.content["application/json"];
  if (!jsonContent) return null;

  const schema = resolveSchema(jsonContent.schema, document);
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
