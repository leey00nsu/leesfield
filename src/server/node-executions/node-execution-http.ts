import {
  buildErrorResponse,
  buildInvalidRequestResponse,
  jsonWithNoStore,
} from "@/server/http/response";
import { queueKnownErrorResponse } from "@/server/job-queue/job-queue-http";

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
  NodeExecutionSelectionConflictError,
} from "./node-execution-errors";

export function nodeExecutionErrorResponse(error: unknown) {
  const queueError = queueKnownErrorResponse(error);
  if (queueError) return queueError;
  if (error instanceof NodeExecutionSelectionConflictError) return buildErrorResponse(error.code, 409);
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
      { status: error.reason === "GLOBAL_LIMIT" ? 503 : 429, headers: { "Retry-After": "30" } },
    );
  }
  return null;
}
