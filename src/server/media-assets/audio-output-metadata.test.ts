import { describe, expect, it } from "vitest";
import { audioOutputMetadata, audioOutputResult } from "./audio-output-metadata";
import { generationOutputDuration } from "@/server/history/generation-output-availability";

function wav(durationMs: number) {
  const rate = 16_000;
  const size = durationMs * rate / 1_000 * 2;
  const buffer = Buffer.alloc(44 + size);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + size, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(size, 40);
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

describe("audio output duration", () => {
  it("measures each file instead of sharing a response hint", async () => {
    const urls = [wav(17_972), wav(2_500)];
    const durations = await audioOutputMetadata(urls, { duration_sec: 1 });
    expect(durations).toEqual([17.972, 2.5]);
    expect(audioOutputResult(urls, durations).audios.map((item) => item.durationSec)).toEqual(durations);
  });
  it("keeps unmeasurable duration unknown and accepts only a valid single-file hint", async () => {
    const unknown = "data:audio/mpeg;base64,ZmFrZQ==";
    expect(await audioOutputMetadata([unknown])).toEqual([undefined]);
    expect(audioOutputResult([unknown], [undefined]).audios[0]).not.toHaveProperty("durationSec");
    expect(await audioOutputMetadata([unknown], { duration_sec: 0 })).toEqual([undefined]);
    expect(await audioOutputMetadata([unknown], { duration_sec: 2.5 })).toEqual([2.5]);
    expect(await audioOutputMetadata([unknown, unknown], { duration_sec: 2.5 })).toEqual([undefined, undefined]);
  });
  it("reads precise asset duration while preserving a legacy fallback", () => {
    expect(generationOutputDuration({ durationSec: 5, asset: { durationMs: 5184 } })).toBe(5.184);
    expect(generationOutputDuration({ durationSec: 1, asset: { durationMs: 17972 } })).toBe(17.972);
    expect(generationOutputDuration({ durationSec: 5 })).toBe(5);
    expect(generationOutputDuration({ asset: { durationMs: null } })).toBeNull();
  });
});
