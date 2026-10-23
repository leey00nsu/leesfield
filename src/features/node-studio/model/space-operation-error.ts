const messages: Record<string, string> = {
  IMAGE_MODEL_MISSING: "There are no image models",
  VIDEO_MODEL_MISSING: "There are no video models",
  AUDIO_MODEL_MISSING: "There are no audio models",
  ASSISTANT_MODEL_MISSING: "There are no AI assistant models",
  INPUT_MODEL_UNSUPPORTED: "There are no models that can accept this input",
  MODEL_CATALOG_LOADING: "Models are loading. Please try again shortly.",
  MODEL_CATALOG_UNAVAILABLE: "Unable to load models. Please try again.",
  CONNECTION_INVALID: "Unable to connect these nodes. Check the input and model.",
  PORT_UNSUPPORTED: "This port does not support this connection.",
  PORT_DIRECTION: "Connect an output port to a compatible input port.",
  EDGE_ENDPOINT: "The node for this connection is no longer available.",
  NODE_NOT_FOUND: "The node is no longer available.",
  SPACE_NODE_NOT_FOUND: "The node is no longer available.",
  NODE_UNAVAILABLE: "This node is currently unavailable.",
  ATTACHMENT_LIMIT: "The maximum number of references has been reached.",
  SPACE_GRAPH_LIMIT: "The Space has reached its node or connection limit.",
  NODE_LIMIT: "The Space has reached its node or connection limit.",
  EDGE_LIMIT: "The Space has reached its node or connection limit.",
  RESULT_NODE_LIMIT_EXCEEDED: "There is no room for more result nodes.",
  READ_ONLY: "This Space is read only.",
  WORKFLOW_READ_ONLY: "This Space is read only.",
  NODE_GENERATION_ACTIVE: "This node is already running.",
  NODE_INPUT_CHANGED: "The node inputs changed. Please try again.",
  GRAPH_CYCLE: "This connection would create a cycle.",
  GENERATION_FAILED: "The generation failed. Please try again.",
  CANCEL_FAILED: "Unable to cancel the operation. Please try again.",
  COPY_FAILED: "Unable to copy the selected nodes.",
  CLIPBOARD_READ_FAILED: "Unable to read the clipboard. Check browser permissions.",
};

/** Only allowlisted public copy crosses the notification boundary. */
export function spaceOperationErrorMessage(error: unknown) {
  if ((error instanceof Error || error instanceof DOMException) && error.name === "AbortError") return null;
  const code = error instanceof Error ? ("code" in error && typeof error.code === "string" ? error.code : error.message) : "";
  if (code === "DISPOSED") return null;
  return messages[code] ?? "Unable to complete the Space operation. Please try again.";
}
