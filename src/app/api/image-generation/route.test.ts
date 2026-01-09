import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";
import { POST } from "@/app/api/image-generation/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockCreateMockGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/image-generation/image-generation-store", () => ({
  createMockGeneration: mockCreateMockGeneration,
}));

describe("POST /api/image-generation", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateMockGeneration.mockReset();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const request = new Request("http://localhost/api/image-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("유효하지 않은 요청이면 400을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });

    const request = new Request("http://localhost/api/image-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "" }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.message).toBe("INVALID_REQUEST");
  });

  it("정상 요청이면 생성 정보를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockCreateMockGeneration.mockResolvedValue({
      id: "request-id",
      status: "pending",
      progress: 0,
    });

    const request = new Request("http://localhost/api/image-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...imageGenerationDefaults,
        prompt: "hello",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("request-id");
    expect(payload.status).toBe("pending");
    expect(payload.progress).toBe(0);
  });

  it("저장 실패 시 500을 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockCreateMockGeneration.mockRejectedValue(new Error("db fail"));

    const request = new Request("http://localhost/api/image-generation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...imageGenerationDefaults,
        prompt: "hello",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.message).toBe("DB_SAVE_FAILED");
  });
});
