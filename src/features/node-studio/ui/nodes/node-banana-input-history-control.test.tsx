import { fireEvent, render, screen } from "@testing-library/react";
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
  useMediaAssets: (...args: unknown[]) => { query.requested(...args); return query; },
}));

function control(onSelect = vi.fn()) {
  return <NodeBananaInputHistoryControl nodeId="input" mediaType="image" selectedAssetId={null} writable onSelect={onSelect} />;
}

function openHistory(onSelect = vi.fn()) {
  const view = render(control(onSelect));
  fireEvent.click(screen.getByRole("button", { name: "Assets" }));
  return view;
}

describe("NodeBananaInputHistoryControl", () => {
  beforeEach(() => {
    Object.assign(query, { data: undefined, isLoading: false, isError: false, isFetching: false, hasNextPage: false });
    vi.clearAllMocks();
  });

  it("queries each source with the input media restriction", () => {
    openHistory();
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "uploads");
    fireEvent.click(screen.getByRole("tab", { name: "Generated" }));
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "generated");
    fireEvent.click(screen.getByRole("tab", { name: "Edited" }));
    expect(query.requested).toHaveBeenLastCalledWith("image", true, "edited");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Edited" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "Uploads" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Uploads" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Uploads" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Generated" })).toHaveFocus();
  });

  it("leaves a controlled picker open until the pending import owner closes it", () => {
    query.data = { pages: [{ items: [{ id: "asset", type: "image", mimeType: "image/png", origin: "upload", url: "/asset.png" } as MediaAssetDto] }] };
    const onSelect = vi.fn(), onOpenChange = vi.fn();
    render(<NodeBananaInputHistoryControl nodeId="pending" mediaType="image" selectedAssetId={null} writable open onSelect={onSelect} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: "image/png" }));
    expect(onSelect).toHaveBeenCalledWith("asset");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("dialog", { name: "Assets" })).toBeInTheDocument();
  });

  it("announces a failed query and retries instead of reporting empty history", () => {
    query.isError = true;
    const view = openHistory();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load assets. Please try again.");
    expect(screen.queryByText("No assets in this category.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(query.refetch).toHaveBeenCalledOnce();

    query.isFetching = true;
    query.hasNextPage = true;
    view.rerender(control());
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Load more" })).toBeDisabled();
    expect(screen.getByRole("alert").closest('[aria-busy="true"]')).not.toBeNull();

    query.isError = false;
    query.isFetching = false;
    query.data = { pages: [{ items: [] }] };
    view.rerender(control());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No assets in this category.")).toBeInTheDocument();
  });

  it("keeps previously loaded assets selectable after a refresh failure", () => {
    const asset: MediaAssetDto = {
      id: "saved-image", version: 1, type: "image", status: "completed", origin: "upload",
      mimeType: "image/png", bytes: null, width: null, height: null, durationMs: null,
      sourceOperationId: null, url: "/saved-image.png", createdAt: "2026-09-05", updatedAt: "2026-09-05",
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
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("No assets in this category.")).not.toBeInTheDocument();
  });
});
