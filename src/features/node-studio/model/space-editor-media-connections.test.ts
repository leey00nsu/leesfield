import { describe, expect, it, vi } from "vitest";
import type { CanonicalEdge, CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import type { GradioField } from "@/shared/model-catalog/gradio-contract";
import type { RuntimeLlmModel, RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import { mappedReferenceImageModelFixture, runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { spaceAttachmentAssetIds, spaceGenerationAttachmentSlots } from "./space-editor-attachments";
import { SpaceInputResolver } from "./space-editor-inputs";
import { prepareSpacePortMedia } from "./space-editor-media-connections";
import type { SpaceModelCatalog } from "./space-editor-ports";
import type { SpaceEditorDocument, SpacePortReference } from "./space-editor-types";

const asset = (type: MediaType = "image", id = "durable-asset"): MediaAssetDto => ({
  id, version: 1, type, status: "completed", origin: "upload", mimeType: `${type}/${type === "image" ? "png" : type === "audio" ? "mpeg" : "mp4"}`,
  bytes: "123", width: null, height: null, durationMs: null, sourceOperationId: null,
  url: `/api/media-assets/${id}/content`, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
});
const node = (id: string, kind: CanonicalNodeKind, config = defaultConfigForKind(kind)): CanonicalNode => ({
  id, kind, configVersion: 1, config, position: { x: 300, y: 50 }, selectedOutputAssetId: null,
});
const graph = (...nodes: CanonicalNode[]): SpaceEditorDocument => ({ schemaVersion: 3, title: "Media ports", nodes, edges: [], groups: [] });
const input = (nodeId: string, portId: string, slot?: number): SpacePortReference => ({ nodeId, portId, direction: "input", ...(slot === undefined ? {} : { slot }) });
const output = (nodeId: string, portId: string): SpacePortReference => ({ nodeId, portId, direction: "output" });
const edge = (id: string, sourceNodeId: string, targetNodeId: string, targetPortId: string, sortOrder = 0, sourcePortId = "image"): CanonicalEdge => ({
  id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, sortOrder,
});
const ids = (prefix = "new") => { let count = 0; return vi.fn(() => `${prefix}-${++count}`); };
const position = { x: -160, y: 240 };
const emptyCatalog: SpaceModelCatalog = { imageModels: [] };
const legacy = (limit: number) => ({ ...runtimeImageModelsFixture[0], key: "legacy", providerConfig: {}, meta: { max_input_images: limit } });
const generation = (modelKey: string, kind: "generate.image" | "generate.video" = "generate.image") =>
  node("target", kind, { ...defaultConfigForKind(kind), modelKey });
const videoField: GradioField = { name: "clips", label: "Clips", media: "video", kind: "files", required: false, nullable: false,
  schema: { type: "array", maxItems: 4, items: { type: "string" } } };
const audioField: GradioField = { name: "tracks", label: "Tracks", media: "audio", kind: "files", required: false, nullable: false,
  schema: { type: "array", maxItems: 4, items: { type: ["string", "null"] } } };
function mappedVideo(fields: GradioField[]): RuntimeVideoModel {
  return { ...runtimeVideoModelsFixture[0], key: "mapped", provider: "hf_space", parameters: {}, providerConfig: {
    space_id: "test/media", api_name: "/generate", gradio_contract: { version: 1, apiName: "/generate", diagnostics: [], reviewed: true,
      output: { media: "video", path: [0], multiple: false }, inputs: fields },
  } };
}

describe("durable media selected from canonical Space ports", () => {
  it.each(["image", "audio", "video"] as const)("replaces an Input %s output locally without creating entities", type => {
    const target = node("target", `input.${type}`, { assetId: "local", filename: "original", presentation: { customTitle: "Keep me" } });
    const unrelated = node("other", "note.memo");
    const base = { ...graph(target, unrelated), selectionChanges: ["other"] };
    const createId = ids();
    const next = prepareSpacePortMedia(base, output("target", type), asset(type), position, emptyCatalog, createId);
    expect(next.nodes[0]).toEqual({ ...target, config: { assetId: "durable-asset", filename: "original", presentation: { customTitle: "Keep me" } } });
    expect(next.nodes[1]).toBe(unrelated);
    expect(next.edges).toBe(base.edges);
    expect(next.groups).toBe(base.groups);
    expect(next.selectionChanges).toBe(base.selectionChanges);
    expect(createId).not.toHaveBeenCalled();
    expect(base.nodes[0]).toBe(target);
  });

  it.each(["old-asset", "durable-asset"])("releases the execution and representative selection even when replacing %s", oldAsset => {
    const provenance = { nodeId: "generator", executionId: "accepted", portId: "image", index: 2, outputCount: 4, state: "completed" };
    const target = { ...node("target", "input.image", { assetId: oldAsset, resultSource: provenance }), selectedOutputAssetId: "representative" };
    const base = graph(target);
    const next = prepareSpacePortMedia(base, output("target", "image"), asset(), position, emptyCatalog, ids());
    expect(next.nodes[0].config).toEqual({ assetId: "durable-asset", resultSource: { ...provenance, executionId: null, state: "completed" } });
    expect(next.nodes[0].selectedOutputAssetId).toBeNull();
    expect(target.config).toEqual({ assetId: oldAsset, resultSource: provenance });
  });

  it("keeps an ordinary Input's incoming media authoritative and restores its replacement after disconnection", () => {
    const base = graph(node("target", "input.image", { assetId: "local" }), node("upstream", "input.image", { assetId: "wired" }));
    base.edges.push(edge("saved_wire", "upstream", "target", "reference"));
    const next = prepareSpacePortMedia(base, output("target", "image"), asset(), position, emptyCatalog, ids());
    expect(next.edges).toBe(base.edges);
    expect(new SpaceInputResolver(next).sourceAssetIds("target", "image")).toEqual(["wired"]);
    expect(new SpaceInputResolver({ ...next, edges: [] }).sourceAssetIds("target", "image")).toEqual(["durable-asset"]);
  });

  it.each([
    ["input.image", "reference", "image"], ["input.audio", "audio", "audio"], ["input.video", "video", "video"],
  ] as const)("creates a new Input for %s's %s input instead of replacing the target's local asset", (kind, portId, type) => {
    const target = node("target", kind, { assetId: "local-original" });
    const base = graph(target);
    const next = prepareSpacePortMedia(base, input("target", portId), asset(type), position, emptyCatalog, ids());
    expect(next.nodes[0]).toBe(target);
    expect(next.nodes[1]).toEqual({ id: "new-1", kind: `input.${type}`, configVersion: 1, config: { assetId: "durable-asset" }, position, selectedOutputAssetId: null });
    expect(next.nodes[1].position).not.toBe(position);
    expect(next.edges).toEqual([edge("new-2", "new-1", "target", portId, 0, type)]);
    expect(new SpaceInputResolver(next).sourceAssetIds("target", type)).toEqual(["durable-asset"]);
    expect(new SpaceInputResolver({ ...next, edges: [] }).sourceAssetIds("target", type)).toEqual(["local-original"]);
    expect(base.nodes).toEqual([target]);
    expect(base.edges).toEqual([]);
  });

  it("replaces every conflicting single input wire while retaining old sources and unrelated canonical IDs", () => {
    const base = graph(node("target", "input.image", { assetId: "local" }), node("one", "input.image"), node("two", "input.image"), node("preview", "output.single"));
    base.edges = [edge("old_first", "one", "target", "reference"), edge("old_second", "two", "target", "reference"),
      { ...edge("do_not_rewrite", "one", "preview", "image"), hasPause: true }];
    const next = prepareSpacePortMedia(base, input("target", "reference"), asset(), position, emptyCatalog, ids());
    expect(next.nodes.slice(0, 4)).toEqual(base.nodes);
    expect(next.edges).toEqual([base.edges[2], edge("new-2", "new-1", "target", "reference")]);
    expect(next.edges[0]).toBe(base.edges[2]);
    expect(base.edges).toHaveLength(3);
  });

  it("appends to a multi port after saved sparse positions without rewriting or unpausing earlier edges", () => {
    const base = graph(node("target", "output.gallery"), node("old", "input.image", { assetId: "old" }));
    base.edges = [{ ...edge("original_edge", "old", "target", "image", 5), hasPause: true }];
    const next = prepareSpacePortMedia(base, input("target", "image"), asset(), position, emptyCatalog, ids());
    expect(next.edges[0]).toBe(base.edges[0]);
    expect(next.edges[1]).toEqual(edge("new-2", "new-1", "target", "image", 6));
  });

  it("authors legacy image primary, references, references in order and rejects further additions atomically", () => {
    const catalog = { imageModels: [legacy(3)] }, createId = ids();
    let current = graph(generation("legacy"));
    for (const id of ["first", "second", "third"]) current = prepareSpacePortMedia(current, input("target", "primary"), asset("image", id), position, catalog, createId);
    expect(current.edges.map(({ targetPortId, sortOrder }) => [targetPortId, sortOrder])).toEqual([["primary", 0], ["references", 0], ["references", 1]]);
    const snapshot = structuredClone(current);
    expect(() => prepareSpacePortMedia(current, input("target", "primary"), asset(), position, catalog, createId)).toThrow("ATTACHMENT_LIMIT");
    expect(current).toEqual(snapshot);
  });

  it("replaces a max-one legacy field across both old aliases without removing their Input nodes", () => {
    const catalog = { imageModels: [legacy(1)] };
    const base = graph(generation("legacy"), node("old", "input.image"), node("reference", "input.image"));
    base.edges = [edge("old_primary", "old", "target", "primary"), edge("old_reference", "reference", "target", "references")];
    const next = prepareSpacePortMedia(base, input("target", "primary"), asset(), position, catalog, ids());
    expect(next.nodes.slice(0, 3)).toEqual(base.nodes);
    expect(next.edges).toEqual([edge("new-2", "new-1", "target", "primary")]);
    expect(base.edges).toHaveLength(2);
  });

  it("replaces explicit slots on the shared legacy image anchor without disturbing its other alias", () => {
    const catalog = { imageModels: [legacy(3)] };
    const base = graph(generation("legacy"), node("first", "input.image"), node("second", "input.image"));
    base.edges = [edge("primary", "first", "target", "primary"), edge("reference", "second", "target", "references", 1)];
    const primary = prepareSpacePortMedia(base, input("target", "primary", 0), asset(), position, catalog, ids());
    expect(primary.edges).toEqual([base.edges[1], edge("new-2", "new-1", "target", "primary")]);
    const reference = prepareSpacePortMedia(base, input("target", "primary", 1), asset(), position, catalog, ids());
    expect(reference.edges).toEqual([base.edges[0], edge("new-2", "new-1", "target", "references", 1)]);
  });

  it("allows explicit replacement of an occupied multi slot at its limit while preserving other source identities", () => {
    const model = mappedReferenceImageModelFixture, catalog = { imageModels: [model] };
    const base = graph(generation(model.key), node("one", "input.image"), node("two", "input.image"));
    base.edges = [edge("keep_first", "one", "target", "image-field-refs", 0), edge("replace_second", "two", "target", "image-field-refs", 5)];
    const next = prepareSpacePortMedia(base, input("target", "image-field-refs", 5), asset(), position, catalog, ids());
    expect(next.edges).toEqual([base.edges[0], edge("new-2", "new-1", "target", "image-field-refs", 5)]);
    expect(next.edges[0]).toBe(base.edges[0]);
    expect(next.nodes[2]).toBe(base.nodes[2]);
    expect(() => prepareSpacePortMedia(base, input("target", "image-field-refs"), asset(), position, catalog, ids())).toThrow("ATTACHMENT_LIMIT");
  });

  it("uses dynamic file media, capability and field limits rather than generic registry cardinality", () => {
    const model = mappedVideo([{ ...videoField, kind: "file", schema: { type: "string" } }, audioField]);
    const catalog = { imageModels: [], videoModels: [model] };
    const base = graph(generation(model.key, "generate.video"));
    const first = prepareSpacePortMedia(base, input("target", "video-field-clips"), asset("video", "first"), position, catalog, ids());
    const next = prepareSpacePortMedia(first, input("target", "video-field-clips"), asset("video", "next"), position, catalog, ids("replacement"));
    expect(next.nodes).toHaveLength(3);
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0].targetPortId).toBe("video-field-clips");
    expect(new SpaceInputResolver(next).inputAssetIds("target", "video-field-clips")).toEqual(["next"]);
    expect(() => prepareSpacePortMedia(base, input("target", "video-field-clips"), asset("audio"), position, catalog, ids())).toThrow("ASSET_MEDIA_TYPE_MISMATCH");
  });

  it("treats the mapped single image field's saved aliases as one capacity without rewriting unrelated IDs", () => {
    const model = { ...mappedReferenceImageModelFixture, parameters: { ...mappedReferenceImageModelFixture.parameters,
      "hf:refs": { ...(mappedReferenceImageModelFixture.parameters["hf:refs"] as Record<string, unknown>), maxItems: 1 } } };
    const base = graph(generation(model.key), node("old", "input.image"), node("other", "input.image"), node("preview", "output.single"));
    base.edges = [edge("old_alias", "old", "target", "primary"), edge("unrelated", "other", "preview", "image")];
    const next = prepareSpacePortMedia(base, input("target", "image-field-refs"), asset(), position, { imageModels: [model] }, ids());
    expect(next.edges).toEqual([base.edges[1], edge("new-2", "new-1", "target", "image-field-refs")]);
    expect(base.edges[0].targetPortId).toBe("primary");
    expect(next.edges[0]).toBe(base.edges[1]);
  });

  it("enforces a multi port's registry limit and permits an explicit replacement at that limit", () => {
    const model: RuntimeLlmModel = { type: "llm", key: "assistant", label: "Assistant", vendor: "test", provider: "openai_compatible",
      providerConfig: { base_url: "https://unused.invalid", model_id: "test", supports_images: true }, isActive: true, isDefault: false };
    const catalog = { imageModels: [], llmModels: [model] };
    const base = graph(node("target", "generate.assistant", { prompt: "", modelKey: model.key }), node("source", "input.image"));
    base.edges = Array.from({ length: 4 }, (_, index) => edge(`assistant-${index}`, "source", "target", "images", index));
    const snapshot = structuredClone(base);
    expect(() => prepareSpacePortMedia(base, input("target", "images"), asset(), position, catalog, ids())).toThrow("PORT_CARDINALITY_EXCEEDED");
    expect(base).toEqual(snapshot);
    const next = prepareSpacePortMedia(base, input("target", "images", 2), asset(), position, catalog, ids());
    expect(next.edges).toHaveLength(4);
    expect(next.edges[3]).toEqual(edge("new-2", "new-1", "target", "images", 2));
  });

  it("preserves sparse nullable positions and trailing null markers when appending or explicitly filling a slot", () => {
    const model = mappedVideo([audioField]), catalog = { imageModels: [], videoModels: [model] };
    const target = generation(model.key, "generate.video");
    target.config = { ...defaultConfigForKind("generate.video"), modelKey: model.key, parameters: { dynamicParams: { tracks: [null, null, null], unrelated: false }, steps: 0 } };
    const base = graph(target, node("old", "input.audio", { assetId: "a2" }));
    base.edges = [edge("keep_audio", "old", "target", "audio-field-tracks", 1, "audio")];
    const slot = spaceGenerationAttachmentSlots(model)[0];
    const appended = prepareSpacePortMedia(base, input("target", "audio-field-tracks"), asset("audio"), position, catalog, ids());
    expect(appended.edges[1].sortOrder).toBe(3);
    expect(appended.nodes[0].config).toMatchObject({ parameters: { dynamicParams: { tracks: [null, null, null, null], unrelated: false }, steps: 0 } });
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(appended), "target", slot)).toEqual([null, "a2", null, "durable-asset"]);
    expect(base.nodes[0]).toBe(target);
    const filled = prepareSpacePortMedia(base, input("target", "audio-field-tracks", 2), asset("audio"), position, catalog, ids());
    expect(filled.nodes[0]).toBe(target);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(filled), "target", slot)).toEqual([null, "a2", "durable-asset"]);
    const replaced = prepareSpacePortMedia(base, input("target", "audio-field-tracks", 1), asset("audio"), position, catalog, ids());
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(replaced), "target", slot)).toEqual([null, "durable-asset", null]);
    expect(replaced.nodes[1]).toBe(base.nodes[1]);
  });

  it("rejects nullable append beyond the trailing marker even when the asset count remains below the limit", () => {
    const model = mappedVideo([{ ...audioField, schema: { ...audioField.schema, maxItems: 3 } }]), catalog = { imageModels: [], videoModels: [model] };
    const target = generation(model.key, "generate.video");
    target.config = { ...defaultConfigForKind("generate.video"), modelKey: model.key, parameters: { dynamicParams: { tracks: [null, null, null] } } };
    const base = graph(target), snapshot = structuredClone(base);
    expect(() => prepareSpacePortMedia(base, input("target", "audio-field-tracks"), asset("audio"), position, catalog, ids())).toThrow("ATTACHMENT_LIMIT");
    expect(base).toEqual(snapshot);
    expect(prepareSpacePortMedia(base, input("target", "audio-field-tracks", 2), asset("audio"), position, catalog, ids()).edges[0].sortOrder).toBe(2);
  });

  it("enforces paired-track parents and preserves omitted audio fallback when adding or replacing videos", () => {
    const model = mappedVideo([videoField, { ...audioField, attachment: { role: "paired_audio", pairedWith: "clips", pairing: "index" } }]);
    const catalog = { imageModels: [], videoModels: [model] }, createId = ids();
    const base = graph(generation(model.key, "generate.video"));
    expect(() => prepareSpacePortMedia(base, input("target", "audio-field-tracks", 0), asset("audio"), position, catalog, createId)).toThrow("HF_CONTRACT_ATTACHMENT_ORPHAN:tracks");
    const first = prepareSpacePortMedia(base, input("target", "video-field-clips"), asset("video", "v1"), position, catalog, createId);
    const paired = prepareSpacePortMedia(first, input("target", "audio-field-tracks", 0), asset("audio", "a1"), position, catalog, createId);
    const audioEdge = paired.edges.find(item => item.targetPortId === "audio-field-tracks");
    const next = prepareSpacePortMedia(paired, input("target", "video-field-clips"), asset("video", "v2"), position, catalog, createId);
    const replaced = prepareSpacePortMedia(next, input("target", "video-field-clips", 0), asset("video", "v3"), position, catalog, createId);
    const tracks = spaceGenerationAttachmentSlots(model)[1];
    expect(replaced.edges).toContain(audioEdge);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(replaced), "target", tracks)).toEqual(["a1"]);
    expect(base.nodes).toHaveLength(1);
    expect(base.edges).toEqual([]);
  });

  it("replaces one item inside a connected collection without losing its other values or changing its source", () => {
    const model = mappedReferenceImageModelFixture, catalog = { imageModels: [model] };
    const source = { ...node("split", "edit.image.splitGrid"), selectedOutputAssetId: "a" };
    const base = graph(generation(model.key), source);
    base.edges = [edge("collection", "split", "target", "image-field-refs", 0, "images")];
    const runtime = { mediaOutputs: new Map([["split", ["a", "b", "c"].map((assetId, sortOrder) => ({ portId: "images", assetId, sortOrder }))]]) };
    const next = prepareSpacePortMedia(base, input("target", "image-field-refs", 1), asset(), position, catalog, ids(), runtime);
    expect(next.nodes[1]).toBe(source);
    expect(next.nodes).toHaveLength(5);
    expect(next.edges).toHaveLength(3);
    expect(next.edges.some(item => item.id === "collection")).toBe(false);
    expect(new SpaceInputResolver(next, runtime).inputAssetIds("target", "image-field-refs")).toEqual(["a", "durable-asset", "c"]);
    expect(base.edges).toEqual([edge("collection", "split", "target", "image-field-refs", 0, "images")]);
    const appended = prepareSpacePortMedia(base, input("target", "image-field-refs"), asset(), position, catalog, ids(), runtime);
    expect(appended.edges[0]).toBe(base.edges[0]);
    expect(appended.edges[1].sortOrder).toBe(3);
    const capped = { ...base, nodes: [...base.nodes, ...Array.from({ length: 496 }, (_, i) => node(`memo-${i}`, "note.memo"))] };
    expect(() => prepareSpacePortMedia(capped, input("target", "image-field-refs", 1), asset(), position, catalog, ids(), runtime)).toThrow("SPACE_GRAPH_LIMIT");
    expect(capped.nodes).toHaveLength(498);
    expect(capped.edges[0]).toBe(base.edges[0]);
  });

  it.each([null, { ...asset(), status: "failed" }, { ...asset(), status: "deleting" }])("cannot create placeholder state for cancelled or incomplete selection %#", value => {
    const base = graph(node("target", "input.image")), snapshot = structuredClone(base), createId = ids();
    expect(() => prepareSpacePortMedia(base, input("target", "reference"), value as MediaAssetDto, position, emptyCatalog, createId)).toThrow("MEDIA_ASSET_NOT_READY");
    expect(base).toEqual(snapshot);
    expect(createId).not.toHaveBeenCalled();
  });

  it.each([
    [asset("video"), "ASSET_MEDIA_TYPE_MISMATCH"], [{ ...asset(), mimeType: "audio/mpeg" }, "ASSET_MEDIA_TYPE_MISMATCH"],
    [{ ...asset(), id: "https://unowned.invalid/asset" }, "ATTACHMENT_MEDIA"],
  ] as const)("rejects media mismatches and noncanonical asset IDs before ID allocation %#", (value, error) => {
    const base = graph(node("target", "input.image")), createId = ids();
    expect(() => prepareSpacePortMedia(base, input("target", "reference"), value, position, emptyCatalog, createId)).toThrow(error);
    expect(createId).not.toHaveBeenCalled();
    expect(base.edges).toEqual([]);
  });

  it.each([
    [graph(), input("target", "reference"), "INPUT_TARGET_CHANGED"],
    [graph({ ...node("target", "input.image"), configVersion: 99 }), input("target", "reference"), "PORT_UNSUPPORTED"],
    [graph({ ...node("target", "input.image"), kind: "future.kind" }), input("target", "reference"), "PORT_UNSUPPORTED"],
    [graph(node("target", "edit.image.annotation")), input("target", "image"), "NODE_UNAVAILABLE"],
    [graph(node("target", "input.image")), input("target", "missing"), "PORT_UNSUPPORTED"],
    [graph(node("target", "input.prompt")), input("target", "text"), "PORT_UNSUPPORTED"],
    [graph(node("target", "generate.image")), output("target", "image"), "PORT_UNSUPPORTED"],
  ] as const)("rejects stale, unsupported and generation output targets without mutation %#", (base, reference, error) => {
    const snapshot = structuredClone(base), createId = ids();
    expect(() => prepareSpacePortMedia(base, reference, asset(), position, emptyCatalog, createId)).toThrow(error);
    expect(base).toEqual(snapshot);
    expect(createId).not.toHaveBeenCalled();
  });

  it("rejects a now-unsupported saved media port when the latest model no longer accepts images", () => {
    const base = graph(generation("legacy"), node("source", "input.image"));
    base.edges.push(edge("saved", "source", "target", "primary"));
    const catalog = { imageModels: [legacy(0)] };
    expect(() => prepareSpacePortMedia(base, input("target", "primary"), asset(), position, catalog, ids())).toThrow("PORT_UNSUPPORTED");
    expect(base.edges[0].id).toBe("saved");
  });

  it("rejects a saved dynamic field from an older model and a slot outside the current field limit", () => {
    const model = mappedVideo([audioField]), catalog = { imageModels: [], videoModels: [model] };
    const base = graph(generation(model.key, "generate.video"), node("source", "input.audio"));
    base.edges = [edge("saved", "source", "target", "audio-field-old_tracks", 0, "audio")];
    expect(() => prepareSpacePortMedia(base, input("target", "audio-field-old_tracks"), asset("audio"), position, catalog, ids())).toThrow("PORT_UNSUPPORTED");
    expect(() => prepareSpacePortMedia(base, input("target", "audio-field-tracks", 4), asset("audio"), position, catalog, ids())).toThrow("ATTACHMENT_LIMIT");
    expect(base.edges[0].targetPortId).toBe("audio-field-old_tracks");
  });

  it.each([-1, 0.5, 1000, Number.NaN])("rejects invalid positional slot %s before touching the graph", slot => {
    const base = graph(node("target", "output.gallery"));
    expect(() => prepareSpacePortMedia(base, input("target", "image", slot), asset(), position, emptyCatalog, ids())).toThrow("FILE_SLOT_INDEX_INVALID");
    expect(base.nodes).toHaveLength(1);
  });

  it("enforces both graph caps atomically and allows single-wire replacement at the edge cap", () => {
    const source = node("source", "input.image", { assetId: "old" }), target = node("target", "output.gallery");
    const full = graph(source, target, ...Array.from({ length: 498 }, (_, i) => node(`memo-${i}`, "note.memo")));
    expect(() => prepareSpacePortMedia(full, input("target", "image"), asset(), position, emptyCatalog, ids())).toThrow("SPACE_GRAPH_LIMIT");
    expect(full.nodes).toHaveLength(500);
    expect(prepareSpacePortMedia(full, output("source", "image"), asset(), position, emptyCatalog, ids()).nodes).toHaveLength(500);
    const edgeFull = graph(source, target);
    edgeFull.edges = Array.from({ length: 2000 }, (_, i) => edge(`saved-${i}`, "source", "target", "image", i));
    expect(() => prepareSpacePortMedia(edgeFull, input("target", "image"), asset(), position, emptyCatalog, ids())).toThrow("SPACE_GRAPH_LIMIT");
    expect(edgeFull.edges).toHaveLength(2000);
    const single = node("single", "input.image"), capped = { ...edgeFull, nodes: [...edgeFull.nodes, single],
      edges: [...edgeFull.edges.slice(0, 1999), edge("replace-at-cap", "source", "single", "reference")] };
    const next = prepareSpacePortMedia(capped, input("single", "reference"), asset(), position, emptyCatalog, ids());
    expect(next.edges).toHaveLength(2000);
    expect(next.edges.slice(0, 1999)).toEqual(capped.edges.slice(0, 1999));
    expect(next.edges[1999].id).toBe("new-2");
  });

  it("rejects generated IDs that collide with saved nodes or even a just-replaced wire", () => {
    const base = graph(node("source", "input.image"), node("target", "input.image"));
    base.edges = [edge("old-wire", "source", "target", "reference")];
    for (const id of ["source", "old-wire"]) {
      expect(() => prepareSpacePortMedia(base, input("target", "reference"), asset(), position, emptyCatalog, () => id)).toThrow("MEDIA_ID_COLLISION");
    }
    expect(() => prepareSpacePortMedia(base, input("target", "reference"), asset(), position, emptyCatalog, () => "new-constant")).toThrow("MEDIA_ID_COLLISION");
    expect(() => prepareSpacePortMedia(base, input("target", "reference"), asset(), position, emptyCatalog, () => "invalid.id")).toThrow("MEDIA_ID_INVALID");
    expect(base.nodes).toHaveLength(2);
    expect(base.edges[0].id).toBe("old-wire");
  });

  it("applies completion to the latest caller document without restoring captured node positions", () => {
    const captured = graph(node("target", "input.image", { assetId: "old" }), node("other", "note.memo"));
    const latest = { ...captured, title: "Edited during upload", nodes: captured.nodes.map(item => ({ ...item, position: { x: 900, y: 800 } })) };
    const replacement = prepareSpacePortMedia(latest, output("target", "image"), asset(), position, emptyCatalog, ids());
    expect(replacement.nodes[0].position).toBe(latest.nodes[0].position);
    expect(replacement.nodes[1]).toBe(latest.nodes[1]);
    expect(replacement.title).toBe("Edited during upload");
    const connection = prepareSpacePortMedia(latest, input("target", "reference"), asset(), position, emptyCatalog, ids());
    expect(connection.nodes.slice(0, 2)).toEqual(latest.nodes);
    expect(connection.nodes[0]).toBe(latest.nodes[0]);
    expect(captured.nodes[0].position).toEqual({ x: 300, y: 50 });
  });
});
