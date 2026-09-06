import { describe, expect, it, vi } from "vitest";

import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import type { NodeOutputRepository, StoredDisplayNode } from "./node-output-repository";
import { createNodeOutputService } from "./node-output-service";

function asset(id: string, type: MediaType): MediaAssetDto {
  return {
    id,
    version: 1,
    type,
    status: "completed",
    origin: "generation",
    mimeType: `${type}/${type === "image" ? "png" : type === "audio" ? "wav" : "mp4"}`,
    bytes: "10",
    width: type === "image" || type === "video" ? 640 : null,
    height: type === "image" || type === "video" ? 360 : null,
    durationMs: type === "audio" || type === "video" ? 2_000 : null,
    sourceOperationId: null,
    url: `https://read.example/${id}`,
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-03T10:00:00.000Z",
  };
}

function target(
  kind: StoredDisplayNode["kind"],
  incomingEdges: StoredDisplayNode["incomingEdges"],
  config: StoredDisplayNode["config"] = {},
): StoredDisplayNode {
  return { id: "target", kind, config, incomingEdges };
}

function source(overrides: Partial<StoredDisplayNode["incomingEdges"][number]["sourceNode"]>) {
  return {
    id: "source",
    kind: "generate.image",
    config: {},
    selectedOutputAssetId: null,
    outputs: [],
    ...overrides,
  };
}

function edge(
  overrides: Partial<StoredDisplayNode["incomingEdges"][number]>,
): StoredDisplayNode["incomingEdges"][number] {
  return {
    id: "edge-1",
    sourcePortId: "image",
    targetPortId: "image",
    sortOrder: 0,
    sourceNode: source({}),
    ...overrides,
  };
}

function serviceFor(node: StoredDisplayNode, assets: Record<string, MediaAssetDto>) {
  const getOwnedDisplayNode = vi.fn().mockResolvedValue(node);
  const resolveAsset = vi.fn(async (_owner: string, id: string) => assets[id]);
  return {
    getOwnedDisplayNode,
    resolveAsset,
    service: createNodeOutputService({
      repository: { getOwnedDisplayNode } as NodeOutputRepository,
      resolveAsset,
    }),
  };
}

