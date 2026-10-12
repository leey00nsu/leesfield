import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { normalizeMediaOutputs, MediaOutputError, type MediaOutput } from "./binary-media-output";

export type VideoOutputMetadata = { width: number; height: number; duration_sec: number };
// Only metadata actually read here is reusable; provider hints never enter
// this cache. Buffer identity preserves ordering without retaining file data.
const inspected = new WeakMap<Buffer, Promise<VideoOutputMetadata>>();

export async function videoOutputMetadata(refs: MediaOutput[]) {
  const outputs = [];
  for (const output of await normalizeMediaOutputs(refs, "video")) {
    let metadata = inspected.get(output.buffer);
    if (!metadata) {
      metadata = inspect(output.buffer);
      inspected.set(output.buffer, metadata);
      void metadata.catch(() => {
        if (inspected.get(output.buffer) === metadata) inspected.delete(output.buffer);
      });
    }
    outputs.push(await metadata);
  }
  return { ...outputs[0], outputs };
}

async function inspect(buffer: Buffer): Promise<VideoOutputMetadata> {
  let input: Input | undefined;
  try {
    input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const duration = await input.computeDuration();
    if (!track || !Number.isFinite(duration) || duration <= 0 ||
        !Number.isFinite(track.displayWidth) || track.displayWidth <= 0 ||
        !Number.isFinite(track.displayHeight) || track.displayHeight <= 0) {
      throw new Error("VIDEO_OUTPUT_INVALID");
    }
    return { width: track.displayWidth, height: track.displayHeight, duration_sec: duration };
  } catch (error) {
    throw new MediaOutputError("VIDEO_METADATA_FAILED", "result.metadata", { cause: error });
  } finally {
    input?.dispose();
  }
}
