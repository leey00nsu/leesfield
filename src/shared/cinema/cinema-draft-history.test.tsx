import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useCinemaDraft } from "./use-cinema-draft";
import { useCinemaHistoryRestore } from "./use-cinema-history-restore";
import { defaultCinemaSettings } from "./cinema-contract";
import { composeCinemaPrompt } from "./cinema-prompt";

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const selected = { ...defaultCinemaSettings(), camera: "16mm-film" };
it("stores selections per media and restores them without storing prompts or attachments", () => {
  const image = renderHook(() => useCinemaDraft("image"));
  act(() => image.result.current.change(selected));
  image.unmount();
  const again = renderHook(() => useCinemaDraft("image"));
  expect(again.result.current.settings).toEqual(selected);
  const video = renderHook(() => useCinemaDraft("video"));
  expect(video.result.current.settings).toBeUndefined();
  const stored = JSON.parse(localStorage.getItem("leesfield:cinema:image:v1")!);
  expect(Object.keys(stored)).toEqual(["draftVersion", "settings"]);
  expect(stored).not.toHaveProperty("prompt");
  expect(stored).not.toHaveProperty("initImages");
});
it("preserves unknown drafts for explicit reset and keeps in-memory edits on storage failure", () => {
  const raw = { ...selected, schemaVersion: 99 };
  localStorage.setItem("leesfield:cinema:image:v1", JSON.stringify({ draftVersion: 1, settings: raw }));
  const hook = renderHook(() => useCinemaDraft("image"));
  expect(hook.result.current.settings).toEqual(raw);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  act(() => hook.result.current.change(defaultCinemaSettings()));
  expect(hook.result.current.settings).toEqual(defaultCinemaSettings());
  expect(hook.result.current.error).toBe(true);
});
const saved = composeCinemaPrompt("original scene", selected, "image");
function useRestore(restorePrompt: (prompt: string) => void) {
  const draft = useCinemaDraft("image");
  const history = useCinemaHistoryRestore({ historyId: "history-1", media: "image", ready: draft.ready, revision: draft.revision, change: draft.change, restorePrompt });
  return { draft, history };
}
it.each([1, 2, 3, 4, 5, 6])("restores source text and settings from mapping %i instead of recomposing the final history prompt", async mappingVersion => {
  const { composition: _removed, ...legacy } = selected; void _removed;
  const frozen = { ...saved, schemaVersion: 1, settings: { ...legacy, schemaVersion: 1, focalLength: "85" }, mappingVersion, finalPrompt: "Saved provider prompt, preserved verbatim." };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cinema: frozen, prompt: frozen.finalPrompt, model: "model" })));
  vi.stubGlobal("fetch", fetcher);
  const restore = vi.fn();
  const hook = renderHook(() => useRestore(restore));
  await waitFor(() => expect(restore).toHaveBeenCalledWith("original scene"));
  expect(hook.result.current.draft.settings).toEqual({ ...selected, composition: "auto" });
  expect(restore).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain("history-1?type=image&origin=generation&view=authoring");
});
it("ignores a late history response after a user edit", async () => {
  let resolve!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const restore = vi.fn();
  const hook = renderHook(() => useRestore(restore));
  act(() => hook.result.current.draft.markEdited());
  await act(async () => resolve(new Response(JSON.stringify({ cinema: saved, prompt: saved.finalPrompt, model: "model" }))));
  expect(restore).not.toHaveBeenCalled();
  expect(hook.result.current.draft.settings).toBeUndefined();
});
it.each(["deleted", "owner", "unsupported"])("keeps the existing draft on %s history failure", async kind => {
  localStorage.setItem("leesfield:cinema:image:v1", JSON.stringify({ draftVersion: 1, settings: selected }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(kind === "unsupported" ? new Response(JSON.stringify({ cinema: { ...saved, mappingVersion: 99 }, prompt: saved.finalPrompt, model: "model" })) : new Response(null, { status: kind === "owner" ? 401 : 404 })));
  const restore = vi.fn();
  const hook = renderHook(() => useRestore(restore));
  await waitFor(() => expect(hook.result.current.history.error).toBe(true));
  expect(restore).not.toHaveBeenCalled();
  expect(hook.result.current.draft.settings).toEqual(selected);
});
