import { beforeEach, expect, it, vi } from "vitest";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { POST as imagePost } from "@/app/api/image-generation/route";
import { POST as videoPost } from "@/app/api/video-generation/route";
import { restoreRequest, snapshotRequest } from "@/server/generation-request/request-snapshot";
import { getGradioContract, gradioInputValues } from "@/shared/model-catalog/gradio-contract";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), admit: vi.fn(), image: vi.fn(), video: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ getSession: async () => ({ isLoggedIn: true, adminEmail: "owner@example.com" }) }));
vi.mock("@/server/model-catalog/catalog-service", () => ({ getModelCatalog: mocks.catalog }));
vi.mock("@/server/generation-admission/admitted-submission", () => ({ admitSubmission: mocks.admit }));
vi.mock("@/server/generation-admission/submission-ledger", () => ({ finalizeSubmission: vi.fn() }));
vi.mock("@/server/image-generation/image-generation-submission", () => ({ submitImageGeneration: mocks.image }));
vi.mock("@/server/video-generation/video-generation-store", () => ({ createMockVideoGenerationWithLimit: mocks.video, getVideoGeneration: vi.fn() }));
vi.mock("@/server/generation-worker/generation-worker", () => ({ startGenerationWorker: vi.fn() }));
const model = (type: "image" | "video", prompt = true, maxLength?: number) => ({ type, key: `mapped-${type}`, provider: "hf_space", providerConfig: { gradio_contract: {
  version: 1, mappingConfirmed: true, apiName: "/generate", reviewed: true, diagnostics: [],
  inputs: prompt ? [{ name: "description", label: "Prompt", kind: "string", canonical: "prompt", confirmed: true, schema: { type: "string", ...(maxLength ? { maxLength } : {}) }, required: true, nullable: false }] : [],
  output: { media: type, path: [0], multiple: false },
} } });
const request = (type: "image" | "video", body: unknown) => new Request(`http://localhost/api/${type}-generation`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "cinema-test-intent" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.catalog.mockResolvedValue([model("image"), model("video")]);
  mocks.admit.mockResolvedValue({ kind: "admitted", requestId: "cinema-request" });
  mocks.image.mockResolvedValue({ record: { id: "cinema-request", status: "pending", progress: 0 } });
  mocks.video.mockResolvedValue({ record: { id: "cinema-request", status: "pending", progress: 0 } });
});

