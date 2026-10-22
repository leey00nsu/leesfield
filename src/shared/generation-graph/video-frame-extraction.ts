export const VIDEO_FRAME_TIMESTAMP_MAX_MS = 600_000;
export type VideoFrameOutputPortId = "frame" | "startFrame" | "endFrame";

/** Config presence selects the execution mode; reading never upgrades legacy configs. */
export function videoFrameOutputPortIds(config: unknown): readonly VideoFrameOutputPortId[] {
  const parameters = config && typeof config === "object" && "parameters" in config ? config.parameters : null;
  return parameters && typeof parameters === "object" && "timestampMs" in parameters && parameters.timestampMs !== undefined
    ? ["frame"] : ["startFrame", "endFrame"];
}
