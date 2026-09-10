// @vitest-environment node
import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({session:vi.fn(),json:vi.fn()}));
vi.mock("@/server/auth/session",()=>({getSession:mocks.session}));
vi.mock("@/server/modal-comfyui/client",async importOriginal=>{
 const original=await importOriginal<typeof import("@/server/modal-comfyui/client")>();
 return {...original,createModalClient:()=>({json:mocks.json})};
});
import {GET,POST} from "./route";
import workflows from "@/server/modal-comfyui/fixtures/workflows.json";
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"admin@example.com"});});
describe("Modal admin import",()=>{
 it("lists only supported image/video IDs without connection secrets",async()=>{
  mocks.json.mockResolvedValue({workflows});
  const response=await GET();const body=await response.json();
  expect(body.items).toHaveLength(5);
  expect(body.items.every((i:{supported:boolean})=>i.supported)).toBe(true);
  expect(JSON.stringify(body)).not.toContain("providerConfig");
 });
 it("requires admin and rejects audio by the discovered contract",async()=>{
  mocks.session.mockResolvedValue({isLoggedIn:false});
  expect((await GET()).status).toBe(401);expect(mocks.json).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"admin"});
  mocks.json.mockResolvedValue(workflows.find(w=>w.category==="audio"));
  expect((await POST(new Request("https://local",{method:"POST",body:JSON.stringify({workflowId:"supertonic-tts"})}))).status).toBe(400);
  expect(mocks.json).toHaveBeenCalledWith("/api/workflows/supertonic-tts");
 });
 it("returns selected inactive draft and diagnoses bad contract",async()=>{
  mocks.json.mockResolvedValue(workflows[0]);
  const response=await POST(new Request("https://local",{method:"POST",body:JSON.stringify({workflowId:"krea2-t2i"})}));
  expect((await response.json()).draft).toMatchObject({provider:"modal_comfyui",isActive:false,type:"image"});
  mocks.json.mockResolvedValue({...workflows[0],category:"audio"});
  expect((await POST(new Request("https://local",{method:"POST",body:JSON.stringify({workflowId:"krea2-t2i"})}))).status).toBe(400);
 });
});
