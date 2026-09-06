import {
  buildErrorResponse,
  buildInvalidRequestResponse,
  jsonWithNoStore,
} from "@/server/http/response";

import {
  MediaAssetInUseError,
  MediaAssetInputError,
  MediaAssetNotFoundError,
  MediaFileTooLargeError,
  MediaOperationConflictError,
  MediaOperationNotFoundError,
  MediaQuotaExceededError,
  MediaStorageUnavailableError,
  MediaUploadConflictError,
  MediaUploadExpiredError,
  MediaUploadNotFoundError,
  MediaVerificationError,
} from "./media-asset-errors";

export function buildMediaAssetKnownErrorResponse(error: unknown) {
  if (error instanceof MediaAssetInputError) {
    return buildInvalidRequestResponse(error.details);
  }
  if (error instanceof MediaAssetNotFoundError) {
    return buildErrorResponse("MEDIA_ASSET_NOT_FOUND", 404);
  }
  if (error instanceof MediaUploadNotFoundError) {
    return buildErrorResponse("MEDIA_UPLOAD_NOT_FOUND", 404);
  }
  if (error instanceof MediaOperationNotFoundError) {
    return buildErrorResponse("MEDIA_OPERATION_NOT_FOUND", 404);
  }
  if (error instanceof MediaUploadExpiredError) {
    return buildErrorResponse("MEDIA_UPLOAD_EXPIRED", 410);
  }
  if (error instanceof MediaUploadConflictError) {
    return buildErrorResponse(error.code, 409);
  }
  if (error instanceof MediaOperationConflictError) {
    return buildErrorResponse(error.code, 409);
  }
  if (error instanceof MediaVerificationError) {
    return buildErrorResponse(error.code, 422);
  }
  if (error instanceof MediaFileTooLargeError) {
    return jsonWithNoStore(
      { message: "MEDIA_FILE_TOO_LARGE", maxBytes: error.maxBytes },
      { status: 413 },
    );
  }
  if (error instanceof MediaQuotaExceededError) {
    return buildErrorResponse("MEDIA_QUOTA_EXCEEDED", 413);
  }
  if (error instanceof MediaAssetInUseError) {
    return jsonWithNoStore(
      {
        message: "MEDIA_ASSET_IN_USE",
        graphIds: error.graphIds,
        operationIds: error.operationIds,
      },
      { status: 409 },
    );
  }
  if (error instanceof MediaStorageUnavailableError) {
    return buildErrorResponse("MEDIA_STORAGE_UNAVAILABLE", 503);
  }
  return null;
}