describe("nodeOutputService", () => {
  it.each([
    ["generate.image", "image", "output.single"],
    ["generate.audio", "audio", "output.single"],
    ["edit.video.trim", "video", "output.single"],
    ["edit.image.splitGrid", "images", "output.gallery"],
  ])("does not resurrect cleared %s results for a display", async (kind, portId, displayKind) => {
    const node = target(displayKind, [edge({
      sourcePortId: portId,
      targetPortId: portId === "images" ? "image" : portId,
      sourceNode: source({ kind, outputs: [{ portId, sortOrder: 0, assetId: "old-output" }] }),
    })]);
    const { service, resolveAsset } = serviceFor(node, {});
    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      mediaType: null,
      groups: [{ assets: [] }],
    });
    expect(resolveAsset).not.toHaveBeenCalled();
  });

  it("does not substitute the latest collection for an older selected asset", async () => {
    const node = target("output.gallery", [edge({
      sourcePortId: "images",
      sourceNode: source({
        kind: "edit.image.splitGrid",
        selectedOutputAssetId: "older-selected",
        outputs: [{ portId: "images", sortOrder: 0, assetId: "latest-output" }],
      }),
    })]);
    const { service, resolveAsset } = serviceFor(node, { "older-selected": asset("older-selected", "image") });
    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      groups: [{ assets: [{ id: "older-selected" }] }],
    });
    expect(resolveAsset).not.toHaveBeenCalledWith("owner@example.com", "latest-output");
  });

  it("preserves ordered-list NodeOutput order for a homogeneous Gallery", async () => {
    const node = target("output.gallery", [edge({
      sourcePortId: "images",
      sourceNode: source({
        kind: "edit.image.splitGrid",
        selectedOutputAssetId: "asset-a",
        outputs: [
          { portId: "images", sortOrder: 0, assetId: "asset-a" },
          { portId: "images", sortOrder: 1, assetId: "asset-b" },
        ],
      }),
    })]);
    const { service } = serviceFor(node, {
      "asset-a": asset("asset-a", "image"),
      "asset-b": asset("asset-b", "image"),
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      kind: "output.gallery",
      mediaType: "image",
      groups: [{ portId: "image", assets: [{ id: "asset-a" }, { id: "asset-b" }] }],
    });
  });

  it("keeps every ordered-list output even when the operation selected its first preview asset", async () => {
    const node = target("output.gallery", [edge({
      sourcePortId: "images",
      sourceNode: source({
        kind: "edit.image.splitGrid",
        selectedOutputAssetId: "asset-a",
        outputs: [
          { portId: "images", sortOrder: 0, assetId: "asset-a" },
          { portId: "images", sortOrder: 1, assetId: "asset-b" },
        ],
      }),
    })]);
    const { service } = serviceFor(node, {
      "asset-a": asset("asset-a", "image"),
      "asset-b": asset("asset-b", "image"),
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      groups: [{ assets: [{ id: "asset-a" }, { id: "asset-b" }] }],
    });
  });

  it("uses an explicitly selected asset instead of the default NodeOutput", async () => {
    const node = target("output.single", [edge({
      sourceNode: source({
        selectedOutputAssetId: "asset-selected",
        outputs: [{ portId: "image", sortOrder: 0, assetId: "asset-default" }],
      }),
    })]);
    const { service, resolveAsset } = serviceFor(node, {
      "asset-selected": asset("asset-selected", "image"),
    });

    await service.resolve("owner@example.com", "graph-1", "target");
    expect(resolveAsset).toHaveBeenCalledWith("owner@example.com", "asset-selected");
    expect(resolveAsset).not.toHaveBeenCalledWith("owner@example.com", "asset-default");
  });

  it("uses one selected Split Grid asset for a single-value Output", async () => {
    const node = target("output.single", [edge({
      sourcePortId: "images",
      sourceNode: source({
        kind: "edit.image.splitGrid",
        selectedOutputAssetId: "asset-b",
        outputs: [
          { portId: "images", sortOrder: 0, assetId: "asset-a" },
          { portId: "images", sortOrder: 1, assetId: "asset-b" },
        ],
      }),
    })]);
    const { service, resolveAsset } = serviceFor(node, {
      "asset-b": asset("asset-b", "image"),
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      groups: [{ assets: [{ id: "asset-b" }] }],
    });
    expect(resolveAsset).toHaveBeenCalledTimes(1);
  });

  it.each(["input.image", "edit.image.splitGrid"])("resolves an Input reference from %s", async (sourceKind) => {
    const output = target("output.single", [edge({
      sourceNode: source({ id: "relay", kind: "input.image", config: { assetId: "local-preserved" } }),
    })]);
    const relay = target("input.image", [edge({
      id: "pass-through",
      sourceNode: source({ id: "root", kind: sourceKind, config: { assetId: "asset-root" }, selectedOutputAssetId: "asset-root" }),
      sourcePortId: sourceKind === "input.image" ? "image" : "images",
      targetPortId: "reference",
    })]);
    relay.id = "relay";
    const getOwnedDisplayNode = vi.fn(async (_owner: string, _graph: string, nodeId: string) =>
      nodeId === "relay" ? relay : output,
    );
    const resolveAsset = vi.fn(async (_owner: string, id: string) => asset(id, "image"));
    const service = createNodeOutputService({
      repository: { getOwnedDisplayNode } as NodeOutputRepository,
      resolveAsset,
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      groups: [{ assets: [{ id: sourceKind === "input.image" ? "asset-root" : "local-preserved" }] }],
    });
    expect(resolveAsset).toHaveBeenCalledTimes(1);
  });

  it("rejects a cyclic Input chain instead of displaying a local fallback", async () => {
    const output = target("output.single", [edge({
      sourceNode: source({ id: "relay", kind: "input.image", config: { assetId: "local-preserved" } }),
    })]);
    const relay = target("input.image", [edge({
      id: "pass-through-cycle",
      sourceNode: source({ id: "relay", kind: "input.image", config: { assetId: "local-preserved" } }),
      targetPortId: "reference",
    })]);
    relay.id = "relay";
    const getOwnedDisplayNode = vi.fn(async (_owner: string, _graph: string, nodeId: string) =>
      nodeId === "relay" ? relay : output,
    );
    const resolveAsset = vi.fn(async (_owner: string, id: string) => asset(id, "image"));
    const service = createNodeOutputService({
      repository: { getOwnedDisplayNode } as NodeOutputRepository,
      resolveAsset,
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target")).rejects.toMatchObject({
      code: "NODE_INPUT_INVALID",
      details: expect.objectContaining({ reason: "INPUT_PASS_THROUGH_CYCLE" }),
    });
    expect(resolveAsset).not.toHaveBeenCalled();
  });

  it("rejects mixed media even if a malformed Graph reaches Gallery resolution", async () => {
    const node = target("output.gallery", [
      edge({ sourceNode: source({ kind: "input.image", config: { assetId: "image-1" } }) }),
      edge({
        id: "edge-2",
        sourcePortId: "audio",
        sourceNode: source({ id: "audio-source", kind: "input.audio", config: { assetId: "audio-1" } }),
      }),
    ]);
    const { service } = serviceFor(node, {
      "image-1": asset("image-1", "image"),
      "audio-1": asset("audio-1", "audio"),
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target"))
      .rejects.toMatchObject({ code: "NODE_INPUT_INVALID" });
  });

  it("filters durably removed audio assets from a Gallery", async () => {
    const node = target("output.gallery", [edge({
      sourcePortId: "audio",
      targetPortId: "audio",
      sourceNode: source({ id: "audio-source", kind: "input.audio", config: { assetId: "audio-1" } }),
    })], {
      mediaType: "audio",
      excludedAssetIds: ["audio-1"],
    });
    const { service, resolveAsset } = serviceFor(node, {
      "audio-1": asset("audio-1", "audio"),
    });

    await expect(service.resolve("owner@example.com", "graph-1", "target")).resolves.toMatchObject({
      kind: "output.gallery",
      mediaType: null,
      groups: [{ portId: "audio", assets: [] }],
    });
    expect(resolveAsset).toHaveBeenCalledWith("owner@example.com", "audio-1");
  });
});
