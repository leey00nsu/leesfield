import { describe, expect, it } from "vitest";
import { mappedReferenceImageModelFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { createSpaceEditorSession } from "./space-editor-store";
import { createSpaceEditorScope } from "../ui/space-editor-provider";
import { createSpaceAttachmentGuard } from "./space-editor-attachment-guard";
import { spaceGenerationAttachmentSlots } from "./space-editor-attachments";
import type { SpaceEditorDocument } from "./space-editor-types";

function setup() {
  const model = mappedReferenceImageModelFixture, slot = spaceGenerationAttachmentSlots(model)[0];
  const document: SpaceEditorDocument = { schemaVersion: 3, title: "Guard", groups: [], nodes: [
    { id: "source", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: "A" }, selectedOutputAssetId: null },
    { id: "generation", kind: "generate.image", configVersion: 1, position: { x: 500, y: 0 }, config: { modelKey: model.key, prompt: "original", parameters: { seed: 1 } }, selectedOutputAssetId: null },
  ], edges: [{ id: "wire", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "generation", targetPortId: slot.ports[0], sortOrder: 0 }] };
  const session = createSpaceEditorSession({ id: "space", version: 1, document });
  const scope = createSpaceEditorScope(session, { catalog: { imageModels: [model], isLoading: false, error: null, retry: () => {} } }), end = scope.start();
  const guard = createSpaceAttachmentGuard({ session, inputs: scope.inputs, nodeId: "generation", getCatalog: () => scope.view.getState().catalog,
    getEpoch: () => scope.view.getState().epoch, subscribe: callback => scope.view.subscribe(callback) });
  const stop = guard.start(); return { session, scope, guard, slot, stop, dispose: () => { stop(); end(); } };
}
describe("semantic attachment intent", () => {
  it("permits independent option, prompt, comment, result and position edits", () => {
    const ctx = setup(), expected = ctx.guard.capture();
    ctx.session.dispatch({ type: "node.config.patch", nodeId: "generation", patch: { prompt: "new", parameters: { seed: 0, enabled: false }, presentation: { comment: "new" } } });
    ctx.session.dispatch({ type: "node.move", nodeId: "generation", position: { x: 900, y: 700 } });
    ctx.session.dispatch({ type: "output.select", nodeId: "generation", assetId: "new-result" });
    expect(expected.valid()).toBe(true); expect(ctx.guard.matches(expected)).toBe(true); ctx.dispose();
  });
  it.each(["model", "source", "marker"])("rejects %s A→B→A before any React render", mode => {
    const ctx = setup(), expected = ctx.guard.capture(), model = mappedReferenceImageModelFixture;
    if (mode === "model") for (const modelKey of ["other", model.key]) ctx.session.dispatch({ type: "node.config.patch", nodeId: "generation", patch: { modelKey } });
    if (mode === "source") for (const assetId of ["B", "A"]) ctx.session.dispatch({ type: "node.config.patch", nodeId: "source", patch: { assetId } });
    if (mode === "marker") for (const value of [[null, null], undefined]) ctx.session.dispatch({ type: "node.config.fields", nodeId: "generation", changes: [value
      ? { path: ["parameters", "dynamicParams", ctx.slot.field.name], value }
      : { path: ["parameters", "dynamicParams", ctx.slot.field.name], remove: true }] });
    expect(expected.valid()).toBe(false); expect(ctx.guard.matches(expected)).toBe(false); ctx.dispose();
  });
  it("rejects deletion/undo, identical-document reset and a disposed presenter", () => {
    const ctx = setup(), beforeDeletion = ctx.guard.capture();
    ctx.session.dispatch({ type: "node.remove", nodeId: "source" }); ctx.session.undo();
    expect(beforeDeletion.valid()).toBe(false);
    const beforeReset = ctx.guard.capture(); ctx.session.reset({ id: "space", version: 2, document: ctx.session.getDocument() });
    expect(beforeReset.valid()).toBe(false);
    const beforeStop = ctx.guard.capture(); ctx.stop(); expect(beforeStop.valid()).toBe(false); ctx.dispose();
  });
  it("keeps independent fields in one mixed upload batch while invalidating the changed field", () => {
    const ctx = setup(), contract = getGradioContract(mappedReferenceImageModelFixture)!;
    const model = { ...mappedReferenceImageModelFixture, providerConfig: { gradio_contract: { ...contract, inputs: [...contract.inputs,
      { name: "soundtrack", label: "Soundtrack", kind: "file", media: "audio", required: false, nullable: true, schema: { type: ["string", "null"] } },
    ] } } };
    ctx.scope.configure({ imageModels: [model], isLoading: false, error: null, retry: () => {} }, {}, {});
    const image = ctx.guard.capture(ctx.slot.field.name), audio = ctx.guard.capture("soundtrack");
    ctx.session.dispatch({ type: "node.config.patch", nodeId: "source", patch: { assetId: "B" } });
    expect(image.valid()).toBe(false); expect(audio.valid()).toBe(true); ctx.dispose();
  });
});
