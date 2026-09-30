// @vitest-environment node

import { vi } from "vitest";
const remote = vi.hoisted(() => ({ requestRemote: vi.fn() }));
vi.mock("@/server/http/safe-remote", () => ({ requestRemote: remote.requestRemote }));
import { completeAssistant } from "./assistant-provider";

it("sends bounded visual Chat Completions input without leaking the key in the result", async () => {
  remote.requestRemote.mockResolvedValueOnce({ status: 200, body: Buffer.from(JSON.stringify({ choices: [{ message: { content: "  blue coat  " } }] })) });
  const answer = await completeAssistant({
    baseUrl: "https://api.example.com/v1", modelId: "vision-model", apiKey: "secret-test-key", timeoutMs: 60_000,
    instruction: "describe", text: "look at the image", visuals: [{ mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff]), label: "Video frame at 1.0 seconds" }],
    signal: new AbortController().signal,
  });
  expect(answer).toBe("blue coat");
  const [url, options] = remote.requestRemote.mock.calls[0] as [string, { body: string; headers: Record<string, string>; maxRedirects: number; maxBytes: number }];
  expect(url).toBe("https://api.example.com/v1/chat/completions");
  expect(options).toMatchObject({ maxRedirects: 0, maxBytes: 262144, headers: { authorization: "Bearer secret-test-key" } });
  expect(JSON.parse(options.body)).toMatchObject({
    model: "vision-model",
    messages: [{ role: "user", content: [
      { type: "text", text: "describe\n\nlook at the image" },
      { type: "text", text: "Video frame at 1.0 seconds" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/" } },
    ] }],
  });
  expect(options.body).not.toContain("secret-test-key");
});
