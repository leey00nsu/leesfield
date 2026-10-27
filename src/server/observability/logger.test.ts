// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";
import { failureLogContext, loggedOperation, serverLogger, withLogContext } from "./logger";
import { withRequestObservability, logSafeError } from "./request-observability";
afterEach(()=>vi.restoreAllMocks());

describe("server log context",()=>{
  it("isolates concurrent and nested request/job contexts and restores the parent",async()=>{
    const sink=vi.spyOn(console,"log").mockImplementation(()=>undefined);
    await Promise.all(["a","b"].map(requestId=>withLogContext({requestId},async()=>{
      await Promise.resolve();
      await withLogContext({jobId:"job-"+requestId},async()=>{
        await Promise.resolve(); serverLogger.info("nested");
      });
      serverLogger.info("parent");
    })));
    serverLogger.info("outside");
    const lines=sink.mock.calls.map(([line])=>JSON.parse(String(line)));
    expect(lines.filter(line=>line.event==="nested")).toEqual(expect.arrayContaining([
      expect.objectContaining({requestId:"a",jobId:"job-a"}),
      expect.objectContaining({requestId:"b",jobId:"job-b"}),
    ]));
    expect(lines.filter(line=>line.event==="parent").every(line=>!line.jobId)).toBe(true);
    expect(lines.at(-1)).not.toHaveProperty("requestId");
  });
  it("logs the original rejection with inherited request context and preserves identity",async()=>{
    const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    const error=new TypeError("fetch failed");
    await expect(withLogContext({requestId:"req",modelKey:"model"},()=>loggedOperation(
      {jobId:"job",provider:"leemage",phase:"storage.confirm"},async()=>{throw error;},
    ))).rejects.toBe(error);
    expect(JSON.parse(String(sink.mock.calls[0][0]))).toMatchObject({
      requestId:"req",jobId:"job",modelKey:"model",provider:"leemage",phase:"storage.confirm",
      error:{type:"TypeError",message:"fetch failed"},
    });
  });
  it("propagates HTTP context into handled errors before the response is returned",async()=>{
    const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    vi.spyOn(console,"log").mockImplementation(()=>undefined);
    const handler=withRequestObservability("/api/test",async(request:Request)=>{
      expect(request.method).toBe("POST");
      logSafeError("request.handled",new Error("FAILED"));
      return new Response(null,{status:500});
    });
    const result=await handler(new Request("https://local/api/test",{method:"POST",headers:{"x-request-id":"request-1"}}));
    expect(result.headers.get("x-request-id")).toBe("request-1");
    expect(JSON.parse(String(sink.mock.calls[0][0]))).toMatchObject({requestId:"request-1",route:"/api/test",method:"POST"});
  });
  it("records framework render errors using a route template without URL or headers",async()=>{
    const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    await onRequestError(new Error("private-prompt"),{
      path:"/spaces/private-id?token=private-key",method:"GET",
      headers:{"x-request-id":"req-render",authorization:"Bearer private-key",cookie:"private-cookie"},
    },{routerKind:"App Router",routePath:"/spaces/[spaceId]",routeType:"render",revalidateReason:undefined});
    const line=String(sink.mock.calls[0]?.[0]);
    expect(JSON.parse(line)).toMatchObject({event:"server.request.failed",requestId:"req-render",route:"/spaces/[spaceId]",operation:"render",phase:"request.framework"});
    expect(line).not.toMatch(/private-id|private-key|private-cookie|private-prompt/);
  });
});

it("keeps the deepest failure phase without leaking IDs when an error object is reused", async () => {
 const sink=vi.spyOn(console,"error").mockImplementation(()=>undefined);
 const error=new Error("LEEMAGE_CONFIRM_INVALID");
 for (const requestId of ["first","second"]) {
  await expect(withLogContext({requestId,jobId:"job-"+requestId},()=>loggedOperation(
   {phase:"storage.upload"},()=>loggedOperation({phase:"storage.confirm"},async()=>{throw error;}),
  ))).rejects.toBe(error);
 }
 const lines=sink.mock.calls.map(call=>JSON.parse(String(call[0])));
 expect(lines.filter(line=>line.requestId==="first")).toHaveLength(2);
 expect(lines.filter(line=>line.requestId==="second")).toHaveLength(2);
 expect(lines.every(line=>line.phase==="storage.confirm")).toBe(true);
 expect(failureLogContext(error)).not.toHaveProperty("requestId");
 expect(failureLogContext(error)).not.toHaveProperty("jobId");
});
