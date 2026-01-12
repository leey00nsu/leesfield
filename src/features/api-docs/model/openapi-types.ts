export type OpenApiSchema = {
  $ref?: string;
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  required?: string[];
  enum?: unknown[];
  oneOf?: OpenApiSchema[];
  allOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  example?: unknown;
} & Record<string, unknown>;

export type OpenApiMediaTypeObject = {
  schema?: OpenApiSchema;
  example?: unknown;
  examples?: Record<string, { value?: unknown } & Record<string, unknown>>;
} & Record<string, unknown>;

export type OpenApiRequestBody = {
  description?: string;
  required?: boolean;
  content?: Record<string, OpenApiMediaTypeObject>;
  schema?: OpenApiSchema;
} & Record<string, unknown>;

export type OpenApiResponse = {
  description?: string;
  content?: Record<string, OpenApiMediaTypeObject>;
} & Record<string, unknown>;

export type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  requestBody?: OpenApiRequestBody | ReferenceObject;
  responses?: Record<string, OpenApiResponse>;
} & Record<string, unknown>;

export type OpenApiPathItem = {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
} & Record<string, unknown>;

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  tags?: Array<{
    name: string;
    description?: string;
  }>;
  paths: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
    requestBodies?: Record<string, OpenApiRequestBody>;
  };
};

export type ReferenceObject = {
  $ref: string;
};
