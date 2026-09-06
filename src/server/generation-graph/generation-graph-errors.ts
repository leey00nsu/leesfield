import type { CanonicalGraphIssue } from "@/shared/generation-graph/canonical-graph";

export class GenerationGraphNotFoundError extends Error {
  constructor() {
    super("GRAPH_NOT_FOUND");
    this.name = "GenerationGraphNotFoundError";
  }
}

export class GenerationGraphVersionConflictError extends Error {
  constructor() {
    super("GRAPH_VERSION_CONFLICT");
    this.name = "GenerationGraphVersionConflictError";
  }
}

export class GenerationGraphInputError extends Error {
  constructor(
    public readonly details: unknown,
    message = "INVALID_REQUEST",
  ) {
    super(message);
    this.name = "GenerationGraphInputError";
  }
}

export class GenerationGraphStructureError extends GenerationGraphInputError {
  constructor(public readonly issues: CanonicalGraphIssue[]) {
    super({ graph: issues });
    this.name = "GenerationGraphStructureError";
  }
}

export class GenerationGraphActiveExecutionError extends Error {
  constructor() {
    super("GRAPH_ACTIVE_EXECUTION");
    this.name = "GenerationGraphActiveExecutionError";
  }
}

export class GenerationGraphReferenceError extends GenerationGraphInputError {
  constructor(public readonly reason: "GRAPH_ID_CONFLICT" | "GRAPH_OUTPUT_INVALID") {
    super({ graph: [{ code: reason }] });
    this.name = "GenerationGraphReferenceError";
  }
}
