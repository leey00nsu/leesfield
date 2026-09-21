import { GET } from "@/app/api/audio-generation/[requestId]/download/route";

const mockGetSession = vi.hoisted(() => vi.fn());
const mockGetAudioGenerationByRequestId = vi.hoisted(() => vi.fn());
const mockRequestRemoteStream = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/server/audio-generation/audio-generation-repository", () => ({
  getAudioGenerationByRequestId: mockGetAudioGenerationByRequestId,
}));

vi.mock("@/server/http/safe-remote", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/http/safe-remote")>(),
  requestRemoteStream: mockRequestRemoteStream,
}));

describe("GET /api/audio-generation/[requestId]/download", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetAudioGenerationByRequestId.mockReset();
    mockRequestRemoteStream.mockReset();
    vi.restoreAllMocks();
  });

  it("로그인하지 않은 경우 401을 반환한다", async () => {
    mockGetSession.mockResolvedValue({ isLoggedIn: false });

    const response = await GET(
      new Request("http://localhost/api/audio-generation/request-id/download"),
      { params: Promise.resolve({ requestId: "request-id" }) },
    );

    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.message).toBe("UNAUTHORIZED");
  });

  it("다운로드 응답에 실제 오디오 확장자와 헤더를 설정한다", async () => {
    const wavHeader = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    ]);

    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetAudioGenerationByRequestId.mockResolvedValue({
      audios: [
        {
          url: "https://cdn.example.com/generated/request-id-1.wav",
          durationSec: 1.2,
        },
      ],
    });
    mockRequestRemoteStream.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      body: new Response(wavHeader).body,
      location: null,
      url: "https://cdn.example.com/generated/request-id-1.wav",
    });

    const response = await GET(
      new Request(
        "http://localhost/api/audio-generation/request-id/download?index=0",
      ),
      { params: Promise.resolve({ requestId: "request-id" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="request-id-1.wav"',
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("upstream body 읽기가 timeout을 넘기면 502를 반환한다", async () => {
    mockGetSession.mockResolvedValue({
      isLoggedIn: true,
      adminEmail: "admin@example.com",
    });
    mockGetAudioGenerationByRequestId.mockResolvedValue({
      audios: [
        {
          url: "https://cdn.example.com/generated/request-id-1.wav",
          durationSec: 1.2,
        },
      ],
    });
    const { RemoteAccessError } = await import("@/server/http/safe-remote");
    mockRequestRemoteStream.mockRejectedValue(
      new RemoteAccessError("REMOTE_TIMEOUT"),
    );

    const responsePromise = GET(
      new Request(
        "http://localhost/api/audio-generation/request-id/download?index=0",
      ),
      { params: Promise.resolve({ requestId: "request-id" }) },
    );

    const response = await responsePromise;
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.message).toBe("AUDIO_FETCH_TIMEOUT");
  });
});
