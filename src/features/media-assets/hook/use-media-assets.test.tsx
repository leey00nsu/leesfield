import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useMediaAssetList } from "./use-media-assets";
import { getMediaAsset } from "../api/media-asset-api";
vi.mock("../api/media-asset-api", () => ({ getMediaAsset: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("recovers a result lookup after transient retries are exhausted without starting a generation", async () => {
  vi.useFakeTimers();
  vi.mocked(getMediaAsset).mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ id: "late", url: "/late.png" } as Awaited<ReturnType<typeof getMediaAsset>>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const view = renderHook(() => useMediaAssetList(["late"]), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(view.result.current[0].isError).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(view.result.current[0].data?.url).toBe("/late.png");
  expect(getMediaAsset).toHaveBeenCalledTimes(2);
  view.unmount();
  client.clear();
});
