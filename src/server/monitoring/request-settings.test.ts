import { describe, it, expect } from "vitest";
import { requestSettings } from "./request-settings";
describe("persisted request settings", () => {
  it("preserves zero, false, null and nested model parameters while omitting credentials and file payloads", () => {
    expect(
      requestSettings({
        model: "old-model",
        prompt: "test",
        graphId: "g",
        providerConfig: { token: "secret" },
        seed: 0,
        dynamicParams: {
          strength: 0,
          enhance: false,
          optional: null,
          reference: "data:image/png;base64,SECRET",
          files: ["https://private/file?token=secret"],
          options: { quality: 2, api_key: "secret" },
        },
      }),
    ).toEqual({
      seed: 0,
      dynamicParams: {
        strength: 0,
        enhance: false,
        optional: null,
        reference: "[file]",
        files: ["[file]"],
        options: { quality: 2 },
      },
    });
  });
  it("keeps token count settings but removes authentication tokens", () => {
    expect(
      requestSettings({
        dynamicParams: {
          max_tokens: 1024,
          token: "private",
          access_token: "private",
        },
      }),
    ).toEqual({ dynamicParams: { max_tokens: 1024 } });
  });
  it("does not invent settings for old records", () => {
    expect(requestSettings(null)).toBeNull();
    expect(requestSettings({ model: "old", prompt: "test" })).toBeNull();
  });
});
