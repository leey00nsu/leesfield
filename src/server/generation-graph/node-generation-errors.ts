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

export type NodeInputResolutionDetails = {
  edgeId: string;
  sourceNodeId: string;
};

export class NodeInputSelectionRequiredError extends Error {
  constructor(public readonly details: NodeInputResolutionDetails) {
    super("NODE_INPUT_SELECTION_REQUIRED");
    this.name = "NodeInputSelectionRequiredError";
  }
}

export class NodeInputInvalidError extends Error {
  constructor(public readonly details: NodeInputResolutionDetails) {
    super("NODE_INPUT_INVALID");
    this.name = "NodeInputInvalidError";
  }
}

export class NodeInputUnsupportedError extends Error {
  constructor(
    public readonly details: { limit: 0; count: number },
  ) {
    super("NODE_INPUT_UNSUPPORTED");
    this.name = "NodeInputUnsupportedError";
  }
}

export class NodeInputLimitExceededError extends Error {
  constructor(
    public readonly details: { limit: number; count: number },
  ) {
    super("NODE_INPUT_LIMIT_EXCEEDED");
    this.name = "NodeInputLimitExceededError";
  }
}
