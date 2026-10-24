import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditorProvider } from "./space-editor-provider";
import { SpaceMediaEditInspector } from "./space-media-edit-inspector";

vi.mock("@/features/media-assets/hook/use-media-assets", () => ({ useMediaAsset: () => ({ data: undefined }), useMediaAssetList: () => [] }));
function document(kind = "edit.image.resize", configVersion = 1): SpaceEditorDocument {
  return { schemaVersion: 3, title: "Media settings", groups: [], edges: [], nodes: [{ id: "edit", kind, configVersion,
    config: { parameters: kind === "edit.image.resize" ? { width: 512, height: 256, quality: 0, format: "webp" } : {} },
    position: { x: 10, y: 20 }, selectedOutputAssetId: "keep-result" }] };
}
function mount(doc = document(), writable = true) {
  const session = createSpaceEditorSession({ id: "settings-space", version: 1, document: doc, writable });
  const view = render(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <SpaceEditorProvider session={session}><SpaceMediaEditInspector nodeId="edit" /></SpaceEditorProvider>
  </NextIntlClientProvider>);
  return { ...view, session };
}
afterEach(() => cleanup());

describe("SpaceMediaEditInspector", () => {
  it.each(["edit.image.resize", "edit.video.trim"])("keeps removed %s settings absent without rewriting legacy config", kind => {
    const original = document(kind), view = mount(original);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(view.session.getDocument()).toBe(original);
  });

  it("edits frame time with millisecond precision without rewriting a legacy graph on read", () => {
    const view = mount(document("edit.video.extractFrames")), original = view.session.getDocument(), durable = vi.fn();
    view.session.subscribeDurable(durable);
    const position = screen.getByRole("spinbutton", { name: "Frame time" });
    expect(position).toHaveValue(0);
    expect(position).toHaveAttribute("step", "0.001");
    expect(view.session.getDocument()).toBe(original);
    expect(durable).not.toHaveBeenCalled();
    fireEvent.change(position, { target: { value: "1.234" } });
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { timestampMs: 1234 } });
    expect(durable).toHaveBeenCalledOnce();
    act(() => { view.session.undo(); });
    expect(view.session.getDocument()).toEqual(original);
  });
});
