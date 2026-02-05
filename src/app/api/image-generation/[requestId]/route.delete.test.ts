import { DELETE } from "@/app/api/image-generation/[requestId]/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockDeleteLeemageFilesByPrefix = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    imageGeneration: {
      findFirst: mockFindFirst,
      delete: mockDelete,
    },
  },
}));

vi.mock("@/server/shared/leemage-file-deleter", () => ({
  deleteLeemageFilesByPrefix: mockDeleteLeemageFilesByPrefix,
}));

describe("DELETE /api/image-generation/[requestId]", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockGetSession.mockReset();
    mockFindFirst.mockReset();
    mockDelete.mockReset();
    mockDeleteLeemageFilesByPrefix.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("요청이 없으면 404를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockFindFirst.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "missing-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.message).toBe("NOT_FOUND");
  });

  it("진행 중인 요청이면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockFindFirst.mockResolvedValue({
      id: "db-id",
      status: "processing",
      requestId: "request-id",
    });

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("IN_PROGRESS");
  });

  it("스토리지 삭제가 실패하면 500을 반환하고 DB를 삭제하지 않는다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockFindFirst.mockResolvedValue({
      id: "db-id",
      status: "completed",
      requestId: "request-id",
    });
    mockDeleteLeemageFilesByPrefix.mockRejectedValue(new Error("fail"));

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("STORAGE_DELETE_FAILED");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("스토리지 삭제 후 DB 레코드를 삭제한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockFindFirst.mockResolvedValue({
      id: "db-id",
      status: "completed",
      requestId: "request-id",
    });
    mockDeleteLeemageFilesByPrefix.mockResolvedValue({
      matchedCount: 2,
      deletedCount: 2,
    });

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toBe("DELETED");
    expect(mockDeleteLeemageFilesByPrefix).toHaveBeenCalledWith("request-id-");
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "db-id" } });
  });

  it("스토리지 삭제 성공 후 DB 삭제가 실패하면 500을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockFindFirst.mockResolvedValue({
      id: "db-id",
      status: "completed",
      requestId: "request-id",
    });
    mockDeleteLeemageFilesByPrefix.mockResolvedValue({
      matchedCount: 1,
      deletedCount: 1,
    });
    mockDelete.mockRejectedValue(new Error("db error"));

    const response = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("DB_DELETE_FAILED");
    expect(mockDeleteLeemageFilesByPrefix).toHaveBeenCalledWith("request-id-");
  });
});
