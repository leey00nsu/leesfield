import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  image: vi.fn(),
  video: vi.fn(),
  audio: vi.fn(),
}));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/image-generation/image-generation-store", () => ({
  getGeneration: mocks.image,
}));
vi.mock("@/server/video-generation/video-generation-store", () => ({
  getVideoGeneration: mocks.video,
}));
vi.mock("@/server/audio-generation/audio-generation-store", () => ({
  getAudioGeneration: mocks.audio,
}));
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail: "owner", apiKeyId: "key" });
  for (const fn of [mocks.image, mocks.video, mocks.audio])
    fn.mockResolvedValue(null);
});
const request = new Request("http://localhost/api/external/generations/job");
const context = { params: Promise.resolve({ requestId: "job" }) };
describe("unified generation status", () => {
  it.each(["image", "video", "audio"] as const)(
    "returns %s results and scopes all reads to the authenticated owner",
    async (type) => {
      const result = {
        [type === "image" ? "images" : type === "video" ? "videos" : "audios"]:
          [{ url: "https://example.com/result" }],
      };
      mocks[type].mockResolvedValue({
        id: "job",
        status: "completed",
        progress: 100,
        result,
      });
      const response = await GET(request, context);
      expect(await response.json()).toMatchObject({
        type,
        requestId: "job",
        result,
      });
      for (const fn of [mocks.image, mocks.video, mocks.audio])
        expect(fn).toHaveBeenCalledWith("job", "owner");
    },
  );
  it("returns 404 when no owned job exists", async () => {
    expect((await GET(request, context)).status).toBe(404);
  });
  it("rejects unauthenticated reads without hitting stores", async () => {
    mocks.auth.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await GET(request, context)).status).toBe(401);
    for (const fn of [mocks.image, mocks.video, mocks.audio])
      expect(fn).not.toHaveBeenCalled();
  });
});
