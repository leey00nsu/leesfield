import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/models/import/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockImportDraft = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/model-catalog/space-importer", () => ({
  importModelDraftFromSpace: mockImportDraft,
}));

describe("/api/admin/models/import", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockImportDraft.mockReset();
  });

  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/admin/models/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceUrl: "https://huggingface.co/spaces/test/space" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("spaceUrl이 없으면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const request = new Request("http://localhost/api/admin/models/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_SPACE_URL");
  });

  it("정상 요청이면 초안 정보를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockImportDraft.mockResolvedValue({
      spaceId: "owner/space",
      apiNames: ["/predict"],
      resolvedApiName: "/predict",
      draft: {
        type: "image",
        key: "owner-space",
        label: "Owner Space",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: { space_id: "owner/space", api_name: "/predict" },
        parameters: { prompt: { ui: "textarea" } },
        meta: { pipeline: "diffusion" },
        isActive: true,
        isDefault: false,
      },
      warnings: [],
    });

    const request = new Request("http://localhost/api/admin/models/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spaceUrl: "https://huggingface.co/spaces/owner/space" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.spaceId).toBe("owner/space");
    expect(payload.draft?.key).toBe("owner-space");
  });
});
