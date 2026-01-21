import type {
  ContentObject,
  OpenAPIObject,
  OperationObject,
  PathItemObject,
  ReferenceObject as OpenApiReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from "openapi3-ts/oas30";

export type OpenApiDocument = OpenAPIObject;
export type OpenApiPathItem = PathItemObject;
export type OpenApiOperation = OperationObject;
export type OpenApiRequestBody = RequestBodyObject;
export type OpenApiResponse = ResponseObject;
export type OpenApiSchema = SchemaObject;
export type OpenApiMediaTypeObject = ContentObject[string];
export type ReferenceObject = OpenApiReferenceObject;
