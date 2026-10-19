// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), service: { list:vi.fn(), get:vi.fn(), createUpload:vi.fn(), relayUpload:vi.fn(), confirmUpload:vi.fn() } }));
vi.mock("@/server/auth/api-key-guard", () => ({ requireApiKey: mocks.auth }));
vi.mock("@/server/rate-limit/enforce", () => ({ enforceRateLimit: mocks.rate }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: mocks.service }));
import { POST as create } from "./uploads/route";
import { PUT } from "./uploads/[uploadId]/content/route";
import { POST as confirm } from "./uploads/[uploadId]/confirm/route";
import { GET as list } from "./route";
import { GET as detail } from "./[assetId]/route";
import { MediaUploadNotFoundError } from "@/server/media-assets/media-asset-errors";
const asset = { id:"asset", version:1, type:"image", status:"completed", origin:"upload", mimeType:"image/png", bytes:"5", width:1,height:1,durationMs:null, url:"https://cdn.example/file.png", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), ownerEmail:"hidden" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ownerEmail:"owner@example.com", apiKeyId:"key", permissions:["access:custom","assets:read","assets:upload"] });
  mocks.rate.mockResolvedValue(null); mocks.service.confirmUpload.mockResolvedValue(asset); mocks.service.get.mockResolvedValue(asset);
});
it("completes the upload protocol using only an API key and an external binary URL", async () => {
  mocks.service.createUpload.mockResolvedValue({ id:"upload", intendedType:"image", status:"pending", expiresAt:new Date().toISOString(), upload:{method:"PUT",url:"/api/media-assets/uploads/upload/content?target=signed",headers:{"Content-Type":"image/png"}} });
  const response = await create(new Request("http://localhost/api/external/assets/uploads", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({intendedType:"image",fileName:"x.png",declaredMimeType:"image/png",declaredBytes:5}) }));
  expect(response.status).toBe(201);
  const { upload } = await response.json();
  expect(upload.upload.url).toBe("/api/external/assets/uploads/upload/content?target=signed");
  const ctx = { params:Promise.resolve({uploadId:"upload"}) };
  const put = await PUT(new Request("http://localhost"+upload.upload.url,{method:"PUT",body:"bytes",headers:{"Content-Type":"image/png","Content-Length":"5"}}),ctx);
  expect(put.status).toBe(200);
  expect(mocks.service.relayUpload.mock.calls[0].slice(0,3)).toEqual(["owner@example.com","upload","signed"]);
  const completed = await confirm(new Request("http://localhost/api/external/assets/uploads/upload/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}),ctx);
  expect(completed.status).toBe(200); expect(JSON.stringify(await completed.json())).not.toContain("hidden");
});
it("rejects internal completion/provenance inputs and cross-owner uploads", async () => {
  const invalid = await create(new Request("http://localhost/api/external/assets/uploads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({intendedType:"image",fileName:"x.png",declaredMimeType:"image/png",declaredBytes:5,operationId:"forged"})}));
  expect(invalid.status).toBe(400); expect(mocks.service.createUpload).not.toHaveBeenCalled();
  mocks.service.relayUpload.mockRejectedValue(new MediaUploadNotFoundError());
  expect((await PUT(new Request("http://localhost/api/external/assets/uploads/other/content?target=x",{method:"PUT",body:"bytes"}),{params:Promise.resolve({uploadId:"other"})})).status).toBe(404);
});
it("bounds asset listing and omits internal fields from details", async () => {
  expect((await list(new Request("http://localhost/api/external/assets?limit=51"))).status).toBe(400);
  const response = await detail(new Request("http://localhost/api/external/assets/asset"), {params:Promise.resolve({assetId:"asset"})});
  expect(await response.json()).toEqual({asset:expect.not.objectContaining({ownerEmail:expect.anything()})});
});
