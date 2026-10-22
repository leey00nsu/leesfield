import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import type { SpaceEditorDocument } from "./space-editor-types";
import { SpaceInputResolver } from "./space-editor-inputs";
import { replaceSpaceGenerationAttachments, replaceRelatedSpaceGenerationAttachments, spaceAttachmentExpectationMatches,
  captureSpaceAttachmentExpectation, spaceAttachmentAssetIds, spaceGenerationAttachmentSlots, type SpaceAttachmentSlot } from "./space-editor-attachments";
import { mappedReferenceImageModelFixture, runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

const initial = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Test", groups: [], nodes: [
  { id: "target", kind: "generate.video", configVersion: 1, config: { modelKey: "test", prompt: "", parameters: {} },
    position: { x: 600, y: 200 }, selectedOutputAssetId: null },
], edges: [] });
const video: SpaceAttachmentSlot = { field: { name: "clips", label: "Clips", media: "video", kind: "files", required: false, nullable: false,
  schema: { type: "array", items: { type: "string" } } }, ports: ["video-field-clips"], limit: 3 };
const audio: SpaceAttachmentSlot = { field: { name: "tracks", label: "Tracks", media: "audio", kind: "files", required: false, nullable: false,
  schema: { type: "array", items: { type: ["string", "null"] } },
  attachment: { role: "paired_audio", pairedWith: "clips", pairing: "index" } }, ports: ["audio-field-tracks"], limit: 3 };
const ids = () => { let count = 0; return () => `generated-${++count}`; };

