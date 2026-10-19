import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { decodeBase64DataUrl, GENERATION_OUTPUT_LIMITS, mapBoundedMediaOutputs } from "@/server/http/bounded-io";
import { mapWithConcurrency } from "@/server/http/bounded-body";

function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

// Inspect each file independently. A response-level hint cannot describe several files.
export async function audioOutputMetadata(dataUrls: string[], meta?: { duration_sec?: number }) {
  const bounded = await mapBoundedMediaOutputs(dataUrls, "audio", async (url) => url);
  return mapWithConcurrency(bounded, 2, async (url) => {
    const { buffer } = decodeBase64DataUrl(url, {
      maxBytes: GENERATION_OUTPUT_LIMITS.audio,
      invalidCode: "AUDIO_OUTPUT_INVALID",
      tooLargeCode: "AUDIO_OUTPUT_TOO_LARGE",
    });
    let input: Input | undefined;
    try {
      input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      const duration = track ? positive(await input.computeDuration()) : undefined;
      if (duration !== undefined) return Math.round(duration * 1_000) / 1_000;
    } catch {
      // Unsupported containers can still be played; unknown metadata stays unknown.
    } finally {
      input?.dispose();
    }
    return dataUrls.length === 1 ? positive(meta?.duration_sec) : undefined;
  });
}

export function audioOutputResult(dataUrls: string[], durations: Array<number | undefined>) {
  return { audios: dataUrls.map((url, index) => ({
    url, ...(durations[index] !== undefined ? { durationSec: durations[index] } : {}),
  })) };
}
