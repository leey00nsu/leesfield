import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteMediaAsset,
  listMediaAssets,
  MediaAssetApiError,
  resolveNodeAssets,
  uploadMediaAsset,
} from "./media-asset-api";

describe("media asset API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes cursor list and Graph output routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output: { groups: [] } })));
    vi.stubGlobal("fetch", fetchMock);

    await listMediaAssets("audio", "asset/1");
    await resolveNodeAssets("graph/1", "node/1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/media-assets?type=audio&limit=24&cursor=asset%2F1",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/generation-graphs/graph%2F1/nodes/node%2F1/outputs",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("performs presign, direct PUT, then confirm without persisting the signed URL", async () => {
    const confirmedAsset = { id: "asset-1", type: "image" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        upload: {
          id: "upload-1",
          upload: { method: "PUT", url: "https://upload.example/signed", headers: { "Content-Type": "image/png" } },
        },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ asset: confirmedAsset })));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["png"], "frame.png", { type: "image/png" });
    const signal = new AbortController().signal;

    await expect(uploadMediaAsset(file, "image", {
      operationId: "operation-1",
      outputPortId: "images",
      sortOrder: 2,
    }, signal)).resolves.toEqual(confirmedAsset);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      operationId: "operation-1",
      outputPortId: "images",
      sortOrder: 2,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://upload.example/signed", {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: file,
      signal,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/media-assets/uploads/upload-1/confirm",
      expect.objectContaining({ method: "POST", body: "{}", signal }),
    );
  });

  it("keeps affected Graph ids on a blocked delete error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "MEDIA_ASSET_IN_USE",
      graphIds: ["graph-1"],
    }), { status: 409 })));

    await expect(deleteMediaAsset("asset-1")).rejects.toEqual(
      new MediaAssetApiError(409, "MEDIA_ASSET_IN_USE", {
        message: "MEDIA_ASSET_IN_USE",
        graphIds: ["graph-1"],
      }),
    );
  });
});
