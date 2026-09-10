import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

/** Output dimensions and duration describe the file, never the request. */
export async function videoOutputMetadata(urls: string[]) {
  if (!urls.length) throw new Error("VIDEO_OUTPUT_EMPTY");
  const outputs = [];
  for (const url of urls) {
    const match = /^data:video\/[^;]+;base64,(.+)$/.exec(url);
    if (!match) throw new Error("VIDEO_OUTPUT_INVALID");
    const input = new Input({
      source: new BufferSource(Buffer.from(match[1], "base64")),
      formats: ALL_FORMATS,
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      const duration = await input.computeDuration();
      if (!track || !Number.isFinite(duration) || duration <= 0 ||
          !Number.isFinite(track.displayWidth) || track.displayWidth <= 0 ||
          !Number.isFinite(track.displayHeight) || track.displayHeight <= 0) {
        throw new Error("VIDEO_OUTPUT_INVALID");
      }
      outputs.push({ width: track.displayWidth, height: track.displayHeight, duration_sec: duration });
    } finally {
      input.dispose();
    }
  }
  return { ...outputs[0], outputs };
}
