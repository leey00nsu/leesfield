import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadReferenceFiles, mediaUploadErrorMessage } from "./reference-file-upload";
import { generationResponseError } from "./generation-response-error";

const limit = 50 * 1024 * 1024;
const json = (body: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(body), {status, headers});
afterEach(() => vi.unstubAllGlobals());

describe("reference binary upload", () => {
  it("transfers the original 50 MiB File and returns durable references in order", async () => {
    const file = new File([new Uint8Array(limit)], "reference.mp4", {type:"video/mp4"});
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({limits:{image:limit,video:limit,audio:limit}}))
      .mockResolvedValueOnce(json({upload:{id:"upload-id",upload:{url:"/binary-target",method:"PUT",headers:{"Content-Type":"video/mp4"}}}}))
      .mockResolvedValueOnce(new Response(null, {status:204}))
      .mockResolvedValueOnce(json({asset:{id:"asset-id",url:"https://storage.example/reference.mp4"}}));
    vi.stubGlobal("fetch", fetcher);
    const assets = await uploadReferenceFiles([file], "video");
    expect(fetcher.mock.calls[2][1].body).toBe(file);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({declaredBytes:limit,declaredMimeType:"video/mp4"});
    expect(assets.map(asset=>asset.url)).toEqual(["https://storage.example/reference.mp4"]);
    expect(JSON.stringify({reference_videos:assets.map(asset=>asset.url)})).not.toContain("base64");
  });

  it("rejects policy overflow before creating a session and displays the configured limit", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({limits:{image:limit,video:limit,audio:limit}}));
    vi.stubGlobal("fetch", fetcher);
    const file = new File([new Uint8Array(limit+1)], "reference.mp4", {type:"video/mp4"});
    const error = await uploadReferenceFiles([file], "video").catch(error=>error);
    expect(error).toMatchObject({status:413,code:"MEDIA_FILE_TOO_LARGE",details:{maxBytes:limit}});
    expect(mediaUploadErrorMessage(error,true)).toContain("50 MiB");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves a relay failure with its HTTP request ID and never confirms it", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({limits:{image:limit,video:limit,audio:limit}}))
      .mockResolvedValueOnce(json({upload:{id:"upload",upload:{url:"/binary",method:"PUT"}}}))
      .mockResolvedValueOnce(json({message:"MEDIA_SIZE_MISMATCH"},422,{"x-request-id":"trace-id"}));
    vi.stubGlobal("fetch", fetcher);
    const error = await uploadReferenceFiles([new File(["a"],"a.wav",{type:"audio/wav"})],"audio").catch(error=>error);
    expect(error).toMatchObject({status:422,code:"MEDIA_SIZE_MISMATCH",details:{requestId:"trace-id"}});
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("preserves malformed generation body rejections instead of reporting a generic failure", async () => {
    const error = await generationResponseError(json({message:"BODY_INVALID"},400,{"x-request-id":"body-trace"}));
    expect(error).toMatchObject({code:"BODY_INVALID",status:400,requestId:"body-trace"});
    expect(error.message).toContain("body-trace");
  });
});
