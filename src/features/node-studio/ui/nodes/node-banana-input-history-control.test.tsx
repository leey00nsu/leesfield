import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "@/test-utils/intl";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { NodeBananaInputHistoryControl } from "./node-banana-input-history-control";

const query = vi.hoisted(() => ({
  data: undefined as undefined | { pages: { items: MediaAssetDto[] }[] },
  isLoading: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  hasNextPage: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  requested: vi.fn(),
}));

const observers: { callback: IntersectionObserverCallback; root: Element | Document | null; target?: Element; disconnect: () => void }[] = [];
function intersect(observer = observers.at(-1)!, visible = true) {
  act(() => observer.callback([{ isIntersecting: visible, target: observer.target } as IntersectionObserverEntry], {} as IntersectionObserver));
}

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  useAssetProjects: () => ({ data: [] }),
  usePatchAssetMetadata: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useWriteAssetOrganization: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useMediaAssets: (...args: unknown[]) => {
    query.requested(...args);
    return query;
  },
}));

function control(onSelect = vi.fn()) {
  return (
    <NodeBananaInputHistoryControl
      nodeId="input"
      mediaType="image"
      selectedAssetId={null}
      writable
      onSelect={onSelect}
    />
  );
}

function openHistory(onSelect = vi.fn()) {
  const view = render(control(onSelect));
  fireEvent.click(screen.getByRole("button", { name: "에셋" }));
  return view;
}

describe("NodeBananaInputHistoryControl", () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal("IntersectionObserver", class {
      entry: typeof observers[number];
      constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
        this.entry = { callback, root: options.root ?? null, disconnect: vi.fn() };
        observers.push(this.entry);
      }
      observe(target: Element) { this.entry.target = target; }
      disconnect() { this.entry.disconnect(); }
    });
    Object.assign(query, {
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      hasNextPage: false,
    });
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("queries each source with the input media restriction", async () => {
    const user = userEvent.setup();
    openHistory();
    expect(screen.getAllByRole("button", { name: /닫기/ })).toHaveLength(1);
    expect(query.requested).toHaveBeenLastCalledWith("image", true, undefined, { sort: "latest", query: "" });
    await user.click(screen.getByRole("tab", { name: "생성" }));
    expect(query.requested).toHaveBeenLastCalledWith(
      "image",
      true,
      "generated",
      { sort: "latest", query: "" },
    );
    await user.click(screen.getByRole("tab", { name: "편집" }));
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "edited", { sort: "latest", query: "" });
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "전체" })).toHaveFocus();
    expect(
      screen.getByRole("tabpanel", { name: "전체" }),
    ).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "업로드" })).toHaveFocus();
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "uploads", { sort: "latest", query: "" });
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "생성" })).toHaveFocus();
  });

  it("leaves a controlled picker open until the pending import owner closes it", () => {
    query.data = {
      pages: [
        {
          items: [
            {
              id: "asset", name: "asset", version: 1, createdAt: "2026-10-13T00:00:00Z",
              type: "image",
              status: "completed",
              mimeType: "image/png",
              origin: "upload",
              url: "/asset.png",
            } as MediaAssetDto,
          ],
        },
      ],
    };
    const onSelect = vi.fn(),
      onOpenChange = vi.fn();
    render(
      <NodeBananaInputHistoryControl
        nodeId="pending"
        mediaType="image"
        selectedAssetId={null}
        writable
        open
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    );
    expect(screen.queryByText("image/png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "asset" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "asset" }));
    expect(onSelect).toHaveBeenCalledWith("asset");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog", { name: "에셋" })).toBeInTheDocument();
  });

  it("announces a failed query and retries instead of reporting empty history", () => {
    query.isError = true;
    const view = openHistory();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "파일을 불러오지 못했습니다. 다시 시도해 주세요.",
    );
    expect(
      screen.queryByText("No assets in this category."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(query.refetch).toHaveBeenCalledOnce();

    query.isFetching = true;
    query.hasNextPage = true;
    view.rerender(control());
    expect(
      screen.getByRole("button", { name: "다시 시도하는 중…" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: "더 불러오기" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("alert").closest('[aria-busy="true"]'),
    ).not.toBeNull();

    query.isError = false;
    query.isFetching = false;
    query.data = { pages: [{ items: [] }] };
    view.rerender(control());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByText("이 분류에는 파일이 없습니다."),
    ).toBeInTheDocument();
  });

  it("keeps previously loaded assets selectable after a refresh failure", () => {
    const asset: MediaAssetDto = {
      id: "saved-image", name: "Saved image",
      version: 1,
      type: "image",
      status: "completed",
      origin: "upload",
      mimeType: "image/png",
      bytes: null,
      width: null,
      height: null,
      durationMs: null,
      sourceOperationId: null,
      url: "/saved-image.png",
      createdAt: "2026-09-05",
      updatedAt: "2026-09-05",
    };
    query.data = { pages: [{ items: [asset] }] };
    const onSelect = vi.fn();
    const view = openHistory(onSelect);
    query.isError = true;
    view.rerender(control(onSelect));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Saved image" }));
    expect(onSelect).toHaveBeenCalledWith("saved-image");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("announces loading without showing the empty or failure state", () => {
    query.isLoading = true;
    query.isFetching = true;
    openHistory();
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중…");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No assets in this category."),
    ).not.toBeInTheDocument();
  });

  it("loads the next page from the modal scroll root once and stops at the last page", () => {
    query.hasNextPage = true;
    const view = openHistory();
    const observer = observers.at(-1)!;
    expect(observer.root).toBe(screen.getByRole("tabpanel", { name: "전체" }));
    expect(observer.target?.parentElement).toBe(observer.root);
    expect(screen.queryByRole("button", { name: "더 불러오기" })).not.toBeInTheDocument();
    intersect(observer, false);
    expect(query.fetchNextPage).not.toHaveBeenCalled();
    intersect(observer); intersect(observer);
    expect(query.fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
    query.isFetching = true; query.isFetchingNextPage = true;
    view.rerender(control());
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("불러오는 중…");
    intersect(observer);
    expect(query.fetchNextPage).toHaveBeenCalledOnce();
    query.isFetching = false; query.isFetchingNextPage = false;
    view.rerender(control());
    const next = observers.at(-1)!;
    query.hasNextPage = false;
    view.rerender(control());
    expect(next.disconnect).toHaveBeenCalledOnce();
    intersect(next);
    expect(query.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("stops automatic paging after a next-page failure and retries that page", () => {
    query.hasNextPage = true;
    const view = openHistory();
    const observer = observers.at(-1)!;
    query.isError = true; query.isFetchNextPageError = true;
    view.rerender(control());
    intersect(observer);
    expect(query.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(query.fetchNextPage).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
    expect(query.refetch).not.toHaveBeenCalled();
  });

  it("disconnects previous category and closed-dialog observers", () => {
    query.hasNextPage = true;
    openHistory();
    const upload = observers.at(-1)!;
    fireEvent.click(screen.getByRole("tab", { name: "생성" }));
    expect(upload.disconnect).toHaveBeenCalledOnce();
    intersect(upload);
    expect(query.fetchNextPage).not.toHaveBeenCalled();
    const generated = observers.at(-1)!;
    fireEvent.click(screen.getByRole("button", { name: "에셋 목록 닫기" }));
    expect(generated.disconnect).toHaveBeenCalledOnce();
    intersect(generated);
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });
});
