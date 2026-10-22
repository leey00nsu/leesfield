import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/shared/i18n/messages/en.json";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditorProvider } from "./space-editor-provider";
import { SpaceMediaEditInspector } from "./space-media-edit-inspector";

const mocks = vi.hoisted(() => ({ choices: new Map<string, (value: string) => void>() }));
// Keep the deferred Resize inspector's implementation tested while real product guards hide it.
vi.mock("@/shared/generation-graph/node-availability", async importOriginal => {
  const actual = await importOriginal<typeof import("@/shared/generation-graph/node-availability")>();
  return { ...actual, isUnavailableEditNodeKind: (kind: string) => actual.isUnavailableEditNodeKind(kind) && !actual.isTemporarilyHiddenEditNodeKind(kind) };
});
vi.mock("@/features/media-assets/hook/use-media-assets", () => ({ useMediaAsset: () => ({ data: undefined }), useMediaAssetList: () => [] }));
vi.mock("@/shared/ui/app-choice-select", () => ({ AppChoiceSelect: (props: {
  label: string; value: string; disabled?: boolean; onValueChange: (value: string) => void; options: { value: string; label: string }[];
}) => {
  mocks.choices.set(props.label, props.onValueChange);
  return <select aria-label={props.label} value={props.value} disabled={props.disabled} onChange={event => props.onValueChange(event.target.value)}>
    {props.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>;
} }));

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
beforeEach(() => mocks.choices.clear());
afterEach(() => cleanup());

describe("SpaceMediaEditInspector", () => {
  it("merges an inspector edit into the latest config without overwriting queued settings or metadata", () => {
    const view = mount(), width = screen.getByLabelText("Width"), format = mocks.choices.get("Format")!;
    act(() => {
      view.session.dispatch({ type: "node.config.fields", nodeId: "edit", changes: [
        { path: ["parameters", "height"], value: 384 },
        { path: ["parameters", "padColor"], value: "#ff000000" },
        { path: ["presentation", "comment"], value: "Latest comment" },
      ] });
      fireEvent.change(width, { target: { value: "768" } });
      format("jpeg");
    });
    const current = view.session.getDocument().nodes[0];
    expect(current).toMatchObject({ position: { x: 10, y: 20 }, selectedOutputAssetId: "keep-result",
      config: { presentation: { comment: "Latest comment" }, parameters: { width: 768, height: 384, padColor: "#ff000000", quality: 0, format: "jpeg" } } });
    expect(screen.getByLabelText("Quality")).toHaveValue(0);
    act(() => view.session.undo());
    expect(view.session.getDocument().nodes[0].config).toMatchObject({ parameters: { width: 768, format: "webp" } });
  });

  it("rejects retained menu callbacks after a Space reset, permission revocation and unmount", () => {
    const view = mount(), oldChange = mocks.choices.get("Format")!;
    const original = view.session.getDocument();
    act(() => view.session.reset({ id: "other-space", version: 2, document: original }));
    act(() => oldChange("png"));
    expect(view.session.getDocument()).toBe(original);
    const writableChange = mocks.choices.get("Format")!;
    act(() => view.session.reset({ id: "other-space", version: 3, document: original, writable: false }));
    act(() => writableChange("png"));
    expect(view.session.getDocument()).toBe(original);
    expect(screen.getByLabelText("Width")).toBeDisabled();
    const latestChange = mocks.choices.get("Format")!;
    act(() => view.session.reset({ id: "other-space", version: 4, document: original, writable: true }));
    const beforeUnmount = mocks.choices.get("Format")!;
    view.unmount();
    act(() => { latestChange("png"); beforeUnmount("png"); });
    expect(view.session.getDocument()).toBe(original);
  });

  it("keeps unsupported Resize config versions read-only instead of normalizing them", () => {
    const doc = document("edit.image.resize", 99), view = mount(doc);
    expect(screen.getByLabelText("Width")).toBeDisabled();
    act(() => mocks.choices.get("Format")!("png"));
    expect(view.session.getDocument()).toBe(doc);
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
