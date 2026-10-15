import { act, renderHook, waitFor } from "@testing-library/react";
import { useImageGeneration } from "@/features/image-generation/hook/use-image-generation";
import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";
import { createIntlWrapper } from "@/test-utils/intl";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";

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
      progress: 12, createdAt:"2026-10-15T00:00:00Z",
    });

    mockFetchImageGenerationStatus.mockResolvedValueOnce({
      requestId: "request-id",
      status: "completed",
      progress: 100, createdAt:"2026-10-15T00:00:00Z", finishedAt:"2026-10-15T00:00:08Z",
      result: {
        images: [{ url: "https://example.com/result.png" }],
      },
    });

    const { result } = renderHook(() => useImageGeneration(), {
      wrapper: createIntlWrapper(),
    });

    await act(async () => {
      await result.current.startGeneration(payload);
    });

    expect(mockRequestImageGeneration).toHaveBeenCalledWith(payload, expect.objectContaining({idempotencyKey:expect.any(String),signal:expect.any(AbortSignal)}));

    await waitFor(() =>
      expect(result.current.state.status).toBe("completed"),
    );

    expect(result.current.state.progress).toBe(0);
    expect(result.current.state.createdAt).toBe("2026-10-15T00:00:00Z");
    expect(result.current.state.finishedAt).toBe("2026-10-15T00:00:08Z");
    expect(result.current.state.result?.images).toHaveLength(1);
    expect(mockFetchImageGenerationStatus).toHaveBeenCalled();
  });

  it("stops a cancelled batch without submitting remaining paid requests", async () => {
    mockRequestImageGeneration.mockResolvedValueOnce({requestId:"cancelled",status:"cancelled",progress:0,createdAt:"2026-10-15T00:00:00Z",finishedAt:"2026-10-15T00:00:05Z"});
    const {result}=renderHook(()=>useImageGeneration(),{wrapper:createIntlWrapper()});
    await act(async()=>{await result.current.startGeneration(payload,4)});
    await waitFor(()=>expect(result.current.state.status).toBe("cancelled"));
    expect(mockRequestImageGeneration).toHaveBeenCalledTimes(1);
    expect(mockFetchImageGenerationStatus).not.toHaveBeenCalled();
    expect(result.current.state.finishedAt).toBe("2026-10-15T00:00:05Z");
    expect(result.current.state.slots?.map(slot => slot.status)).toEqual(Array(4).fill("cancelled"));
  });

  it("요청 실패 시 실패 상태와 메시지를 설정한다", async () => {
    mockRequestImageGeneration.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() => useImageGeneration(), {
      wrapper: createIntlWrapper(),
    });

    await act(async () => {
      await result.current.startGeneration(payload);
    });

    expect(result.current.state.status).toBe("failed");
    expect(result.current.state.errorMessage).toBe("요청에 실패했습니다.");
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

    const { result } = renderHook(() => useImageGeneration(), {
      wrapper: createIntlWrapper(),
    });

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
  it("repeats the same snapshot with distinct intents and retains successful images across a failed slot", async () => {
    mockRequestImageGeneration.mockResolvedValueOnce({requestId:"first",status:"completed",progress:100,result:{images:[{url:"https://example.com/a.png"},{url:"https://example.com/b.png"}]}})
      .mockResolvedValueOnce({requestId:"second",status:"failed",progress:0,errorMessage:"provider failed"})
      .mockResolvedValueOnce({requestId:"third",status:"completed",progress:100,result:{images:[{url:"https://example.com/c.png"}]}});
    const {result}=renderHook(()=>useImageGeneration(),{wrapper:createIntlWrapper()});
    await act(async()=>{await result.current.startGeneration(payload,3);});
    await waitFor(()=>expect(result.current.state.batch).toEqual({total:3,finished:3,failed:1}));
    expect(result.current.state.status).toBe("completed");
    expect(result.current.state.slots?.map(slot => [slot.status, slot.images.length])).toEqual([["completed", 2], ["failed", 0], ["completed", 1]]);
    expect(mockRequestImageGeneration).toHaveBeenCalledTimes(3);
    const calls=mockRequestImageGeneration.mock.calls;
    expect(calls.map(([values])=>values)).toEqual([payload,payload,payload]);
    expect(new Set(calls.map(([,options])=>options.idempotencyKey)).size).toBe(3);
    expect(result.current.state.result?.images).toMatchObject([{requestId:"first",outputIndex:0},{requestId:"first",outputIndex:1},{requestId:"third",outputIndex:0}]);
  });
  it("does not merge separate intents after a transport failure or retry a failed slot", async () => {
    mockRequestImageGeneration.mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({requestId:"next",status:"completed",progress:100,result:{images:[{url:"https://example.com/next.png"}]}});
    const {result}=renderHook(()=>useImageGeneration(),{wrapper:createIntlWrapper()});
    await act(async()=>{await result.current.startGeneration(payload,2);});
    await waitFor(()=>expect(result.current.state.batch?.finished).toBe(2));
    expect(mockRequestImageGeneration).toHaveBeenCalledTimes(2);
    expect(mockRequestImageGeneration.mock.calls[0][1].idempotencyKey).not.toBe(mockRequestImageGeneration.mock.calls[1][1].idempotencyKey);
    expect(result.current.state.result?.images).toHaveLength(1);
  });
  it("rejects duplicate starts and stops remaining calls and late responses after reset", async () => {
    let resolve!: (value: unknown)=>void;
    mockRequestImageGeneration.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
    const {result}=renderHook(()=>useImageGeneration(),{wrapper:createIntlWrapper()});
    await act(async()=>{await result.current.startGeneration(payload,4);await result.current.startGeneration(payload,2);});
    expect(mockRequestImageGeneration).toHaveBeenCalledTimes(1);
    const signal=mockRequestImageGeneration.mock.calls[0][1].signal;
    act(()=>result.current.reset());expect(signal.aborted).toBe(true);
    await act(async()=>{resolve({requestId:"late",status:"completed",progress:100,result:{images:[{url:"https://example.com/late.png"}]}});});
    expect(result.current.state).toEqual({status:"idle",progress:0});expect(mockRequestImageGeneration).toHaveBeenCalledTimes(1);
  });
  it("freezes conditions across sequential calls and stops after unmount", async () => {
    let resolve!: (value: unknown)=>void;
    mockRequestImageGeneration.mockReturnValueOnce(new Promise(r=>{resolve=r;}))
      .mockResolvedValueOnce({requestId:"second",status:"completed",progress:100,result:{images:[]}});
    const draft={...payload,dynamicParams:{strength:0.5},cinema:{...defaultCinemaSettings(),camera:"16mm-film"}};
    const {result,unmount}=renderHook(()=>useImageGeneration(),{wrapper:createIntlWrapper()});
    await act(async()=>{await result.current.startGeneration(draft,2);});
    draft.prompt="later prompt";draft.dynamicParams.strength=1;
    draft.cinema.camera="modular-8k";
    await act(async()=>{resolve({requestId:"first",status:"completed",progress:100,result:{images:[]}});});
    await waitFor(()=>expect(mockRequestImageGeneration).toHaveBeenCalledTimes(2));
    expect(mockRequestImageGeneration.mock.calls[1][0]).toMatchObject({prompt:"a test prompt",dynamicParams:{strength:0.5},cinema:{camera:"16mm-film"}});
    unmount();
    mockRequestImageGeneration.mockReset();mockRequestImageGeneration.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
    const next=renderHook(()=>useImageGeneration(),{wrapper:createIntlWrapper()});
    await act(async()=>{await next.result.current.startGeneration(payload,4);});
    next.unmount();expect(mockRequestImageGeneration.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async()=>{resolve({requestId:"late",status:"completed",progress:100});});
    expect(mockRequestImageGeneration).toHaveBeenCalledTimes(1);
  });

it("reserves every slot before submission and publishes the first result while the next request is unresolved", async () => {
  let first!: (value: unknown) => void;
  mockRequestImageGeneration.mockReturnValueOnce(new Promise(resolve => { first = resolve; }))
    .mockReturnValueOnce(new Promise(() => {}));
  const { result, unmount } = renderHook(() => useImageGeneration(), { wrapper: createIntlWrapper() });
  await act(async () => { await result.current.startGeneration({ ...imageGenerationDefaults, prompt: "scene" }, 4); });
  const ids = result.current.state.slots!.map(slot => slot.id);
  expect(ids).toHaveLength(4);
  expect(result.current.state.slots!.every(slot => slot.status === "pending" && !slot.createdAt)).toBe(true);
  expect(mockRequestImageGeneration).toHaveBeenCalledTimes(1);
  await act(async () => { first({ requestId: "first", status: "completed", progress: 100, result: { images: [{ url: "/first.webp" }] } }); });
  await waitFor(() => expect(mockRequestImageGeneration).toHaveBeenCalledTimes(2));
  expect(result.current.state.status).toBe("processing");
  expect(result.current.state.slots!.map(slot => slot.id)).toEqual(ids);
  expect(result.current.state.slots![0].images[0].url).toBe("/first.webp");
  expect(result.current.state.slots!.slice(1).every(slot => slot.status === "pending")).toBe(true);
  unmount();
});

});
