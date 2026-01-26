import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/admin/models/[modelKey]/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockUpdateHandler = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/model-catalog/handlers/update-model-catalog", () => ({
  updateModelCatalogHandler: mockUpdateHandler,
}));

type RouteContext = {
  params: Promise<{ modelKey: string }>;
};

describe("/api/admin/models/[modelKey]", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdateHandler.mockReset();
  });

  it("인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/admin/models/z-image-turbo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "New" }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ modelKey: "z-image-turbo" }),
    } satisfies RouteContext);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("유효하지 않은 payload면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockUpdateHandler.mockRejectedValue(new Error("INVALID_PAYLOAD"));

    const request = new Request("http://localhost/api/admin/models/z-image-turbo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ modelKey: "z-image-turbo" }),
    } satisfies RouteContext);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_PAYLOAD");
  });

  it("정상 요청이면 수정 결과를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockUpdateHandler.mockResolvedValue({ key: "z-image-turbo" });

    const request = new Request("http://localhost/api/admin/models/z-image-turbo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Updated" }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ modelKey: "z-image-turbo" }),
    } satisfies RouteContext);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.key).toBe("z-image-turbo");
    expect(mockUpdateHandler).toHaveBeenCalledWith({
      key: "z-image-turbo",
      payload: { label: "Updated" },
    });
  });
});
