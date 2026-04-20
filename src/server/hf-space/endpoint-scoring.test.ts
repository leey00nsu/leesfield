import { describe, expect, it } from "vitest";

import { hasAudioEndpointSignal } from "@/server/hf-space/endpoint-scoring";

describe("hasAudioEndpointSignal", () => {
  it("learning_rate나 bitrate 같은 일반 rate 파라미터는 audio signal로 오인하지 않는다", () => {
    expect(
      hasAudioEndpointSignal({
        parameters: [
          { parameter_name: "learning_rate", label: "Learning Rate" },
          { parameter_name: "bitrate", label: "Bitrate" },
        ],
      }),
    ).toBe(false);
  });

  it("voice/speed 같은 실제 오디오 제어 파라미터는 audio signal로 유지한다", () => {
    expect(
      hasAudioEndpointSignal({
        parameters: [
          { parameter_name: "speaker", label: "Speaker" },
          { parameter_name: "generation_speed", label: "Generation Speed" },
        ],
      }),
    ).toBe(true);
  });
});
