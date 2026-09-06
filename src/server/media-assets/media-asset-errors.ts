export class MediaAssetInputError extends Error {
  constructor(public readonly details: unknown) {
    super("INVALID_REQUEST");
    this.name = "MediaAssetInputError";
  }
}

export class MediaAssetNotFoundError extends Error {
  constructor() {
    super("MEDIA_ASSET_NOT_FOUND");
    this.name = "MediaAssetNotFoundError";
  }
}

export class MediaUploadNotFoundError extends Error {
  constructor() {
    super("MEDIA_UPLOAD_NOT_FOUND");
    this.name = "MediaUploadNotFoundError";
  }
}

export class MediaOperationNotFoundError extends Error {
  constructor() {
    super("MEDIA_OPERATION_NOT_FOUND");
    this.name = "MediaOperationNotFoundError";
  }
}

export class MediaStorageUnavailableError extends Error {
  constructor(public readonly diagnostic?: {
    stage: "configuration" | "presign";
    reason: "missing_configuration" | "timeout" | "authentication" | "permission" | "validation" | "rate_limit" | "upstream" | "network" | "unknown";
    upstreamStatus?: number;
  }) {
    super("MEDIA_STORAGE_UNAVAILABLE");
    this.name = "MediaStorageUnavailableError";
  }
}

export class MediaUploadExpiredError extends Error {
  constructor() {
    super("MEDIA_UPLOAD_EXPIRED");
    this.name = "MediaUploadExpiredError";
  }
}

export class MediaUploadConflictError extends Error {
  constructor(public readonly code: "MEDIA_UPLOAD_CONFIRMING" | "MEDIA_UPLOAD_FAILED") {
    super(code);
    this.name = "MediaUploadConflictError";
  }
}

export class MediaVerificationError extends Error {
  constructor(
    public readonly code:
      | "MEDIA_MIME_MISMATCH"
      | "MEDIA_SIZE_MISMATCH"
      | "MEDIA_MAGIC_INVALID"
      | "MEDIA_METADATA_INVALID",
  ) {
    super(code);
    this.name = "MediaVerificationError";
  }
}

export class MediaQuotaExceededError extends Error {
  constructor() {
    super("MEDIA_QUOTA_EXCEEDED");
    this.name = "MediaQuotaExceededError";
  }
}

export class MediaFileTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super("MEDIA_FILE_TOO_LARGE");
    this.name = "MediaFileTooLargeError";
  }
}

export class MediaAssetInUseError extends Error {
  constructor(
    public readonly graphIds: string[],
    public readonly operationIds: string[] = [],
  ) {
    super("MEDIA_ASSET_IN_USE");
    this.name = "MediaAssetInUseError";
  }
}

export class MediaOperationConflictError extends Error {
  constructor(public readonly code: "MEDIA_OPERATION_ACTIVE" | "MEDIA_OPERATION_TARGET_INVALID") {
    super(code);
    this.name = "MediaOperationConflictError";
  }
}