it.each(["image", "video"] as const)("%s uses the actual provider prompt and keeps metadata out of input fields", async type => {
  const body = { model: `mapped-${type}`, prompt: "unused canonical", dynamicParams: { description: "a rainy street" }, inputPrompt: "typed text".repeat(3_000), cinema: { ...defaultCinemaSettings(), lighting: "window" } };
  const response = await (type === "image" ? imagePost : videoPost)(request(type, body));
  expect(response.status).toBe(200);
  const submission = type === "image" ? mocks.image.mock.calls[0][0] : { payload: mocks.video.mock.calls[0][0], cinema: mocks.video.mock.calls[0][4] };
  expect(submission.cinema.sourcePrompt).toBe("a rainy street");
  expect(submission.cinema.finalPrompt).toBe("a rainy street\n\nCinema direction: Soft natural window light.");
  const inputs = gradioInputValues(getGradioContract(model(type))!, submission.payload);
  expect(inputs).toEqual({ description: submission.cinema.finalPrompt });
  expect(submission.payload).not.toHaveProperty("cinema");
  expect(mocks.admit.mock.calls[0][0].payload.cinema).toEqual(submission.cinema);
  const saved = await snapshotRequest(type, { ...submission.payload, cinema: submission.cinema });
  expect(saved.cinema).toEqual(submission.cinema);
  expect(saved.inputPrompt).toBe("typed text".repeat(3_000));
  expect(restoreRequest(saved)).not.toHaveProperty("cinema");
  expect(gradioInputValues(getGradioContract(model(type))!, restoreRequest(saved))).toEqual(inputs);
});
it.each(["image", "video"] as const)("%s submits expanded optics to the real provider field and admission snapshot", async type => {
  const scene = "A ceramic vase on a table. Full view of the vase, focus on its handle.";
  const body = { model: `mapped-${type}`, prompt: "unused canonical", dynamicParams: { description: scene },
    cinema: { ...defaultCinemaSettings(), camera: "70mm-film", lens: "modern-prime", composition: "close-up", aperture: "f14" } };
  expect((await (type === "image" ? imagePost : videoPost)(request(type, body))).status).toBe(200);
  const submission = type === "image" ? mocks.image.mock.calls[0][0] : { payload: mocks.video.mock.calls[0][0], cinema: mocks.video.mock.calls[0][4] };
  expect(submission.cinema).toMatchObject({ mappingVersion: 10, sourcePrompt: scene });
  const final = submission.cinema.finalPrompt;
  expect(final).toContain("Use a close-up shot emphasizing the primary subject");
  expect(final).toContain("focus target sharply resolved");
  expect(final).toContain("primary framing instruction");
  expect(final).toContain("IMAX 70mm large-format film photography");
  expect(final).toContain("prioritize the explicitly selected shot-size setting");
  expect(final.match(/\bf\/\d+(?:\.\d+)?\b/g)).toEqual(["f/1.4"]);
  expect(final).toContain("ZEISS Otus");
  expect(final.startsWith("Use a close-up shot emphasizing the primary subject")).toBe(true);
  expect(submission.cinema.sourcePrompt).toBe(scene);
  expect(gradioInputValues(getGradioContract(model(type))!, submission.payload)).toEqual({ description: final });
  expect(mocks.admit.mock.calls[0][0].payload.cinema).toEqual(submission.cinema);
  const saved = await snapshotRequest(type, { ...submission.payload, cinema: submission.cinema });
  expect(gradioInputValues(getGradioContract(model(type))!, restoreRequest(saved))).toEqual({ description: final });
});
it("drops inactive legacy choices and neutral Cinema metadata from new submissions", async () => {
  for (const camera of ["16mm-film", "modular-8k"]) {
    await imagePost(request("image", { model: "mapped-image", prompt: "a scene", cinema: { ...defaultCinemaSettings(), shootingEnabled: false, camera } }));
  }
  const first = mocks.admit.mock.calls[0][0].payload, second = mocks.admit.mock.calls[1][0].payload;
  expect(first.payload.prompt).toBe(second.payload.prompt);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(first.cinema).toBeUndefined();
});
it("rejects unknown versions, video-only choices, promptless guidance and conflicting presets before admission", async () => {
  for (const cinema of [{ schemaVersion: 3 }, { ...defaultCinemaSettings(), genre: "western" }, { ...defaultCinemaSettings(), lens: "deleted-lens" }]) {
    expect((await imagePost(request("image", { model: "mapped-image", prompt: "a scene", cinema }))).status).toBe(400);
  }
  mocks.catalog.mockResolvedValue([model("image", false)]);
  const nonneutral = { ...defaultCinemaSettings(), camera: "16mm-film" };
  expect((await imagePost(request("image", { model: "mapped-image", cinema: nonneutral }))).status).toBe(400);
  mocks.catalog.mockResolvedValue([model("image")]);
  expect((await imagePost(request("image", { model: "mapped-image", prompt: "grid", cinema: nonneutral, promptPreset: { key: "multi-camera-nine-grid" } }))).status).toBe(400);
  expect(mocks.admit).not.toHaveBeenCalled();
  expect(mocks.image).not.toHaveBeenCalled();
});
it("validates the composed prompt against the actual model length limit", async () => {
  mocks.catalog.mockResolvedValue([model("image", true, 20)]);
  expect((await imagePost(request("image", { model: "mapped-image", prompt: "scene", cinema: { ...defaultCinemaSettings(), camera: "16mm-film" } }))).status).toBe(400);
  expect(mocks.admit).not.toHaveBeenCalled();
});

it("submits movement-only source as a nonempty provider prompt exactly once",async()=>{
  const body={model:"mapped-video",prompt:"",cinema:{...defaultCinemaSettings(),movement:"snorricam"}};
  expect((await videoPost(request("video",body))).status).toBe(200);
  const payload=mocks.video.mock.calls[0][0], cinema=mocks.video.mock.calls[0][4];
  expect(cinema.sourcePrompt).toBe("");expect(payload.prompt).toContain("Cinema direction:");
  expect(payload.prompt.match(/Cinema direction:/g)).toHaveLength(1);
  expect(gradioInputValues(getGradioContract(model("video"))!,payload).description).toBe(cinema.finalPrompt);
});
