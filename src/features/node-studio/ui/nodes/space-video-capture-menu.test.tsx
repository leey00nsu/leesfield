import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../../model/space-editor-store";
import type { SpaceEditorDocument } from "../../model/space-editor-types";
import { createSpaceEditorScope, SpaceEditorProvider } from "../space-editor-provider";
import { SpaceVideoCaptureMenu } from "./space-video-capture-menu";
const asset: MediaAssetDto = { id: "video", version: 1, type: "video", status: "completed", origin: "upload", mimeType: "video/mp4", bytes: "100",
  width: 320, height: 180, durationMs: 3000, sourceOperationId: null, url: "https://video.example/a.mp4", createdAt: "now", updatedAt: "now" };
function mount(kind = "input.video", writable = true, suppliedAsset: MediaAssetDto | null = asset) {
  const nodes: SpaceEditorDocument["nodes"] = [{ id: "source", kind: "input.video", configVersion: 1, config: { assetId: "video" }, position: { x: 0, y: 0 }, selectedOutputAssetId: null }];
  if (kind === "output.single") nodes.push({ id: "output", kind, configVersion: 1, config: { mediaType: "video" }, position: { x: 400, y: 0 }, selectedOutputAssetId: null });
  const nodeId = kind === "output.single" ? "output" : "source";
  const document: SpaceEditorDocument = { schemaVersion: 3, title: "Capture", nodes, groups: [], edges: kind === "output.single" ? [{ id: "wire", sourceNodeId: "source", sourcePortId: "video", targetNodeId: nodeId, targetPortId: "video", sortOrder: 0 }] : [] };
  const session = createSpaceEditorSession({ id: "space", version: 1, document, writable }), scope = createSpaceEditorScope(session);
  session.select([nodeId]);
  const captureVideoFrame = vi.fn(async () => true), onError = vi.fn(), video = window.document.createElement("video");
  Object.defineProperties(video, { readyState: { value: 2 }, currentTime: { value: 1.25, writable: true } });
  render(<NextIntlClientProvider locale="en" messages={messages}><SpaceEditorProvider session={session} scope={scope} services={{ captureVideoFrame, onError }}>
    <SpaceVideoCaptureMenu nodeId={nodeId} asset={suppliedAsset ?? undefined} getVideo={() => video} />
  </SpaceEditorProvider></NextIntlClientProvider>);
  return { session, scope, captureVideoFrame, onError, video, nodeId };
}
async function choose(name: string) {
  const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Capture frame" }));
  await user.click(await screen.findByRole("menuitem", { name })); return user;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it.each(["input.video", "output.single"])("captures all three positions from %s without modifying the source or player", async kind => {
  const view = mount(kind), original = view.session.getDocument();
  let count = 0;
  for (const [label, expected] of [["Capture current frame", 1.25], ["Capture first frame", "first"], ["Capture last frame", "last"]] as const) {
    await choose(label); count++; await waitFor(() => expect(view.captureVideoFrame).toHaveBeenCalledTimes(count));
    expect(view.captureVideoFrame).toHaveBeenLastCalledWith(view.nodeId, asset, expected);
    expect(view.session.getDocument()).toBe(original); expect(view.video.currentTime).toBe(1.25);
  }
});
it("keeps the camera static and disabled while this source has an active result reservation", () => {
  mount("input.video", false); expect(screen.getByRole("button", { name: "Capture frame" })).toBeDisabled();
  cleanup(); const view = mount();
  act(() => view.session.patchRuntime(view.nodeId, { submissionPending: true, resultReservationIds: ["result"] }));
  const button = screen.getByRole("button", { name: "Capture frame" }); expect(button).toBeDisabled();
  expect(button.querySelector(".animate-spin")).toBeNull(); expect(button.querySelector("svg")).not.toBeNull();
  act(() => view.session.patchRuntime(view.nodeId, { submissionPending: false, resultReservationIds: undefined }));
  expect(screen.getByRole("button", { name: "Capture frame" })).toBeEnabled();
});
it("shows an actionable error and permits retry after decode failure", async () => {
  const view = mount(); view.captureVideoFrame.mockRejectedValueOnce(new Error("decode"));
  await choose("Capture last frame"); await waitFor(() => expect(view.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("Please try again") })));
  await choose("Capture last frame"); await waitFor(() => expect(view.captureVideoFrame).toHaveBeenCalledTimes(2)); expect(view.onError).toHaveBeenCalledOnce();
});
it("supports keyboard opening, menu selection and Escape focus restoration", async () => {
  const view = mount(), user = userEvent.setup(), trigger = screen.getByRole("button", { name: "Capture frame" });
  act(() => trigger.focus()); await user.keyboard("{Enter}"); await screen.findByRole("menuitem", { name: "Capture current frame" }); await user.keyboard("{Escape}"); await waitFor(() => expect(trigger).toHaveFocus());
  await user.keyboard("{Enter}"); await user.keyboard("{Home}{Enter}"); await waitFor(() => expect(view.captureVideoFrame).toHaveBeenCalledOnce());
});
it("keeps an empty video's capture disabled and uses the live player position when it changes", async () => {
  mount("input.video", true, null);
  expect(screen.getByRole("button", { name: "Capture frame" })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole("button", { name: "Capture frame" }));
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  cleanup(); const view = mount(); view.video.currentTime = 2.75;
  await choose("Capture current frame");
  await waitFor(() => expect(view.captureVideoFrame).toHaveBeenCalledWith(view.nodeId, asset, 2.75));
});
