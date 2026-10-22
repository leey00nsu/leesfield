import { describe, expect, it } from "vitest";
import type { CanonicalNode } from "@/shared/generation-graph/canonical-graph";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import { findPortDefinition, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { temporarilyHiddenEditNodeKinds } from "@/shared/generation-graph/node-availability";
import type { SpaceEditorDocument } from "./space-editor-types";
import { compatibleSpaceNodeKinds, spaceConnectionForPorts, spaceHandleId, spaceNodePorts, spacePortFromHandle, reconcileSpaceModelEdges } from "./space-editor-ports";
import { mappedReferenceImageModelFixture, runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

const node = (id: string, kind: CanonicalNodeKind): CanonicalNode => ({ id, kind, config: defaultConfigForKind(kind), configVersion: 1,
  position: { x: 0, y: 0 }, selectedOutputAssetId: null });
const graph = (nodes: CanonicalNode[]): SpaceEditorDocument => ({ schemaVersion: 3, title: "Ports", nodes, edges: [], groups: [] });
it.each(["input.video", "output.single"] as const)("shows %s's existing capture handle while preventing manual capture wiring", kind => {
  const draft = graph([node("source", kind), node("image", "input.image")]), catalog = { imageModels: [] };
  expect(spaceNodePorts(draft, "source", catalog).find(port => port.definition.id === "capturedFrame")).toMatchObject({ visible: false, connectable: false });
  draft.edges = [{ id: "capture", sourceNodeId: "source", sourcePortId: "capturedFrame", targetNodeId: "image", targetPortId: "reference", sortOrder: 0 }];
  expect(spaceNodePorts(draft, "source", catalog).find(port => port.definition.id === "capturedFrame")).toMatchObject({ visible: true, connectable: false });
  expect(spaceConnectionForPorts({ ...draft, edges: [] }, { nodeId: "source", portId: "capturedFrame", direction: "output" }, { nodeId: "image", portId: "reference", direction: "input" }, catalog, "invalid")).toEqual({ valid: false, reason: "PORT_UNSUPPORTED" });
});
const source = { nodeId: "source", portId: "image", direction: "output" as const };
const target = { nodeId: "target", portId: "primary", direction: "input" as const };
const legacy = { ...runtimeImageModelsFixture[0], key: "legacy", meta: { max_input_images: 2 } };
const catalog = { imageModels: [legacy, mappedReferenceImageModelFixture], videoModels: runtimeVideoModelsFixture };

function generation(kind: CanonicalNodeKind = "generate.image", modelKey = "legacy") {
  return { ...node("target", kind), config: { ...defaultConfigForKind(kind), modelKey } };
}

describe("canonical Space ports", () => {
  it.each(temporarilyHiddenEditNodeKinds)("excludes %s from both connection directions without removing saved wires", kind => {
    const mediaType = kind === "edit.image.resize" ? "image" : "video";
    const inputPort = kind === "edit.video.stitch" ? "clips" : mediaType;
    const draft = graph([node("source", `input.${mediaType}`), node("target", kind), node("result", `input.${mediaType}`)]);
    draft.edges.push({ id: "saved", sourceNodeId: "source", sourcePortId: mediaType, targetNodeId: "target", targetPortId: inputPort, sortOrder: 0 });
    const before = structuredClone(draft);
    expect(spaceNodePorts(draft, "target", catalog)).toEqual([]);
    const output = findPortDefinition(`input.${mediaType}`, mediaType, "output")!;
    const input = findPortDefinition(`input.${mediaType}`, mediaType === "image" ? "reference" : mediaType, "input")!;
    expect(compatibleSpaceNodeKinds(output)).not.toContain(kind);
    expect(compatibleSpaceNodeKinds(input)).not.toContain(kind);
    expect(spaceConnectionForPorts(draft, { nodeId: "source", portId: mediaType, direction: "output" }, { nodeId: "target", portId: inputPort, direction: "input" }, catalog, "new-input"))
      .toEqual({ valid: false, reason: "NODE_UNAVAILABLE" });
    expect(spaceConnectionForPorts(draft, { nodeId: "target", portId: mediaType, direction: "output" }, { nodeId: "result", portId: input.id, direction: "input" }, catalog, "new-output"))
      .toEqual({ valid: false, reason: "NODE_UNAVAILABLE" });
    expect(draft).toEqual(before);
  });

  it.each<{ parameters: Record<string, number>; active: string[]; inactive: string[] }>([
    { parameters: {}, active: ["startFrame", "endFrame"], inactive: ["frame"] },
    { parameters: { timestampMs: 0 }, active: ["frame"], inactive: ["startFrame", "endFrame"] },
    { parameters: { timestampMs: 1500 }, active: ["frame"], inactive: ["startFrame", "endFrame"] },
  ])("exposes the active Frames outputs for $parameters and retains connected inactive handles", ({ parameters, active, inactive }) => {
    const draft = graph([{ ...node("frames", "edit.video.extractFrames"), config: { parameters } }, node("result", "input.image")]);
    const before = structuredClone(draft);
    const outputs = () => spaceNodePorts(draft, "frames", catalog).filter(port => port.definition.direction === "output");
    expect(outputs().filter(port => port.connectable).map(port => port.definition.id)).toEqual(active);
    for (const id of inactive) expect(outputs().find(port => port.definition.id === id)).toMatchObject({ visible: false, connectable: false });
    for (const portId of [...active, ...inactive]) {
      expect(spaceConnectionForPorts(draft, { nodeId: "frames", portId, direction: "output" }, { nodeId: "result", portId: "reference", direction: "input" }, catalog, `new-${portId}`).valid).toBe(active.includes(portId));
    }
    draft.edges.push({ id: "saved", sourceNodeId: "frames", sourcePortId: inactive[0], targetNodeId: "result", targetPortId: "reference", sortOrder: 0 });
    expect(outputs().find(port => port.definition.id === inactive[0])).toMatchObject({ visible: true, connectable: false });
    expect(draft.nodes).toEqual(before.nodes);
    expect(draft.edges[0].sourcePortId).toBe(inactive[0]);
  });

  it("round-trips direction, dynamic field names and positional slots without persisting canvas handles", () => {
    const value = { nodeId: "__proto__", portId: "audio-field-reference_tracks", direction: "input" as const, slot: 2 };
    expect(spacePortFromHandle(value.nodeId, spaceHandleId(value))).toEqual(value);
    expect(spaceHandleId({ portId: "image", direction: "input" })).not.toBe(spaceHandleId({ portId: "image", direction: "output" }));
    for (const invalid of ["image", "{}", '["source","image",0]', '["input","image",-1]', '["input","image",1000]', '["input","image",1.5]']) {
      expect(spacePortFromHandle("node", invalid)).toBeNull();
    }
  });

  it("connects a shared legacy Image anchor to primary then references while preserving stored IDs", () => {
    const base = graph([node("source", "input.image"), node("other", "input.image"), generation()]);
    const first = spaceConnectionForPorts(base, source, target, catalog, "first");
    expect(first).toMatchObject({ valid: true, edge: { id: "first", sourcePortId: "image", targetPortId: "primary", sortOrder: 0 } });
    if (!first.valid) throw new Error(first.reason);
    const connected = { ...base, edges: [first.edge] };
    const second = spaceConnectionForPorts(connected, { ...source, nodeId: "other" }, target, catalog, "second");
    expect(second).toMatchObject({ valid: true, edge: { targetPortId: "references", sortOrder: 0 } });
    if (!second.valid) throw new Error(second.reason);
    const full = { ...base, edges: [first.edge, second.edge] };
    expect(spaceConnectionForPorts(full, source, target, catalog, "third")).toEqual({ valid: false, reason: "ATTACHMENT_LIMIT" });
    expect(connected.edges[0]).toBe(first.edge);
    expect(JSON.stringify(first.edge)).not.toContain(spaceHandleId(target));
  });

  it("uses provider fields and preserves connected legacy aliases at the same visual anchor", () => {
    const base = graph([node("source", "input.image"), generation("generate.image", mappedReferenceImageModelFixture.key)]);
    base.edges.push({ id: "saved", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "target", targetPortId: "primary", sortOrder: 0 });
    const ports = spaceNodePorts(base, "target", catalog);
    expect(ports.find(port => port.definition.id === "image-field-refs")).toMatchObject({ visible: true, connectable: true, label: "Reference images" });
    expect(ports.find(port => port.definition.id === "primary")).toMatchObject({ visible: false, connectable: true, anchorPortId: "image-field-refs" });
    expect(base.edges[0].targetPortId).toBe("primary");
    expect(spaceConnectionForPorts(base, source, { ...target, portId: "image-field-refs", slot: 3 }, catalog, "new")).toMatchObject({ valid: true,
      edge: { targetPortId: "image-field-refs", sortOrder: 3 } });
  });

  it("rejects wrong types, cycles, same directions, unavailable nodes and unregistered handles atomically", () => {
    const base = graph([node("source", "input.audio"), generation()]);
    expect(spaceConnectionForPorts(base, { ...source, portId: "audio" }, target, catalog, "wrong").valid).toBe(false);
    expect(spaceConnectionForPorts(base, { ...source, direction: "input" }, target, catalog, "direction")).toEqual({ valid: false, reason: "PORT_DIRECTION" });
    expect(spaceConnectionForPorts(base, { ...source, portId: "missing" }, target, catalog, "missing").valid).toBe(false);
    const retired = graph([node("source", "edit.image.annotation"), generation()]);
    expect(spaceConnectionForPorts(retired, source, target, catalog, "retired")).toEqual({ valid: false, reason: "NODE_UNAVAILABLE" });
    const cycle = graph([node("source", "input.image"), node("target", "input.image")]);
    cycle.edges.push({ id: "back", sourceNodeId: "target", sourcePortId: "image", targetNodeId: "source", targetPortId: "reference", sortOrder: 0 });
    expect(spaceConnectionForPorts(cycle, source, { ...target, portId: "reference" }, catalog, "cycle")).toEqual({ valid: false, reason: "GRAPH_CYCLE" });
    expect(base.edges).toEqual([]);
  });

  it("does not invent a prompt input role when a mapped model declares only detailed text fields", () => {
    const contract = mappedReferenceImageModelFixture.providerConfig!.gradio_contract as Record<string, unknown>;
    const model = { ...mappedReferenceImageModelFixture, key: "no-primary-text", providerConfig: { ...mappedReferenceImageModelFixture.providerConfig,
      gradio_contract: { ...contract, inputs: [{ name: "script", label: "Script", kind: "string", required: true, nullable: false, schema: { type: "string" } }] } } };
    const base = graph([node("source", "input.prompt"), generation("generate.image", model.key)]);
    expect(spaceConnectionForPorts(base, { ...source, portId: "text" }, { ...target, portId: "prompt" }, { imageModels: [model] }, "text")).toEqual({ valid: false, reason: "PORT_UNSUPPORTED" });
    expect(spaceNodePorts(base, "target", { imageModels: [model] }).find(port => port.definition.id === "prompt")).toMatchObject({ visible: false, connectable: false });
  });

  it("retains saved inactive media handles while preventing new unsupported input connections", () => {
    const model = { ...legacy, meta: { max_input_images: 0 } };
    const base = graph([node("source", "input.image"), generation()]);
    base.edges.push({ id: "saved", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "target", targetPortId: "primary", sortOrder: 0 });
    expect(spaceNodePorts(base, "target", { imageModels: [model] }).find(port => port.definition.id === "primary")).toMatchObject({ visible: true, connectable: false });
    expect(spaceConnectionForPorts(base, source, target, { imageModels: [model] }, "new").valid).toBe(false);
    expect(base.edges).toHaveLength(1);
  });

  it("keeps preset edges on model changes and trims only legacy references on explicit model replacement", () => {
    const base = graph([node("source", "input.image"), generation(), node("other", "input.image")]);
    base.edges.push({ id: "one", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "target", targetPortId: "primary", sortOrder: 0 },
      { id: "two", sourceNodeId: "other", sourcePortId: "image", targetNodeId: "target", targetPortId: "references", sortOrder: 5 });
    const smaller = { ...legacy, key: "small", meta: { max_input_images: 1 } };
    expect(reconcileSpaceModelEdges(base, "target", { modelKey: "small" }, { imageModels: [legacy, smaller] }).map(edge => edge.id)).toEqual(["one"]);
    expect(reconcileSpaceModelEdges(base, "target", { modelKey: "legacy" }, catalog)).toBe(base.edges);
    const preset = { key: "custom-reference", revision: 1, requiredInputs: { referenceImageCount: 1 }, recommendedParameters: {} };
    expect(reconcileSpaceModelEdges(base, "target", { modelKey: "small", promptPreset: preset }, { imageModels: [legacy, smaller] })).toBe(base.edges);
    expect(base.edges[1].sortOrder).toBe(5);
  });

  it("keeps saved reference inputs when a replacement's mapped contract supports them despite legacy metadata", () => {
    const mapped = { ...mappedReferenceImageModelFixture, meta: { max_input_images: 0 } };
    const image = graph([node("source", "input.image"), node("other", "input.image"), generation()]);
    image.edges.push({ id: "one", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "target", targetPortId: "primary", sortOrder: 0 },
      { id: "two", sourceNodeId: "other", sourcePortId: "image", targetNodeId: "target", targetPortId: "references", sortOrder: 0 });
    expect(reconcileSpaceModelEdges(image, "target", { modelKey: mapped.key }, { imageModels: [legacy, mapped] })).toBe(image.edges);
    const mappedVideo = { ...runtimeVideoModelsFixture[0], key: "mapped-video", meta: { supports_init_image: false }, providerConfig: mapped.providerConfig };
    const video = graph([node("source", "input.image"), generation("generate.video", "old-video")]);
    video.edges.push({ id: "init", sourceNodeId: "source", sourcePortId: "image", targetNodeId: "target", targetPortId: "initImage", sortOrder: 0 });
    expect(reconcileSpaceModelEdges(video, "target", { modelKey: mappedVideo.key }, { imageModels: [], videoModels: [mappedVideo] })).toBe(video.edges);
  });

  it("rejects appending past a sparse field's last slot even while the asset count is below its limit", () => {
    const base = graph([node("source", "input.image"), node("last", "input.image"), generation("generate.image", mappedReferenceImageModelFixture.key)]);
    base.edges.push({ id: "sparse", sourceNodeId: "last", sourcePortId: "image", targetNodeId: "target", targetPortId: "image-field-refs", sortOrder: 5 });
    expect(spaceConnectionForPorts(base, source, { ...target, portId: "image-field-refs" }, catalog, "overflow")).toEqual({ valid: false, reason: "ATTACHMENT_LIMIT" });
    expect(spaceConnectionForPorts(base, source, { ...target, portId: "image-field-refs", slot: 2 }, catalog, "gap")).toMatchObject({ valid: true, edge: { sortOrder: 2 } });
    expect(base.edges).toHaveLength(1);
  });
});
