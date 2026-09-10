// @vitest-environment node
import {readFileSync} from "node:fs";
import {it,expect} from "vitest";
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
