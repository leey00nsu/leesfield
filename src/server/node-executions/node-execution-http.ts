import {
  buildErrorResponse,
  buildInvalidRequestResponse,
  jsonWithNoStore,
} from "@/server/http/response";

import {
  NodeExecutionActiveError,
  NodeExecutionConfigError,
  NodeExecutionInputError,
  NodeExecutionInputResolutionError,
  NodeExecutionIdempotencyConflictError,
  NodeExecutionNodeNotFoundError,
  NodeExecutionNotFoundError,
  NodeExecutionProcessorUnavailableError,
  NodeExecutionQueueFullError,
  NodeExecutionStorageUnavailableError,
  NodeExecutionVersionConflictError,
} from "./node-execution-errors";

export function nodeExecutionErrorResponse(error: unknown) {
  if (error instanceof NodeExecutionInputError) {
    return buildInvalidRequestResponse(error.details);
  }
  if (error instanceof NodeExecutionConfigError) {
    return jsonWithNoStore(
      { message: error.code, errors: error.details },
      { status: 400 },
    );
  }
  if (error instanceof NodeExecutionInputResolutionError) {
    return jsonWithNoStore(
      { message: error.code, errors: error.details },
      { status: 400 },
    );
  }
  if (error instanceof NodeExecutionNodeNotFoundError) {
    return buildErrorResponse(error.code, 404);
  }
  if (error instanceof NodeExecutionNotFoundError) {
    return buildErrorResponse(error.code, 404);
  }
  if (error instanceof NodeExecutionVersionConflictError) {
    return buildErrorResponse(error.code, 409);
  }
  if (error instanceof NodeExecutionIdempotencyConflictError) {
    return buildErrorResponse(error.code, 409);
  }
  if (error instanceof NodeExecutionActiveError) {
    return buildErrorResponse(error.code, 409);
  }
  if (error instanceof NodeExecutionStorageUnavailableError) {
    return buildErrorResponse(error.code, 503);
  }
  if (error instanceof NodeExecutionProcessorUnavailableError) {
    return buildErrorResponse(error.code, 503);
  }
  if (error instanceof NodeExecutionQueueFullError) {
    return jsonWithNoStore(
      { message: error.code, reason: error.reason },
      { status: 429, headers: { "Retry-After": "30" } },
    );
  }
  return null;
}
