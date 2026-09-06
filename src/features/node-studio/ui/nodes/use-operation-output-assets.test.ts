import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NodeExecutionDto } from "../../model/node-execution-types";

const mocks = vi.hoisted(() => ({
  useMediaAssetList: vi.fn(),
}));

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({
  useMediaAssetList: mocks.useMediaAssetList,
}));

import { useOperationOutputAssets } from "./use-operation-output-assets";

const completedExecution = {
  executionKind: "media_operation",
  status: "completed",
  outputAssetIds: ["latest-output"],
} as unknown as NodeExecutionDto;

describe("useOperationOutputAssets", () => {
  it("does not prefer completed history after the canonical selection is cleared", () => {
    mocks.useMediaAssetList.mockImplementation((assetIds: readonly string[]) =>
      assetIds.map((id) => ({ data: { id }, isLoading: false, isError: false })),
    );

    const { result } = renderHook(() => useOperationOutputAssets([completedExecution], null));

    expect(mocks.useMediaAssetList).toHaveBeenCalledWith([]);
    expect(result.current.assetIds).toEqual([]);
    expect(result.current.assets).toEqual([]);
    expect(result.current.latestCompleted).toBe(completedExecution);
  });

  it("queries only the selected output when one is present", () => {
    mocks.useMediaAssetList.mockImplementation((assetIds: readonly string[]) =>
      assetIds.map((id) => ({ data: { id }, isLoading: false, isError: false })),
    );

    const { result } = renderHook(() => useOperationOutputAssets([completedExecution], "selected-output"));

    expect(mocks.useMediaAssetList).toHaveBeenCalledWith(["selected-output"]);
    expect(result.current.assetIds).toEqual(["selected-output"]);
    expect(result.current.assets).toEqual([{ id: "selected-output" }]);
  });
});
