import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl";
import { describe, expect, it, vi, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaAssetPicker } from "./media-asset-picker";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { listMediaAssets, getAssetProjects, patchAssetMetadata } from "../api/media-asset-api";
vi.mock("../api/media-asset-api", async importOriginal => ({ ...await importOriginal<typeof import("../api/media-asset-api")>(), listMediaAssets: vi.fn(), getAssetProjects: vi.fn(), patchAssetMetadata: vi.fn() }));
const asset: MediaAssetDto = { id: "stable-id", version: 3, name: "Cafe portrait", type: "image", status: "completed", origin: "upload", mimeType: "image/png", url: "/cafe.png", bytes: "12", width: 512, height: 512, durationMs: null, sourceOperationId: null, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z", tags: [] };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function renderPicker(props: Partial<Parameters<typeof MediaAssetPicker>[0]> = {}) {
  vi.mocked(listMediaAssets).mockResolvedValue({ items: [asset], nextCursor: null });
  vi.mocked(getAssetProjects).mockResolvedValue([{ id: "project", name: "Cafe", parentId: null, version: 1, createdAt: "", updatedAt: "", description: "", coverAssetId: null, cover: null }]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const select = vi.fn();
  renderWithIntl(<QueryClientProvider client={client}><MediaAssetPicker open writable mediaType="image" onOpenChange={vi.fn()} onSelect={select} {...props} /></QueryClientProvider>);
  return { select, client };
}
describe("common asset picker", () => {
  it("shows original generated audio text from the list DTO without per-card history requests", async () => {
    const text = "원래 생성한 TTS 대본입니다.\nOriginal narration from the authoring snapshot.";
    const audio = { ...asset, id: "generated-audio", type: "audio" as const, origin: "generation" as const,
      name: "Audio label", inputPrompt: text, durationMs: 17972, mimeType: "audio/wav" };
    const fetch = vi.spyOn(globalThis, "fetch");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    try {
      vi.mocked(listMediaAssets).mockResolvedValueOnce({ items: [audio, { ...audio, id: "second-audio", name: "Second audio" }], nextCursor: null });
      const { client, select } = renderPicker({ mediaType: "audio" });
      const card = await screen.findByRole("button", { name: "Audio label" });
      expect(screen.getAllByTitle(text, { normalizer: value => value })).toHaveLength(2);
      expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/history"))).toBe(false);
      expect(play).not.toHaveBeenCalled();
      fireEvent.click(card);
      expect(select).toHaveBeenCalledWith(audio);
      cleanup(); client.clear();
    } finally { cleanup(); fetch.mockRestore(); play.mockRestore(); pause.mockRestore(); load.mockRestore(); }
  });

  it("uses the shared loading gallery and loads the next cursor when the modal sentinel intersects", async () => {
    let finish!: (value: Awaited<ReturnType<typeof listMediaAssets>>) => void;
    vi.mocked(listMediaAssets).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let intersect: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    try {
      const { client } = renderPicker();
      expect(document.querySelector('[data-app-media-gallery][aria-busy="true"]')).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "더 불러오기" })).not.toBeInTheDocument();
      await act(async () => finish({ items: [asset], nextCursor: "page-2" }));
      await screen.findByRole("button", { name: "Cafe portrait" });
      await waitFor(() => expect(intersect).toBeDefined());
      vi.mocked(listMediaAssets).mockResolvedValueOnce({ items: [{ ...asset, id: "second-id", name: "Second portrait" }], nextCursor: null });
      await act(async () => intersect!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      await screen.findByRole("button", { name: "Second portrait" });
      expect(listMediaAssets).toHaveBeenLastCalledWith("image", "page-2", expect.any(AbortSignal), undefined, { query: "", sort: "latest" });
      expect(screen.getAllByRole("button", { name: "Cafe portrait" })).toHaveLength(1);
      client.clear();
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps search across source and media tabs, defaults to all sources, and clears empty-result conditions", async () => {
    const {client} = renderPicker({mediaType:undefined});
    await screen.findByRole("button", {name:"Cafe portrait"});
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", {name:"검색"}));
    await user.type(screen.getByRole("searchbox", {name:"이름, ID 검색"}), "missing");
    await waitFor(() => expect(listMediaAssets).toHaveBeenLastCalledWith("image", null, expect.any(AbortSignal), undefined, {query:"missing",sort:"latest"}));
    vi.mocked(listMediaAssets).mockResolvedValue({items:[],nextCursor:null});
    await user.click(screen.getByRole("tab", {name:"생성"}));
    await user.click(screen.getByRole("button", {name:"검색"}));
    expect(screen.getByRole("searchbox", {name:"이름, ID 검색"})).toHaveValue("missing");
    await user.click(screen.getByRole("tab", {name:"비디오"}));
    await waitFor(() => expect(listMediaAssets).toHaveBeenLastCalledWith("video", null, expect.any(AbortSignal), "generated", {query:"missing",sort:"latest"}));
    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name:"조건 지우기"}));
    await user.click(screen.getByRole("button", {name:"검색"}));
    expect(screen.getByRole("searchbox", {name:"이름, ID 검색"})).toHaveValue("");
    client.clear();
  });

  it("shows names and stable IDs, and sends project/star filters to the server", async () => {
    const { select, client } = renderPicker();
    await screen.findByRole("button", { name: "Cafe portrait" });
    expect(screen.getByText("stable-id")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", {name:"필터"}));
    await user.click(screen.getByRole("combobox", { name: "프로젝트" }));
    await user.click(await screen.findByRole("option", { name: "Cafe" }));
    await waitFor(() => expect(listMediaAssets).toHaveBeenLastCalledWith("image", null, expect.any(AbortSignal), undefined, { query: "", sort: "latest", projectId: "project" }));
    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기" }));
    await act(async () => {});
    await waitFor(() => expect(listMediaAssets).toHaveBeenLastCalledWith("image", null, expect.any(AbortSignal), undefined, { query: "", sort: "latest", projectId: "project", starred: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Cafe portrait" }));
    expect(select).toHaveBeenCalledWith(asset); client.clear();
  });
  it("updates starred metadata without selecting or uploading a file", async () => {
    vi.mocked(patchAssetMetadata).mockResolvedValue({ ...asset, starred: true, version: 4 });
    const { select, client } = renderPicker();
    await screen.findByRole("button", { name: "Cafe portrait" });
    fireEvent.click(screen.getByRole("button", { name: "즐겨찾기 추가" }));
    await act(async () => {});
    expect(patchAssetMetadata).toHaveBeenCalledWith("stable-id", { expectedVersion: 3, starred: true });
    expect(select).not.toHaveBeenCalled(); client.clear();
  });
  it("keeps role restrictions and read-only selection disabled", async () => {
    const { select, client } = renderPicker({ canSelectAsset: () => false, writable: false });
    const button = await screen.findByRole("button", { name: "Cafe portrait" });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(select).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "즐겨찾기 추가" })).not.toBeInTheDocument(); client.clear();
  });
  it("debounces search and does not filter only the loaded page", async () => {
    const { client } = renderPicker(); await screen.findByRole("button", { name: "Cafe portrait" });
    fireEvent.click(screen.getByRole("button", {name:"검색"}));
    vi.useFakeTimers(); fireEvent.change(screen.getByRole("searchbox", { name: "이름, ID 검색" }), { target: { value: "unloaded" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(listMediaAssets).toHaveBeenLastCalledWith("image", null, expect.any(AbortSignal), undefined, { query: "unloaded", sort: "latest" }); client.clear();
  });
});
