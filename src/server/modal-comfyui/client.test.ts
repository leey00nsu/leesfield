// @vitest-environment node
import {afterEach,describe,expect,it,vi} from "vitest";
import {createModalClient,modalConnection,readModalBytes} from "./client";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const setup=()=>{vi.stubEnv("MODAL_COMFY_URL","https://example.modal.run");vi.stubEnv("MODAL_COMFY_API_KEY","private-token");};
describe("Modal authenticated transport",()=>{
 it("allows cold-start upload time while respecting the total deadline",async()=>{
  setup();
  const timeout=vi.spyOn(AbortSignal,"timeout");
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({name:"input.png",media_type:"image"})));
  await createModalClient(900_000).upload("data:image/png;base64,"+png.toString("base64"));
  expect(timeout).toHaveBeenLastCalledWith(120_000);
  await createModalClient(5_000).upload("data:image/png;base64,"+png.toString("base64"));
  expect(timeout.mock.lastCall![0]).toBeLessThanOrEqual(5_000);
 });
 it("rejects arbitrary destinations and credentials in URL",()=>{
  setup();
  for(const value of ["http://example.modal.run","https://example.modal.run.evil.com","https://127.0.0.1","https://user:pass@example.modal.run","https://example.modal.run/path","https://example.modal.run?key=secret"]) {
   vi.stubEnv("MODAL_COMFY_URL",value);expect(()=>modalConnection()).toThrow("CONNECTION_INVALID");
  }
 });
 it("uses same-origin server-built paths, blocks redirects and reads actual image bytes",async()=>{
  setup();const fetch=vi.fn(async()=>new Response(png,{headers:{"content-type":"image/png"}}));vi.stubGlobal("fetch",fetch);
  const c=createModalClient();
  expect((await c.download("job-1",0,"image",1024)).url).toBe("data:image/png;base64,"+png.toString("base64"));
  expect(fetch.mock.calls[0]).toEqual(["https://example.modal.run/api/jobs/job-1/assets/0",expect.objectContaining({redirect:"error",headers:{Authorization:"Bearer private-token"}})]);
  await expect(c.json("/api/jobs/../../health")).rejects.toThrow("PATH_INVALID");
  await expect(c.download("job",0,"video",1024)).rejects.toThrow("OUTPUT_MEDIA");
 });
 it("validates MP4 bytes independently of ComfyUI output collection names",async()=>{
  setup();
  const mp4=Buffer.from("000000186674797069736f6d0000020069736f6d69736f32","hex");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(mp4,{headers:{"content-type":"video/mp4"}})));
  expect((await createModalClient().download("job",0,"video",1024)).url).toMatch(/^data:video\/mp4;base64,/);
  await expect(createModalClient().download("job",0,"image",1024)).rejects.toThrow("MODAL_OUTPUT_MEDIA");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(png,{headers:{"content-type":"video/mp4"}})));
  await expect(createModalClient().download("job",0,"video",1024)).rejects.toThrow("MODAL_OUTPUT_MEDIA");
 });
 it("uploads bytes, validates MIME and returns only validated filenames",async()=>{
  setup();let body:FormData|undefined;
  vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{body=init.body;return Response.json({name:"input-123.png",media_type:"image"});}));
  const c=createModalClient();
  expect(await c.upload("data:image/png;base64,"+png.toString("base64"))).toBe("input-123.png");
  expect(await (body!.get("file") as Blob).arrayBuffer()).toEqual(png.buffer.slice(png.byteOffset,png.byteOffset+png.byteLength));
  await expect(c.upload("data:image/jpeg;base64,"+png.toString("base64"))).rejects.toThrow("IMAGE_INVALID");
 });
 it("limits chunked and declared responses and sanitizes remote errors",async()=>{
  setup();
  await expect(readModalBytes(new Response(png),4)).rejects.toThrow("TOO_LARGE");
  await expect(readModalBytes(new Response(png,{headers:{"content-length":"9999"}}),4)).rejects.toThrow("TOO_LARGE");
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("private-token",{status:401})));
  await expect(createModalClient().json("/api/workflows")).rejects.toThrow("MODAL_HTTP_401");
 });
});
