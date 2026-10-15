import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { useAssetLibraryUploads } from "./use-asset-library-uploads";
import { uploadMediaAsset, patchAssetMetadata } from "../api/media-asset-api";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
vi.mock("../api/media-asset-api", () => ({ uploadMediaAsset: vi.fn(), patchAssetMetadata: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); });
const file = () => new File(["png"], "new.png", { type: "image/png" });
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; return { ...renderHook(useAssetLibraryUploads, { wrapper }), client }; }
describe("library upload lifetime", () => {
  it("shows a temporary uploading entry immediately and replaces it after confirm", async () => {
    let complete!: (asset: MediaAssetDto) => void;
    vi.mocked(uploadMediaAsset).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const hook = setup();
    act(() => { hook.result.current.add([file()], null); });
    expect(hook.result.current.uploads[0]).toMatchObject({ status: "uploading", file: expect.any(File) });
    await act(async () => { complete({ id: "durable", version: 1 } as MediaAssetDto); });
    await waitFor(() => expect(hook.result.current.uploads).toEqual([]));
    expect(hook.client.getQueryData(["media-assets", "detail", "durable"])).toMatchObject({ id: "durable" }); hook.unmount();
  });
  it("can cancel a queued file and retry without duplicate uploads or late resurrection", async () => {
    const pending: { signal?: AbortSignal; reject: (error: Error) => void }[] = [];
    vi.mocked(uploadMediaAsset).mockImplementation((_file, _type, _binding, signal) => new Promise((_resolve, reject) => { pending.push({ signal, reject }); }));
    const hook = setup(); act(() => { hook.result.current.add([file(), file(), file()], null); });
    expect(uploadMediaAsset).toHaveBeenCalledTimes(2);
    const queued = hook.result.current.uploads[2].id;
    act(() => { hook.result.current.cancel(queued); hook.result.current.retry(queued); });
    await act(async () => { pending[0].reject(new Error("offline")); });
    expect(uploadMediaAsset).toHaveBeenCalledTimes(3);
    act(() => { hook.result.current.remove(queued); });
    expect(pending[2].signal?.aborted).toBe(true);
    await act(async () => { pending[2].reject(new Error("cancelled")); });
    expect(hook.result.current.uploads.some(entry => entry.id === queued)).toBe(false); hook.unmount();
  });
  it("keeps a successful original when project placement fails and does not retry upload", async () => {
    vi.mocked(uploadMediaAsset).mockResolvedValue({ id: "durable", version: 1 } as MediaAssetDto);
    vi.mocked(patchAssetMetadata).mockRejectedValue(new Error("conflict"));
    const hook = setup(); act(() => { hook.result.current.add([file()], "project"); });
    await waitFor(() => expect(hook.result.current.uploads[0]).toMatchObject({ status: "completed", placementFailed: true, asset: { id: "durable" } }));
    expect(patchAssetMetadata).toHaveBeenCalledWith("durable", { expectedVersion: 1, projectIds: ["project"] });
    expect(uploadMediaAsset).toHaveBeenCalledTimes(1); hook.unmount();
  });
});
