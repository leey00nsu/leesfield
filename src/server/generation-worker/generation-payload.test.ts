// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildImagePayload, buildVideoPayload, buildAudioPayload, getImageRuntimeState, getVideoRuntimeState, getAudioRuntimeState } from "./generation-payload";
const mocks = vi.hoisted(() => ({ catalog: vi.fn(), asset: vi.fn(), frozen: vi.fn() }));
vi.mock("@/server/model-catalog/runtime-models", async original => ({
  ...await original<typeof import("@/server/model-catalog/runtime-models")>(), getRuntimeCatalog: mocks.catalog,
}));
vi.mock("@/server/generation-request/request-snapshot", async original => ({
  ...await original<typeof import("@/server/generation-request/request-snapshot")>(), frozenExecutionModel: mocks.frozen,
}));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: { get: mocks.asset } }));
describe("generation payload preparation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const base = { key: "model", isActive: true, isDefault: true, concurrentLimit: 1, defaults: { width: 512, height: 512, steps: 5, voice: "legacy", speed: 1 } };
    mocks.catalog.mockResolvedValue({ imageModels: [{ ...base, mapped: true }], videoModels: [{ ...base, mapped: true }],
      audioModels: [{ ...base, mapped: true, parameters: {} }] });
    mocks.asset.mockImplementation(async (_owner, id) => ({ url: "https://signed.example/" + id }));
  });
  it.each(["image", "video", "audio"] as const)("preserves mapped %s JSON values without injecting legacy defaults", async media => {
    const row = { prompt: "prompt", requestParams: { model: "model", dynamicParams: { duration: 0, enabled: false, text: "", options: null } } };
    const payload = media === "image" ? await buildImagePayload(row, (await getImageRuntimeState())!)
      : media === "video" ? await buildVideoPayload(row, (await getVideoRuntimeState())!)
        : await buildAudioPayload(row, (await getAudioRuntimeState())!);
    expect(payload.dynamicParams).toEqual(row.requestParams.dynamicParams);
    expect(payload).not.toHaveProperty("steps");
  });
  it("hydrates Classic v3 asset references at execution time, including frozen models", async () => {
    mocks.frozen.mockReturnValue({ provider: "modal_comfyui" });
    const row = { ownerEmail: "owner@example.com", prompt: "prompt", requestParams: { requestVersion: 3, model: "model",
      initImages: [], inputAssets: [{ assetId: "input-asset", field: "initImages", sortOrder: 0, multiple: true }] } };
    expect(await buildImagePayload(row, (await getImageRuntimeState())!)).toMatchObject({ initImages: ["https://signed.example/input-asset"] });
    expect(mocks.asset).toHaveBeenCalledWith("owner@example.com", "input-asset");
  });
  it("keeps frozen video references and removes null audio placeholders", async () => {
    mocks.frozen.mockReturnValue({ provider: "modal_comfyui" });
    expect(await buildVideoPayload({ ownerEmail: "owner@example.com", prompt: "prompt", requestParams: {
      requestVersion: 3, model: "model", initImage: null, inputAssets: [{ assetId: "frame", field: "initImage", sortOrder: 0, multiple: false }],
    } }, (await getVideoRuntimeState())!)).toMatchObject({ initImage: "https://signed.example/frame" });
    expect(await buildAudioPayload({ prompt: "prompt", requestParams: { model: "model", inputAudio: null } }, (await getAudioRuntimeState())!)).not.toHaveProperty("inputAudio");
  });
  it("rejects removed models instead of selecting a different model", async () => {
    await expect(buildImagePayload({ prompt: "prompt", requestParams: { model: "removed" } }, (await getImageRuntimeState())!)).rejects.toThrow("MODEL_NOT_FOUND");
  });
});
