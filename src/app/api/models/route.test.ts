import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/models/route";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetModelCatalog = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

const now = new Date("2026-01-26T00:00:00Z");

const imageModel: ModelCatalogItem = {
  id: "model-1",
  type: "image",
  key: "flux2-klein-9b",
  label: "FLUX.2 Klein 9B",
  vendor: "HUGGINGFACE",
  provider: "hf_space",
  providerConfig: {
    space_id: "owner/flux",
    api_name: "/generate_image",
  },
  parameters: {
    prompt: { ui: "textarea" },
    width: { ui: "range", min: 512, max: 1536, step: 64 },
    height: { ui: "range", min: 512, max: 1536, step: 64 },
    steps: { ui: "range", min: 1, max: 30, step: 1 },
    imageCount: { ui: "hidden", min: 1, max: 1, step: 1 },
  },
  meta: {
    pipeline: "diffusion",
    model_id: "flux2-klein-9b",
    default_width: 1024,
    default_height: 1024,
    default_steps: 4,
    concurrent_limit: 1,
    max_input_images: 0,
  },
  isActive: true,
  isDefault: true,
  createdAt: now,
  updatedAt: now,
};

const videoModel: ModelCatalogItem = {
  id: "model-2",
  type: "video",
  key: "wan2-2-hf",
  label: "Wan 2.2 (HF Space)",
  vendor: "Wan",
  provider: "hf_space",
  providerConfig: {
    space_id: "wan/space",
    api_name: "/generate_video",
  },
  parameters: {
    prompt: { ui: "textarea" },
    durationSec: { ui: "range", min: 1, max: 6, step: 0.5 },
    steps: { ui: "range", min: 1, max: 10, step: 1 },
    guidanceScale: { ui: "range", min: 0, max: 10, step: 0.5 },
    seed: { ui: "input" },
    aspectRatio: { ui: "select", options: [{ label: "16:9", value: "16:9" }] },
    resolution: { ui: "select", options: [{ label: "720", value: 720 }] },
    fps: { ui: "range", min: 1, max: 60, step: 1 },
  },
  meta: {
    supports_init_image: true,
    t2v_model_id: "wan-22",
    i2v_model_id: null,
    default_width: 1280,
    default_height: 720,
    default_duration_sec: 3.5,
    default_fps: 16,
    default_steps: 6,
    default_guidance_scale: 1,
    concurrent_limit: 1,
  },
  isActive: true,
  isDefault: false,
  createdAt: now,
  updatedAt: now,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/models", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetModelCatalog.mockReset();
  });

  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/models");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("타입 및 검색어 필터를 적용한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetModelCatalog.mockResolvedValue([imageModel, videoModel]);

    const request = new Request(
      "http://localhost/api/models?type=image&q=flux",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.key).toBe("flux2-klein-9b");
  });
});
