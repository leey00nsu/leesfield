export class NodeExecutionInputError extends Error {
  readonly code = "NODE_EXECUTION_INPUT_INVALID";
  constructor(readonly details: unknown) {
    super("NODE_EXECUTION_INPUT_INVALID");
    this.name = "NodeExecutionInputError";
  }
}

export class NodeExecutionNotFoundError extends Error {
  readonly code = "NODE_EXECUTION_NOT_FOUND";
  constructor() {
    super("NODE_EXECUTION_NOT_FOUND");
    this.name = "NodeExecutionNotFoundError";
  }
}

export class NodeExecutionNodeNotFoundError extends Error {
  readonly code = "GRAPH_NODE_NOT_FOUND";
  constructor() {
    super("GRAPH_NODE_NOT_FOUND");
    this.name = "NodeExecutionNodeNotFoundError";
  }
}

export class NodeExecutionVersionConflictError extends Error {
  readonly code = "GRAPH_VERSION_CONFLICT";
  constructor() {
    super("GRAPH_VERSION_CONFLICT");
    this.name = "NodeExecutionVersionConflictError";
  }
}

export class NodeExecutionConfigError extends Error {
  readonly code = "NODE_CONFIG_INVALID";
  constructor(readonly details: unknown) {
    super("NODE_CONFIG_INVALID");
    this.name = "NodeExecutionConfigError";
  }
}

export class NodeExecutionInputResolutionError extends Error {
  constructor(
    readonly code:
      | "NODE_INPUT_SELECTION_REQUIRED"
      | "NODE_INPUT_INVALID"
      | "NODE_INPUT_UNSUPPORTED"
      | "NODE_INPUT_LIMIT_EXCEEDED",
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "NodeExecutionInputResolutionError";
  }
}

export class NodeExecutionActiveError extends Error {
  readonly code = "NODE_GENERATION_ACTIVE";
  constructor() {
    super("NODE_GENERATION_ACTIVE");
    this.name = "NodeExecutionActiveError";
  }
}

export class NodeExecutionStorageUnavailableError extends Error {
  readonly code = "MEDIA_STORAGE_UNAVAILABLE";
  constructor() {
    super("MEDIA_STORAGE_UNAVAILABLE");
    this.name = "NodeExecutionStorageUnavailableError";
  }
}

export class NodeExecutionProcessorUnavailableError extends Error {
  readonly code = "PROCESSOR_UNAVAILABLE";
  constructor() {
    super("PROCESSOR_UNAVAILABLE");
    this.name = "NodeExecutionProcessorUnavailableError";
  }
}

export class NodeExecutionCancelledError extends Error {
  readonly code = "NODE_EXECUTION_CANCELLED";
  constructor() {
    super("NODE_EXECUTION_CANCELLED");
    this.name = "NodeExecutionCancelledError";
  }
}
