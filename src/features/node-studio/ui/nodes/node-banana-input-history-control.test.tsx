import userEvent from "@testing-library/user-event";
import { renderWithIntl as render } from "@/test-utils/intl";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { NodeBananaInputHistoryControl } from "./node-banana-input-history-control";

const query = vi.hoisted(() => ({
  data: undefined as undefined | { pages: { items: MediaAssetDto[] }[] },
  isLoading: false,
  isError: false,
  isFetching: false,
  hasNextPage: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  requested: vi.fn(),
}));

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
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
    Object.assign(query, {
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      hasNextPage: false,
    });
    vi.clearAllMocks();
  });

  it("queries each source with the input media restriction", async () => {
    const user = userEvent.setup();
    openHistory();
    expect(screen.getAllByRole("button", { name: /닫기/ })).toHaveLength(1);
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "uploads");
    await user.click(screen.getByRole("tab", { name: "생성" }));
    expect(query.requested).toHaveBeenLastCalledWith(
      "image",
      true,
      "generated",
    );
    await user.click(screen.getByRole("tab", { name: "편집" }));
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "edited");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "업로드" })).toHaveFocus();
    expect(
      screen.getByRole("tabpanel", { name: "업로드" }),
    ).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "생성" })).toHaveFocus();
  });

  it("leaves a controlled picker open until the pending import owner closes it", () => {
    query.data = {
      pages: [
        {
          items: [
            {
              id: "asset",
              type: "image",
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
    fireEvent.click(screen.getByRole("button", { name: "image/png" }));
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
    expect(screen.getByRole("button", { name: "더 불러오기" })).toBeDisabled();
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
      id: "saved-image",
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
    fireEvent.click(screen.getByRole("button", { name: "image/png" }));
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
});
