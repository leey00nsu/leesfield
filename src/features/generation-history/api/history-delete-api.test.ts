import { describe, expect, it, vi } from "vitest";
import { deleteHistoryItem } from "@/features/generation-history/api/history-delete-api";

describe("deleteHistoryItem", () => {
  it("audio 항목은 audio-generation endpoint로 삭제한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);

    await deleteHistoryItem({
      id: "aud-1",
      type: "audio" as never,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/audio-generation/aud-1", {
      method: "DELETE",
    });
  });
});
