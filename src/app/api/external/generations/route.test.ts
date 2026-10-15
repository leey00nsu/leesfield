import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  catalog: vi.fn(),
  image: vi.fn(),
  video: vi.fn(),
  audio: vi.fn(),
  start: vi.fn(),
  preset: vi.fn(),
}));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/prompt-presets/prompt-preset-service", () => ({ promptPresetService: { get: mocks.preset } }));
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mocks.catalog,
}));
vi.mock("@/server/image-generation/image-generation-submission", () => ({
  submitImageGeneration: mocks.image,
}));
vi.mock("@/server/image-generation/image-generation-store", () => ({
  getGeneration: async () => null,
}));
vi.mock("@/server/audio-generation/audio-generation-store", () => ({
  createMockAudioGenerationWithLimit: mocks.audio,
  getAudioGeneration: async () => null,
}));
vi.mock("@/server/video-generation/video-generation-store", () => ({
  createMockVideoGenerationWithLimit: mocks.video,
  getVideoGeneration: async () => null,
}));
vi.mock("@/server/generation-worker/generation-worker", () => ({
  startGenerationWorker: mocks.start,
}));
import { mappedModel } from "@/server/external-api/test-fixtures";
import { POST } from "./route";
import { PromptPresetError } from "@/server/prompt-presets/prompt-preset-errors";
function request(body: unknown) {
  return new Request("http://localhost/api/external/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function requestWithKey(body: unknown, idempotencyKey: string) {
  return new Request("http://localhost/api/external/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key" });
  mocks.catalog.mockResolvedValue(
    ["image", "video", "audio"].map((type) =>
      mappedModel(type as "image" | "video" | "audio"),
    ),
  );
  for (const fn of [mocks.image, mocks.video, mocks.audio])
    fn.mockResolvedValue({
      record: { id: "job-id", status: "pending", progress: 0, createdAt:"2026-10-15T00:00:00Z", finishedAt:null },
    });
});
describe("unified generation POST", () => {
  const preset = { key: "custom", revision: 2, name: "Custom", modality: "image", prompt: "template",
    builtinRevision: null, requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {}, isActive: true };
  const presetBody = { type: "image", model: "image-private-id", dynamicParams: { text: "expanded client prompt", seed: 0 }, promptPreset: { key: "custom", revision: 2 } };
  it("requires platform read permission before resolving a preset", async () => {
    expect((await POST(request(presetBody))).status).toBe(403);
    expect(mocks.preset).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it("stores a server resolved preset and keeps client prompt/params and idempotent retries", async () => {
    mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:read"] });
    mocks.preset.mockResolvedValue(preset);
    const first = await POST(requestWithKey(presetBody, "preset-retry"));
    expect(first.status).toBe(200);
    expect(mocks.preset).toHaveBeenCalledWith("owner", "custom");
    expect(mocks.image.mock.calls[0][0].payload).toMatchObject({
      promptPreset: { key: "custom", revision: 2, requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {} },
      dynamicParams: { text: "expanded client prompt", seed: 0 },
    });
    expect((await POST(requestWithKey(presetBody, "preset-retry"))).status).toBe(200);
    expect(mocks.image).toHaveBeenCalledOnce();
    mocks.preset.mockResolvedValue({ ...preset, revision: 3 });
    expect((await POST(requestWithKey({ ...presetBody, promptPreset: { key: "custom", revision: 3 } }, "preset-retry"))).status).toBe(409);
    expect(mocks.image).toHaveBeenCalledOnce();
  });
  it.each([
    { value: { ...preset, revision: 3 }, status: 409 },
    { value: { ...preset, isActive: false }, status: 400 },
    { value: { ...preset, modality: "audio" }, status: 400 },
    { value: { ...preset, requiredInputs: { referenceImageCount: 1 } }, status: 400 },
  ])("rejects stale/inactive/wrong modality before enqueueing: $status", async ({ value, status }) => {
    mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:read"] });
    mocks.preset.mockResolvedValue(value);
    expect((await POST(request(presetBody))).status).toBe(status);
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it("does not resolve a missing/other owner preset and does not allow forged reference metadata", async () => {
    mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key", permissions: ["platform:read"] });
    mocks.preset.mockRejectedValueOnce(new PromptPresetError("PRESET_NOT_FOUND", 404));
    expect((await POST(request(presetBody))).status).toBe(404);
    expect((await POST(request({ ...presetBody, promptPreset: { ...presetBody.promptPreset, requiredInputs: { referenceImageCount: 0 } } }))).status).toBe(400);
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it("converges a retried submission onto the original request", async () => {
    const body = {
      type: "image" as const,
      model: "image-private-id",
      dynamicParams: { text: "retry", seed: 0, enabled: false },
    };

    const first = await POST(requestWithKey(body, "retry-key-1"));
    expect(first.status).toBe(200);
    expect(mocks.image).toHaveBeenCalledTimes(1);
    const reservedRequestId = (
      mocks.image.mock.calls[0]?.[0] as { requestId: string }
    ).requestId;
    expect(reservedRequestId).toEqual(expect.any(String));

    const second = await POST(requestWithKey(body, "retry-key-1"));
    expect(second.status).toBe(200);
    // The retry answers with the reserved request instead of a second job;
    // its row is not visible yet, so the status stays pending.
    expect(await second.json()).toMatchObject({
      requestId: reservedRequestId,
      status: "pending",
      progress: 0,
    });
    // The original request is reused instead of starting a second paid job.
    expect(mocks.image).toHaveBeenCalledTimes(1);
  });

  it.each(["image", "video", "audio"] as const)(
    "dispatches %s and retains model-specific input values",
    async (type) => {
      const response = await POST(
        request({
          type,
          model: type + "-private-id",
          dynamicParams: { text: "test", seed: 0, enabled: false },
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        type,
        requestId: "job-id",
        status: "pending",
        progress: 0,
        createdAt:"2026-10-15T00:00:00Z", finishedAt:null,
      });
      const fn = mocks[type];
      const payload =
        type === "image" ? fn.mock.calls[0][0].payload : fn.mock.calls[0][0];
      expect(payload.model).toBe(type + "-private-key");
      expect(payload).not.toHaveProperty("promptPreset");
      expect(payload.dynamicParams).toMatchObject({
        text: "test",
        seed: 0,
        enabled: false,
      });
      if (type === "image")
        expect(fn.mock.calls[0][0]).toMatchObject({
          ownerEmail: "owner",
          apiKeyId: "key",
          requestId: expect.any(String),
        });
      else
        expect(fn.mock.calls[0].slice(1)).toEqual([
          "owner",
          "key",
          expect.any(String),
        ]);
    },
  );
  it.each([401, 403])(
    "auth %s stops before catalog lookup or submission",
    async (status) => {
      mocks.auth.mockResolvedValue(new Response(null, { status }));
      expect((await POST(request({}))).status).toBe(status);
      expect(mocks.catalog).not.toHaveBeenCalled();
      expect(mocks.image).not.toHaveBeenCalled();
    },
  );
  it.each([
    {
      body: { type: "image", model: "missing", dynamicParams: { text: "x" } },
      status: 404,
    },
    {
      body: {
        type: "video",
        model: "image-private-id",
        dynamicParams: { text: "x" },
      },
      status: 400,
    },
    {
      body: { type: "image", model: "image-private-id", prompt: "wrong" },
      status: 400,
    },
    {
      body: { type: "image", model: "image-private-id", dynamicParams: {} },
      status: 400,
    },
    {
      body: {
        type: "image",
        model: "image-private-id",
        dynamicParams: { text: "x", fps: 1 },
      },
      status: 400,
    },
  ])("rejects invalid input without enqueueing", async ({ body, status }) => {
    expect((await POST(request(body))).status).toBe(status);
    expect(mocks.image).not.toHaveBeenCalled();
    expect(mocks.video).not.toHaveBeenCalled();
    expect(mocks.audio).not.toHaveBeenCalled();
  });
  it("treats inactive models as unavailable", async () => {
    mocks.catalog.mockResolvedValue([{ ...mappedModel(), isActive: false }]);
    expect(
      (
        await POST(
          request({
            type: "image",
            model: "image-private-id",
            dynamicParams: { text: "x" },
          }),
        )
      ).status,
    ).toBe(404);
  });
  it("does not silently accept malformed JSON or unsupported content types", async () => {
    const invalid = new Request("http://localhost/api/external/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect((await POST(invalid)).status).toBe(400);
    expect(
      (
        await POST(
          new Request("http://localhost/api/external/generations", {
            method: "POST",
            body: "hello",
          }),
        )
      ).status,
    ).toBe(415);
  });
  it("returns a server error when submission fails", async () => {
    mocks.image.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(
      (
        await POST(
          request({
            type: "image",
            model: "image-private-id",
            dynamicParams: { text: "test" },
          }),
        )
      ).status,
    ).toBe(500);
  });
});
