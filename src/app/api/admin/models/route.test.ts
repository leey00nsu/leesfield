import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/admin/models/route";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetModelCatalog = vi.hoisted(() => vi.fn());
const mockCreateHandler = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

vi.mock("@/server/model-catalog/handlers/create-model-catalog", () => ({
  createModelCatalogHandler: mockCreateHandler,
}));

const now = new Date("2026-01-26T00:00:00Z");

const imageModel: ModelCatalogItem = {
  id: "model-1",
  type: "image",
  key: "z-image-turbo",
  label: "Z-Image Turbo",
  vendor: "Zhipu",
  provider: "hf_space",
  providerConfig: {
    space_id: "zhipu/space",
    api_name: "/generate",
  },
  parameters: {
    prompt: { ui: "textarea" },
    width: { ui: "range", min: 256, max: 1024, step: 64 },
    height: { ui: "range", min: 256, max: 1024, step: 64 },
    steps: { ui: "range", min: 1, max: 50, step: 1 },
    imageCount: { ui: "range", min: 1, max: 1, step: 1 },
  },
  meta: {
    pipeline: "diffusion",
    model_id: "z-image-turbo",
    default_width: 512,
    default_height: 512,
    default_steps: 5,
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
    api_name: "/generate",
  },
  parameters: {
    prompt: { ui: "textarea" },
    durationSec: { ui: "range", min: 1, max: 10, step: 1 },
    steps: { ui: "range", min: 1, max: 50, step: 1 },
    guidanceScale: { ui: "range", min: 0, max: 10, step: 0.5 },
    seed: { ui: "input" },
    aspectRatio: { ui: "select", options: ["16:9"] },
    resolution: { ui: "select", options: [720] },
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
  isDefault: true,
  createdAt: now,
  updatedAt: now,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("/api/admin/models", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetModelCatalog.mockReset();
    mockCreateHandler.mockReset();
  });

  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/admin/models");
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("필터 조건에 맞는 모델만 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetModelCatalog.mockResolvedValue([imageModel, videoModel]);

    const request = new Request(
      "http://localhost/api/admin/models?type=video&q=wan&includeInactive=false",
    );
    const response = await GET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.key).toBe("wan2-2-hf");
    expect(mockGetModelCatalog).toHaveBeenCalledWith({
      includeInactive: false,
      bypassCache: true,
    });
  });

  it("잘못된 JSON이면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const request = new Request("http://localhost/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("Invalid JSON");
  });

  it("유효하지 않은 payload면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockCreateHandler.mockRejectedValue(new Error("INVALID_PAYLOAD"));

    const request = new Request("http://localhost/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_PAYLOAD");
  });
});