describe("canonical Space attachments", () => {
  it("retains duplicate assets, edge identity and local source nodes when references move/remove", () => {
    const createId = ids();
    const base = initial();
    const attached = replaceSpaceGenerationAttachments(base, "target", video, ["one", "one", "three"], createId);
    const edgeIds = attached.edges.map(edge => edge.id);
    const moved = replaceSpaceGenerationAttachments(attached, "target", video, ["three", "one"], createId);
    expect(moved.nodes).toEqual(attached.nodes);
    expect(moved.edges.map(edge => edge.id)).toEqual([edgeIds[2], edgeIds[0]]);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(moved), "target", video)).toEqual(["three", "one"]);
    expect(replaceSpaceGenerationAttachments(moved, "target", video, ["three", "one"], createId)).toBe(moved);
    expect(base.nodes).toHaveLength(1);
    expect(base.edges).toEqual([]);
  });

  it("moves paired nullable audio slots by explicit index and preserves trailing empty overrides", () => {
    const createId = ids();
    const slots = [video, audio];
    const clips = replaceSpaceGenerationAttachments(initial(), "target", video, ["v1", "v2", "v3"], createId);
    const attached = replaceRelatedSpaceGenerationAttachments(clips, "target", slots, audio, [null, "a2", null], createId);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(attached), "target", audio)).toEqual([null, "a2", null]);
    const moved = replaceRelatedSpaceGenerationAttachments(attached, "target", slots, video, ["v2", "v3", "v1"], createId, [1, 2, 0]);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(moved), "target", audio)).toEqual(["a2", null, null]);
    const removed = replaceRelatedSpaceGenerationAttachments(moved, "target", slots, video, ["v3", "v1"], createId, [1, 2]);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(removed), "target", audio)).toEqual([null, null]);
    expect(() => replaceRelatedSpaceGenerationAttachments(attached, "target", slots, video, ["v1", "v1"], createId, [0, 0])).toThrow("ATTACHMENT_ORDER");
    expect(() => replaceRelatedSpaceGenerationAttachments(initial(), "target", slots, audio, ["a1"], createId)).toThrow("HF_CONTRACT_ATTACHMENT_ORPHAN");
  });

  it("reorders duplicate video source identities together with their paired audio source identities", () => {
    const createId = ids();
    const clips = replaceSpaceGenerationAttachments(initial(), "target", video, ["same-video", "same-video"], createId);
    const attached = replaceRelatedSpaceGenerationAttachments(clips, "target", [video, audio], audio, ["same-audio", "same-audio"], createId);
    const videoSources = attached.edges.filter(edge => edge.targetPortId === video.ports[0]).map(edge => edge.sourceNodeId);
    const audioSources = attached.edges.filter(edge => edge.targetPortId === audio.ports[0]).map(edge => edge.sourceNodeId);
    const moved = replaceRelatedSpaceGenerationAttachments(attached, "target", [video, audio], video, ["same-video", "same-video"], createId, [1, 0]);
    expect(moved.edges.filter(edge => edge.targetPortId === video.ports[0]).map(edge => edge.sourceNodeId)).toEqual([...videoSources].reverse());
    expect(moved.edges.filter(edge => edge.targetPortId === audio.ports[0]).map(edge => edge.sourceNodeId)).toEqual([...audioSources].reverse());
    expect(moved.nodes).toEqual(attached.nodes);
  });

  it("keeps an untouched collection connected once and materializes explicitly reordered items without duplication", () => {
    const slot = spaceGenerationAttachmentSlots(mappedReferenceImageModelFixture)[0];
    const base = initial();
    base.nodes[0] = { ...base.nodes[0], kind: "generate.image" };
    base.nodes.push({ id: "split", kind: "edit.image.splitGrid", configVersion: 1, config: { parameters: {} },
      position: { x: 0, y: 0 }, selectedOutputAssetId: "a" });
    base.edges.push({ id: "collection", sourceNodeId: "split", sourcePortId: "images", targetNodeId: "target", targetPortId: slot.ports[0], sortOrder: 0 });
    const runtime = { mediaOutputs: new Map([["split", [{ portId: "images", sortOrder: 0, assetId: "a" }, { portId: "images", sortOrder: 1, assetId: "b" }]]]) };
    expect(replaceSpaceGenerationAttachments(base, "target", slot, ["a", "b"], ids(), runtime)).toBe(base);
    const moved = replaceRelatedSpaceGenerationAttachments(base, "target", [slot], slot, ["b", "a"], ids(), [1, 0], runtime);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(moved, runtime), "target", slot)).toEqual(["b", "a"]);
    expect(moved.edges).toHaveLength(2);
    expect(moved.edges.every(edge => edge.sourceNodeId !== "split")).toBe(true);
    expect(moved.nodes.find(node => node.id === "split")).toBe(base.nodes[1]);
  });

  it("preserves provider fallback instead of silently turning omitted slots into explicit nulls", () => {
    const createId = ids();
    const clips = replaceSpaceGenerationAttachments(initial(), "target", video, ["v1", "v2", "v3"], createId);
    const attached = replaceRelatedSpaceGenerationAttachments(clips, "target", [video, audio], audio, ["a1"], createId);
    expect(() => replaceRelatedSpaceGenerationAttachments(attached, "target", [video, audio], video, ["v2", "v1", "v3"], createId, [1, 0, 2])).toThrow("ATTACHMENT_SLOT_FALLBACK");
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(attached), "target", audio)).toEqual(["a1"]);
  });

  it("normalizes edited legacy references to the provider field without copying a relay or its asset", () => {
    const slot = spaceGenerationAttachmentSlots(mappedReferenceImageModelFixture)[0];
    const base = initial();
    base.nodes[0] = { ...base.nodes[0], kind: "generate.image" };
    base.nodes.push({ id: "relay", kind: "input.image", configVersion: 1, config: { assetId: "asset" }, position: { x: 0, y: 0 }, selectedOutputAssetId: null });
    base.edges.push({ id: "existing", sourceNodeId: "relay", sourcePortId: "image", targetNodeId: "target", targetPortId: "primary", sortOrder: 0 });
    const next = replaceSpaceGenerationAttachments(base, "target", slot, ["asset"], ids());
    expect(next.nodes).toEqual(base.nodes);
    expect(next.edges[0]).toEqual({ ...base.edges[0], targetPortId: "image-field-refs" });
    expect(base.edges[0].targetPortId).toBe("primary");
  });

  it("allows removal when a changed model limit is smaller, and rejects oversized batches atomically", () => {
    const createId = ids();
    const base = initial();
    const attached = replaceSpaceGenerationAttachments(base, "target", video, ["v1", "v2", "v3"], createId);
    const reduced = replaceSpaceGenerationAttachments(attached, "target", { ...video, limit: 1 }, ["v2", "v3"], createId);
    expect(reduced.nodes).toEqual(attached.nodes);
    expect(spaceAttachmentAssetIds(new SpaceInputResolver(reduced), "target", video)).toEqual(["v2", "v3"]);
    expect(() => replaceSpaceGenerationAttachments(base, "target", video, ["v1", "v2", "v3", "v4"], createId)).toThrow("ATTACHMENT_LIMIT");
    expect(base.nodes).toHaveLength(1);
    expect(() => replaceSpaceGenerationAttachments(base, "target", video, [null], createId)).toThrow("ATTACHMENT_MEDIA");
    expect(() => replaceSpaceGenerationAttachments(base, "target", video, ["https://unowned.invalid/file"], createId)).toThrow("ATTACHMENT_MEDIA");
    const full = { ...base, nodes: [...base.nodes, ...Array.from({ length: 499 }, (_, index): CanonicalNode => ({
      id: `n-${index}`, kind: "note.memo", configVersion: 1, config: { text: "" }, position: { x: 0, y: 0 }, selectedOutputAssetId: null }))] };
    expect(() => replaceSpaceGenerationAttachments(full, "target", video, ["asset"], createId)).toThrow("SPACE_GRAPH_LIMIT");
    expect(full.nodes).toHaveLength(500);
  });

  it("rejects stale model/asset expectations while allowing unrelated node movement", () => {
    const createId = ids();
    const attached = replaceSpaceGenerationAttachments(initial(), "target", video, ["v1"], createId);
    const expected = { modelKey: "test", assetIds: ["v1"] };
    expect(spaceAttachmentExpectationMatches(attached, "target", video, expected, [video])).toBe(true);
    const moved = { ...attached, nodes: attached.nodes.map(node => ({ ...node, position: { x: 900, y: 800 } })) };
    expect(spaceAttachmentExpectationMatches(moved, "target", video, expected, [video])).toBe(true);
    expect(spaceAttachmentExpectationMatches(attached, "target", video, { ...expected, modelKey: "new" }, [video])).toBe(false);
    const changed = replaceSpaceGenerationAttachments(attached, "target", video, ["v2"], createId);
    expect(spaceAttachmentExpectationMatches(changed, "target", video, expected, [video])).toBe(false);
    expect(spaceAttachmentExpectationMatches({ ...attached, nodes: [] }, "target", video, expected, [video])).toBe(false);
  });

  it("rejects same-asset rewiring, A→B→A input edits and a different resolver session", () => {
    const createId = ids();
    const attached = replaceSpaceGenerationAttachments(initial(), "target", video, ["v1"], createId);
    const resolver = new SpaceInputResolver(attached);
    const expected = captureSpaceAttachmentExpectation(resolver, "target", video, [video]);
    const moved = { ...attached, nodes: attached.nodes.map(node => ({ ...node, position: { x: 900, y: 800 } })) };
    resolver.updateGraph(moved);
    expect(spaceAttachmentExpectationMatches(moved, "target", video, expected, [video], {}, resolver)).toBe(true);
    const changed = replaceSpaceGenerationAttachments(moved, "target", video, ["v2"], createId);
    resolver.updateGraph(changed);
    resolver.updateGraph(attached);
    expect(spaceAttachmentExpectationMatches(attached, "target", video, expected, [video], {}, resolver)).toBe(false);
    expect(spaceAttachmentExpectationMatches(attached, "target", video, expected, [video], {}, new SpaceInputResolver(attached))).toBe(false);
    const another = new SpaceInputResolver(attached);
    const beforeRewire = captureSpaceAttachmentExpectation(another, "target", video, [video]);
    const rewired = { ...attached, edges: attached.edges.map(edge => ({ ...edge, id: "replacement-edge" })) };
    expect(spaceAttachmentExpectationMatches(rewired, "target", video, beforeRewire, [video], {}, another)).toBe(false);
  });

  it("derives legacy image inputs from actual model capability", () => {
    expect(spaceGenerationAttachmentSlots({ ...runtimeImageModelsFixture[0], meta: { max_input_images: 4 } })[0]).toMatchObject({ limit: 4, ports: ["primary", "references"] });
    expect(spaceGenerationAttachmentSlots({ ...runtimeImageModelsFixture[0], meta: { max_input_images: 0 } })).toEqual([]);
  });
});
