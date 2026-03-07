import { createAudioGenerationSchema } from "@/features/audio-generation/model/audio-generation-schema";

describe("audio-generation-schema", () => {
  it("공백만 있는 prompt는 허용하지 않는다", () => {
    const schema = createAudioGenerationSchema();

    const result = schema.safeParse({
      prompt: "   ",
      model: "audio-model",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["prompt"]);
  });

  it("기본 schema는 speed 범위를 강제하지 않는다", () => {
    const schema = createAudioGenerationSchema();

    const result = schema.safeParse({
      prompt: "hello",
      model: "audio-model",
      speed: 9,
    });

    expect(result.success).toBe(true);
  });

  it("speedRange가 주어지면 해당 범위를 검증한다", () => {
    const schema = createAudioGenerationSchema(undefined, {
      speedRange: {
        min: 0.5,
        max: 2,
      },
    });

    const result = schema.safeParse({
      prompt: "hello",
      model: "audio-model",
      speed: 2.5,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["speed"]);
  });
});
