import { GET } from "@/app/api/external/audio-generation/[requestId]/route";
import { NextResponse } from "next/server";

const mockRequireApiKey = vi.hoisted(() => vi.fn());
const mockGetAudioGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/api-key-guard", () => ({
  requireApiKey: mockRequireApiKey,
}));

vi.mock("@/server/audio-generation/audio-generation-store", () => ({
  getAudioGeneration: mockGetAudioGeneration,
}));

describe("GET /api/external/audio-generation/[requestId]", () => {
  beforeEach(() => {
    mockRequireApiKey.mockReset();
    mockGetAudioGeneration.mockReset();
  });

  it("API 키가 없으면 인증 응답을 그대로 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue(
      NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 }),
    );

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("요청이 없으면 404를 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
    mockGetAudioGeneration.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "missing-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.message).toBe("NOT_FOUND");
  });

  it("요청이 존재하면 상태를 반환한다", async () => {
    mockRequireApiKey.mockResolvedValue({
      ownerEmail: "api@example.com",
      apiKeyId: "key-id",
    });
    mockGetAudioGeneration.mockResolvedValue({
      id: "request-id",
      status: "completed",
      progress: 100,
      result: { audios: [{ url: "https://example.com/1.mp3" }] },
      errorMessage: "warn",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ requestId: "request-id" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.requestId).toBe("request-id");
    expect(payload.status).toBe("completed");
    expect(payload.progress).toBe(100);
    expect(payload.result?.audios).toHaveLength(1);
    expect(payload.errorMessage).toBe("warn");
  });
});
