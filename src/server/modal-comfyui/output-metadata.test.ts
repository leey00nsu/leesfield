// @vitest-environment node
import {readFileSync} from "node:fs";
import {it,expect,vi} from "vitest";
import { Input } from "mediabunny";
import {normalizeMediaOutputs, MediaOutputError} from "@/server/media-assets/binary-media-output";
import {videoOutputMetadata} from "@/server/media-assets/video-output-metadata";
import {modalOutputMetadata} from "./output-metadata";
it("reads output metadata from bytes rather than request defaults",async()=>{
 const png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
 expect(await modalOutputMetadata([png],"image")).toMatchObject({width:1,height:1});
 const large="data:image/png;base64,"+readFileSync("public/sample-image.png").toString("base64");
 expect((await modalOutputMetadata([png,large],"image")).outputs).toMatchObject([{width:1,height:1},{width:850,height:566}]);
 // Independent ffprobe evidence for this checked-in video: 640x360, 1.000000 seconds.
 const video="data:video/mp4;base64,"+readFileSync("public/sample-video.mp4").toString("base64");
 expect(await modalOutputMetadata([video],"video")).toMatchObject({width:640,height:360,duration_sec:1,outputs:[{width:640,height:360,duration_sec:1}]});
 await expect(modalOutputMetadata([png],"video")).rejects.toThrow();
});

it("inspects validated binary videos once while ignoring unverified provider hints", async () => {
 const buffer=readFileSync("src/server/video-generation/storage/adapters/fixtures/64x48-2s.mp4");
 const ref={buffer,contentType:"video/mp4"};
 const spy=vi.spyOn(Input.prototype,"getPrimaryVideoTrack");
 try {
  const first=await modalOutputMetadata([ref],"video");
  const second=await videoOutputMetadata([ref]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({width:64,height:48,duration_sec:2});
  expect(spy).toHaveBeenCalledTimes(1);
 } finally {spy.mockRestore();}
});
it("preserves metadata exceptions as causes with a dedicated code and phase", async () => {
 const ref={buffer:readFileSync("public/sample-video.mp4"),contentType:"video/mp4"};
 const original=new RangeError("Maximum call stack size exceeded");
 const spy=vi.spyOn(Input.prototype,"getPrimaryVideoTrack").mockRejectedValueOnce(original);
 try {
  await expect(videoOutputMetadata([ref])).rejects.toMatchObject({
   code:"VIDEO_METADATA_FAILED",phase:"result.metadata",cause:original,
  });
 } finally {spy.mockRestore();}
 expect(await videoOutputMetadata([ref])).toMatchObject({width:640,height:360});
});
it("bounds binary outputs and rejects MIME spoofing before inspection", async () => {
 const buffer=readFileSync("public/sample-video.mp4");
 await expect(normalizeMediaOutputs([{buffer,contentType:"video/webm"}],"video")).rejects.toBeInstanceOf(MediaOutputError);
 await expect(normalizeMediaOutputs(Array.from({length:9},()=>({buffer,contentType:"video/mp4"})),"video")).rejects.toMatchObject({code:"GENERATION_VIDEO_OUTPUT_COUNT_LIMIT",phase:"result.decode"});
 const empty={buffer:Buffer.alloc(0),contentType:"video/mp4"};
 await expect(normalizeMediaOutputs([empty],"video")).rejects.toMatchObject({code:"GENERATION_VIDEO_OUTPUT_INVALID"});
});
