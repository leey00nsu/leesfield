import { act, renderHook, waitFor } from "@testing-library/react";
import { useImageGeneration } from "@/features/image-generation/hook/use-image-generation";
import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";

const mockRequestImageGeneration = vi.hoisted(() => vi.fn());
const mockFetchImageGenerationStatus = vi.hoisted(() => vi.fn());

vi.mock("@/features/image-generation/api/image-generation-api", () => ({
  requestImageGeneration: mockRequestImageGeneration,
  fetchImageGenerationStatus: mockFetchImageGenerationStatus,
}));

describe("useImageGeneration", () => {
  const payload = {
    ...imageGenerationDefaults,
    prompt: "a test prompt",
  };

  afterEach(() => {
    vi.useRealTimers();
    mockRequestImageGeneration.mockReset();
    mockFetchImageGenerationStatus.mockReset();
  });

  it("요청 성공 시 상태를 업데이트하고 폴링 결과를 반영한다", async () => {
    mockRequestImageGeneration.mockResolvedValueOnce({
      requestId: "request-id",
      status: "processing",
      progress: 12,
    });

    mockFetchImageGenerationStatus.mockResolvedValueOnce({
      requestId: "request-id",
      status: "completed",
      progress: 100,
      result: {
        images: [{ url: "https://example.com/result.png" }],
      },
    });

    const { result } = renderHook(() => useImageGeneration());

    await act(async () => {
      await result.current.startGeneration(payload);
    });

    expect(mockRequestImageGeneration).toHaveBeenCalledWith(payload);

    await waitFor(() =>
      expect(result.current.state.status).toBe("completed"),
    );

    expect(result.current.state.progress).toBe(100);
    expect(result.current.state.result?.images).toHaveLength(1);
    expect(mockFetchImageGenerationStatus).toHaveBeenCalled();
  });

  it("요청 실패 시 실패 상태와 메시지를 설정한다", async () => {
    mockRequestImageGeneration.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useImageGeneration());

    await act(async () => {
      await result.current.startGeneration(payload);
    });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.errorMessage).toBe("boom");
    expect(mockFetchImageGenerationStatus).not.toHaveBeenCalled();
  });

  it("폴링 타임아웃이 발생하면 실패 상태로 전환된다", async () => {
    vi.useFakeTimers();
    const startTime = new Date("2024-01-01T00:00:00.000Z");
    const timeoutMs = 300_000 + 30_000;
    vi.setSystemTime(startTime);

    mockRequestImageGeneration.mockResolvedValueOnce({
      requestId: "request-id",
      status: "processing",
      progress: 12,
    });

    mockFetchImageGenerationStatus.mockResolvedValue({
      requestId: "request-id",
      status: "processing",
      progress: 42,
    });

    const { result } = renderHook(() => useImageGeneration());

    await act(async () => {
      await result.current.startGeneration(payload);
    });

    vi.setSystemTime(new Date(startTime.getTime() + timeoutMs + 1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.errorMessage).toBe("응답 시간이 초과되었습니다.");
  });
});
