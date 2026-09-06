// Only navigation initiated by the Spaces list grants a history-back target.
// The marker belongs to the browser entry, not to a persisted Space document.
let pendingListEntry: string | null = null;

export function rememberSpaceListEntry(spaceId: string) {
  window.history.replaceState({ ...window.history.state, spaceListScroll: window.scrollY }, "");
  pendingListEntry = spaceId;
}

export function attachSpaceReturnEntry(spaceId: string) {
  if (pendingListEntry !== spaceId) return;
  window.history.replaceState({ ...window.history.state, spaceReturnToList: spaceId }, "");
  pendingListEntry = null;
}

export function hasSpaceListReturnEntry(spaceId: string) {
  return window.history.length > 1 && window.history.state?.spaceReturnToList === spaceId;
}

export function restoreSpaceListScroll() {
  const scroll = window.history.state?.spaceListScroll;
  if (typeof scroll === "number" && Number.isFinite(scroll)) {
    window.scrollTo(0, scroll);
    // Cache updates after copy/rename/delete must not repeat the old restore.
    const state = { ...window.history.state };
    delete state.spaceListScroll;
    window.history.replaceState(state, "");
  }
}
