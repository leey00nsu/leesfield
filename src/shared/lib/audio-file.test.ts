import { describe, expect, it } from "vitest";
import {
  resolveAudioExtension,
  resolveAudioMime,
} from "@/shared/lib/audio-file";

describe("audio-file", () => {
  it("octet-stream과 WAV 시그니처가 함께 오면 audio/wav로 정규화한다", () => {
    const mime = resolveAudioMime({
      contentType: "application/octet-stream",
      sourceUrl:
        "https://example.com/gradio_api/file=/tmp/generated/audio.wav",
      buffer: Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]),
    });

    expect(mime).toBe("audio/wav");
    expect(resolveAudioExtension(mime)).toBe("wav");
  });

  it("명시적 audio MIME은 그대로 유지한다", () => {
    expect(
      resolveAudioMime({
        contentType: "audio/mpeg",
        sourceUrl: "https://example.com/result.mp3",
        buffer: Buffer.from([73, 68, 51]),
      }),
    ).toBe("audio/mpeg");
  });
});
