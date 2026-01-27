import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "@/app/api/admin/models/[modelKey]/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockUpdateHandler = vi.hoisted(() => vi.fn());
const mockDeleteHandler = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/model-catalog/handlers/update-model-catalog", () => ({
  updateModelCatalogHandler: mockUpdateHandler,
}));
vi.mock("@/server/model-catalog/handlers/delete-model-catalog", () => ({
  deleteModelCatalogHandler: mockDeleteHandler,
}));

type RouteContext = {
  params: Promise<{ modelKey: string }>;
};

describe("/api/admin/models/[modelKey]", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdateHandler.mockReset();
    mockDeleteHandler.mockReset();
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

  it("삭제 요청이 인증되지 않으면 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/admin/models/z-image-turbo", {
      method: "DELETE",
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ modelKey: "z-image-turbo" }),
    } satisfies RouteContext);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("삭제 대상이 없으면 404를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockDeleteHandler.mockRejectedValue(new Error("MODEL_NOT_FOUND"));

    const request = new Request("http://localhost/api/admin/models/z-image-turbo", {
      method: "DELETE",
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ modelKey: "z-image-turbo" }),
    } satisfies RouteContext);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.message).toBe("NOT_FOUND");
  });

  it("삭제 요청이 정상 처리되면 결과를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockDeleteHandler.mockResolvedValue({ key: "z-image-turbo" });

    const request = new Request("http://localhost/api/admin/models/z-image-turbo", {
      method: "DELETE",
    });
    const response = await DELETE(request, {
      params: Promise.resolve({ modelKey: "z-image-turbo" }),
    } satisfies RouteContext);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.key).toBe("z-image-turbo");
    expect(mockDeleteHandler).toHaveBeenCalledWith("z-image-turbo");
  });
});
