export class NodeGenerationNotFoundError extends Error {
  constructor() {
    super("GRAPH_NODE_NOT_FOUND");
    this.name = "NodeGenerationNotFoundError";
  }
}

export class NodeGenerationVersionConflictError extends Error {
  constructor() {
    super("GRAPH_VERSION_CONFLICT");
    this.name = "NodeGenerationVersionConflictError";
  }
}

export class NodeGenerationInputError extends Error {
  constructor(
    public readonly details: unknown,
    message = "INVALID_REQUEST",
  ) {
    super(message);
    this.name = "NodeGenerationInputError";
  }
}

export class NodeGenerationConfigError extends Error {
  constructor(public readonly details: unknown) {
    super("NODE_CONFIG_INVALID");
    this.name = "NodeGenerationConfigError";
  }
}
