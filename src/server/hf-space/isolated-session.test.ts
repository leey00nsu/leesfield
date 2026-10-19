// @vitest-environment node
import {afterEach,describe,expect,it,vi} from "vitest";
import {withGradioSession} from "./isolated-session";
const connect=vi.hoisted(()=>vi.fn());
vi.mock("@gradio/client",()=>({Client:{connect}}));
const config={spaceUrl:"https://example.hf.space",timeoutMs:100};
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers();});
describe("Gradio execution sessions",()=>{
 it("keeps the cached client for stateless models",async()=>{
  const cached={app_reference:"owner/model"};const run=vi.fn(async client=>client);
  expect(await withGradioSession(cached,false,config,run)).toBe(cached);
  expect(connect).not.toHaveBeenCalled();
 });
 it("isolates concurrent stateful executions, preserving authentication and closing both",async()=>{
  const first={close:vi.fn()},second={close:vi.fn()};
  connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const run=vi.fn(async client=>client);
  const cached={app_reference:"owner/model",options:{token:"hf_example" as const}};
  const results=await Promise.all([withGradioSession(cached,true,config,run),withGradioSession(cached,true,config,run)]);
  expect(results).toEqual([first,second]);
  expect(connect).toHaveBeenCalledWith("owner/model",{token:"hf_example",with_null_state:false});
  expect(first.close).toHaveBeenCalledOnce();expect(second.close).toHaveBeenCalledOnce();
 });
 it("detects State in existing client metadata and closes after failures",async()=>{
  const session={close:vi.fn()};connect.mockResolvedValue(session);
  await expect(withGradioSession({config:{components:[{type:"state"}]}},false,config,async()=>{throw Error("prediction failed");})).rejects.toThrow("prediction failed");
  expect(session.close).toHaveBeenCalledOnce();
 });
 it("closes connections that arrive after the connection deadline without running",async()=>{
  vi.useFakeTimers();
  let finish!:(value:{close:()=>void})=>void;
  connect.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const run=vi.fn();const pending=withGradioSession({},true,config,run);
  const rejected=expect(pending).rejects.toThrow("HF_SPACE_CONNECT_TIMEOUT");
  await vi.advanceTimersByTimeAsync(101);await rejected;
  const close=vi.fn();finish({close});await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();expect(run).not.toHaveBeenCalled();
 });
});
