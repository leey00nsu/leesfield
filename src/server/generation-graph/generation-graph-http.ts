import { buildErrorResponse, buildInvalidRequestResponse } from "@/server/http/response";

import {
  GenerationGraphInputError,
  GenerationGraphNotFoundError,
  GenerationGraphActiveExecutionError,
  GenerationGraphVersionConflictError,
} from "./generation-graph-errors";

export function buildGenerationGraphKnownErrorResponse(error: unknown) {
  if (error instanceof GenerationGraphInputError) {
    return buildInvalidRequestResponse(error.details);
  }
  if (error instanceof GenerationGraphNotFoundError) {
    return buildErrorResponse("GRAPH_NOT_FOUND", 404);
  }
  if (error instanceof GenerationGraphVersionConflictError) {
    return buildErrorResponse("GRAPH_VERSION_CONFLICT", 409);
  }
  if (error instanceof GenerationGraphActiveExecutionError) {
    return buildErrorResponse("GRAPH_ACTIVE_EXECUTION", 409);
  }
  return null;
}
