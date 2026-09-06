import { describe, it, expect, vi, beforeEach } from "vitest";
import { runWithFallback } from "../runWithFallback";
import type { SelectedModel } from "@/types";

const primary: SelectedModel = {
  provider: "gemini",
  modelId: "nano-banana",
  displayName: "Nano Banana",
};

const fallback: SelectedModel = {
  provider: "replicate",
  modelId: "flux-dev",
  displayName: "Flux Dev",
};

function makeAbortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

describe("runWithFallback", () => {
  let updateNodeData: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateNodeData = vi.fn();
  });

  it("clears prior metadata at start", async () => {
    const runOnce = vi.fn().mockResolvedValueOnce(undefined);
    await runWithFallback({
      nodeId: "n1",
      primary,
      fallback,
      updateNodeData,
      runOnce,
    });

    expect(updateNodeData).toHaveBeenNthCalledWith(1, "n1", {
      __usedFallback: undefined,
      __fallbackModelUsed: undefined,
      __primaryError: undefined,
    });
  });

  it("primary succeeds: no fallback invoked, no fallback metadata set", async () => {
    const runOnce = vi.fn().mockResolvedValueOnce(undefined);
    await runWithFallback({
      nodeId: "n1",
      primary,
      fallback,
      updateNodeData,
      runOnce,
    });

    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(runOnce).toHaveBeenCalledWith(primary, undefined);
    // Only the initial clear call — no metadata update after success.
    expect(updateNodeData).toHaveBeenCalledTimes(1);
  });

  it("primary fails, no fallback: rethrows primary error", async () => {
    const err = new Error("primary boom");
    const runOnce = vi.fn().mockRejectedValueOnce(err);
    await expect(
      runWithFallback({
        nodeId: "n1",
        primary,
        updateNodeData,
        runOnce,
      })
    ).rejects.toThrow("primary boom");

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("primary fails, fallback succeeds: stamps metadata and clears error", async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary boom"))
      .mockResolvedValueOnce(undefined);

    await runWithFallback({
      nodeId: "n1",
      primary,
      fallback,
      updateNodeData,
      runOnce,
    });

    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(runOnce).toHaveBeenNthCalledWith(1, primary, undefined);
    expect(runOnce).toHaveBeenNthCalledWith(2, fallback, undefined);

    // Last call should be the metadata stamp.
    const lastCall = updateNodeData.mock.calls.at(-1)!;
    expect(lastCall[0]).toBe("n1");
    expect(lastCall[1]).toEqual({
      status: "complete",
      error: null,
      __usedFallback: true,
      __fallbackModelUsed: "Flux Dev",
      __primaryError: "primary boom",
    });
  });

  it("primary fails and fallback fails: sets combined error and throws", async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary boom"))
      .mockRejectedValueOnce(new Error("fallback boom"));

    await expect(
      runWithFallback({
        nodeId: "n1",
        primary,
        fallback,
        updateNodeData,
        runOnce,
      })
    ).rejects.toThrow(
      "Primary failed: primary boom. Fallback failed: fallback boom"
    );

    const errorCall = updateNodeData.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>).status === "error"
    );
    expect(errorCall).toBeDefined();
    expect((errorCall![1] as Record<string, unknown>).error).toContain(
      "Primary failed: primary boom"
    );
    expect((errorCall![1] as Record<string, unknown>).error).toContain(
      "Fallback failed: fallback boom"
    );
  });

  it("primary AbortError: rethrows without invoking fallback", async () => {
    const runOnce = vi.fn().mockRejectedValueOnce(makeAbortError());

    await expect(
      runWithFallback({
        nodeId: "n1",
        primary,
        fallback,
        updateNodeData,
        runOnce,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("fallback AbortError: rethrows without status:complete or status:error stamp", async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary boom"))
      .mockRejectedValueOnce(makeAbortError());

    await expect(
      runWithFallback({
        nodeId: "n1",
        primary,
        fallback,
        updateNodeData,
        runOnce,
      })
    ).rejects.toMatchObject({ name: "AbortError" });

    // No status:complete or status:error stamp after abort
    const completeStamp = updateNodeData.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>).status === "complete"
    );
    const errorStamp = updateNodeData.mock.calls.find(
      (c) => (c[1] as Record<string, unknown>).status === "error"
    );
    expect(completeStamp).toBeUndefined();
    expect(errorStamp).toBeUndefined();
  });

  it("primary === fallback (same provider+modelId): skips fallback and rethrows", async () => {
    const dupFallback: SelectedModel = { ...primary };
    const err = new Error("primary boom");
    const runOnce = vi.fn().mockRejectedValueOnce(err);

    await expect(
      runWithFallback({
        nodeId: "n1",
        primary,
        fallback: dupFallback,
        updateNodeData,
        runOnce,
      })
    ).rejects.toThrow("primary boom");

    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  describe("fallbackParameters", () => {
    it("primary succeeds: runOnce called without parameters override", async () => {
      const runOnce = vi.fn().mockResolvedValueOnce(undefined);
      await runWithFallback({
        nodeId: "n1",
        primary,
        fallback,
        fallbackParameters: { mode: "720p" },
        updateNodeData,
        runOnce,
      });

      expect(runOnce).toHaveBeenCalledTimes(1);
      expect(runOnce).toHaveBeenCalledWith(primary, undefined);
    });

    it("primary fails, fallback succeeds: runOnce called with fallbackParameters", async () => {
      const fbParams = { mode: "720p" };
      const runOnce = vi
        .fn()
        .mockRejectedValueOnce(new Error("primary boom"))
        .mockResolvedValueOnce(undefined);

      await runWithFallback({
        nodeId: "n1",
        primary,
        fallback,
        fallbackParameters: fbParams,
        updateNodeData,
        runOnce,
      });

      expect(runOnce).toHaveBeenCalledTimes(2);
      expect(runOnce).toHaveBeenNthCalledWith(1, primary, undefined);
      expect(runOnce).toHaveBeenNthCalledWith(2, fallback, fbParams);
    });

    it("primary fails, fallback succeeds, no fallbackParameters: runOnce called with undefined", async () => {
      const runOnce = vi
        .fn()
        .mockRejectedValueOnce(new Error("primary boom"))
        .mockResolvedValueOnce(undefined);

      await runWithFallback({
        nodeId: "n1",
        primary,
        fallback,
        updateNodeData,
        runOnce,
      });

      expect(runOnce).toHaveBeenCalledTimes(2);
      expect(runOnce).toHaveBeenNthCalledWith(2, fallback, undefined);
    });
  });
});
