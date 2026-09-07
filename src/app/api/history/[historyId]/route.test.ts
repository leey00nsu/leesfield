import {beforeEach, afterEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(()=>({session:vi.fn(), find:vi.fn(), remove:vi.fn(),files:vi.fn()}));
vi.mock("@/server/auth/session",()=>({getSession:mocks.session}));
vi.mock("@/server/db/prisma",()=>({prisma:{imageGeneration:{findFirst:mocks.find,deleteMany:mocks.remove},mediaOperation:{findFirst:mocks.find,deleteMany:mocks.remove},videoGeneration:{findFirst:mocks.find,deleteMany:mocks.remove},audioGeneration:{findFirst:mocks.find,deleteMany:mocks.remove}}}));
vi.mock("@/server/history/delete-history-files",()=>({deleteHistoryFiles:mocks.files}));
import {GET, DELETE} from "./route";
const context={params:Promise.resolve({historyId:"request-1"})};
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"owner@example.com"});});
afterEach(()=>vi.unstubAllGlobals());
it("streams the owned original as an attachment and rejects unknown owners",async()=>{
 mocks.find.mockResolvedValue({id:"record-1",images:[{url:"https://storage.example/original.png"}]});
 const fetchMock=vi.fn().mockResolvedValue(new Response("original-bytes",{headers:{"Content-Type":"image/png"}}));vi.stubGlobal("fetch",fetchMock);
 const response=await GET(new Request("http://localhost/api/history/request-1?type=image"),context);
 expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="leesfield-image.png"');expect(await response.text()).toBe("original-bytes");
 expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{requestId:"request-1",ownerEmail:"owner@example.com"}}));
 expect(fetchMock.mock.calls[0][0].href).toBe("https://storage.example/original.png");
 mocks.find.mockResolvedValue(null);expect((await GET(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(404);expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("requires login and filters active jobs from deletion",async()=>{
 mocks.session.mockResolvedValue({isLoggedIn:false});expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(401);expect(mocks.remove).not.toHaveBeenCalled();
 mocks.session.mockResolvedValue({isLoggedIn:true,adminEmail:"owner@example.com"});mocks.find.mockResolvedValue({id:"record-1",images:[]});mocks.remove.mockResolvedValue({count:0});
 expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(409);
 expect(mocks.remove).toHaveBeenCalledWith({where:{id:"record-1",ownerEmail:"owner@example.com",status:{notIn:["pending","processing","uploading"]}}});
 mocks.remove.mockResolvedValue({count:1});expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(204);
});
it("deletes an edit record after deleting its stored files",async()=>{
 mocks.find.mockResolvedValue({id:"operation-1",outputs:[{storageUrl:"https://storage.example/source.webp"}]});mocks.remove.mockResolvedValue({count:1});
 expect((await DELETE(new Request("http://localhost/api/history/operation-1?type=image&origin=edit"),context)).status).toBe(204);
 expect(mocks.find).toHaveBeenCalledWith(expect.objectContaining({where:{id:"request-1",ownerEmail:"owner@example.com"}}));
});

it("keeps history when file deletion fails",async()=>{mocks.find.mockResolvedValue({id:"r",status:"completed",images:[{id:"i",url:"https://storage.example/a"}]});mocks.files.mockRejectedValueOnce(new Error("storage down"));expect((await DELETE(new Request("http://localhost/api/history/request-1?type=image"),context)).status).toBe(502);expect(mocks.remove).not.toHaveBeenCalled();});
