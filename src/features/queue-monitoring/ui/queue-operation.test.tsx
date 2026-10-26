import { act, cleanup, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { useQueueOperation } from "../hook/use-queue-operation";
import { QueueActions } from "./queue-actions";
import { fixtureCapabilities, fixtureFailure, fixtureId } from "../model/queue-console-fixtures";
import type { ConsoleOperationBody } from "../api/queue-console-api";
beforeEach(()=>{sessionStorage.clear();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear();});
const command={expectedVersion:7,reason:"CAUSE_FIXED"};
describe("queue operation request identity",()=>{
  it("reuses the exact body after a lost response and a remount, even if the viewed version changed",async()=>{
    const bodies:ConsoleOperationBody[]=[];const fetch=vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));bodies.push(body);
      if(bodies.length===1)throw new TypeError("network lost");return Response.json({requestId:body.requestId,outcome:"succeeded"});});vi.stubGlobal("fetch",fetch);
    const refresh=vi.fn(async()=>{}),first=renderHook(()=>useQueueOperation(fixtureFailure.id,refresh));
    await act(async()=>{await first.result.current.run("redrive",command);});expect(first.result.current.pending?.body).toMatchObject(command);first.unmount();
    const second=renderHook(()=>useQueueOperation(fixtureFailure.id,refresh));
    await act(async()=>{await second.result.current.run("redrive",{expectedVersion:8,reason:"RETRY_APPROVED"});});
    expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);expect(second.result.current.result?.outcome).toBe("succeeded");expect(second.result.current.pending).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it("sends only one command for overlapping clicks",async()=>{
    let finish!:(response:Response)=>void;let sent:ConsoleOperationBody|undefined;
    const fetch=vi.fn((_url:string,init:RequestInit)=>{sent=JSON.parse(String(init.body));return new Promise<Response>(resolve=>{finish=resolve;});});vi.stubGlobal("fetch",fetch);
    const {result}=renderHook(()=>useQueueOperation(fixtureFailure.id,async()=>{}));let running!:Promise<void>;
    act(()=>{running=result.current.run("abandon",command);void result.current.run("abandon",command);});expect(fetch).toHaveBeenCalledTimes(1);
    await act(async()=>{finish(Response.json({requestId:sent!.requestId,outcome:"succeeded"}));await running;});expect(result.current.busy).toBe(false);
  });
  it("requires a new review after 409 and assigns a fresh request only to the explicit new action",async()=>{
    const bodies:ConsoleOperationBody[]=[];vi.stubGlobal("fetch",vi.fn(async(_url:string,init:RequestInit)=>{const body=JSON.parse(String(init.body));bodies.push(body);
      return bodies.length===1?Response.json({message:"QUEUE_VERSION_CONFLICT"},{status:409}):Response.json({requestId:body.requestId,outcome:"succeeded"});}));
    const refresh=vi.fn(async()=>{}),{result}=renderHook(()=>useQueueOperation(fixtureFailure.id,refresh));
    await act(async()=>{await result.current.run("redrive",command);});expect(result.current.reviewRequired).toBe(true);expect(result.current.pending).toBeNull();expect(refresh).toHaveBeenCalledTimes(1);
    await act(async()=>{await result.current.run("redrive",command);});expect(bodies).toHaveLength(1);
    act(()=>result.current.beginReview());await act(async()=>{await result.current.run("redrive",{...command,expectedVersion:8});});
    expect(bodies[1].requestId).not.toBe(bodies[0].requestId);expect(bodies[1].expectedVersion).toBe(8);
  });
});
describe("administrator action outcomes",()=>{
  it("disables unsupported verification and distinguishes a 200 failed result from success",async()=>{
    const cap={...fixtureCapabilities,reconcile:{status:"requires_validation",reasons:["QUEUE_FINAL_VALIDATION_REQUIRED"],evidenceRef:"modal:example"}};
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="POST"?Response.json({requestId:JSON.parse(String(init.body)).requestId,outcome:"failed",result:{code:"QUEUE_REMOTE_STILL_UNCONFIRMED"}}):Response.json(cap)));
    const user=userEvent.setup(),refresh=vi.fn(async()=>{});renderWithIntl(<QueueActions entryId={fixtureFailure.id} jobId={fixtureId(1)} refresh={refresh}/>);
    await user.click(await screen.findByRole("button",{name:"외부 결과 확인"}));
    const dialog=screen.getByRole("dialog");await user.click(within(dialog).getByRole("button",{name:"확인하고 실행"}));
    expect(await screen.findByText("외부 결과를 확정하지 못했습니다. 불확실한 예약을 유지합니다.")).toBeInTheDocument();
    expect(screen.queryByText("외부 종료를 확인해 반영했습니다. 결과 수집이 필요하면 재처리를 검토해 주세요.")).not.toBeInTheDocument();expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("shows unsupported reasons without an editable evidence URL or request ID",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json(fixtureCapabilities)));renderWithIntl(<QueueActions entryId={fixtureFailure.id} jobId={fixtureId(1)} refresh={async()=>{}}/>);
    expect(await screen.findByRole("button",{name:"외부 결과 확인"})).toBeDisabled();
    expect(screen.getByText(/저장된 Modal 이미지·영상 결과 확인을 지원하지 않습니다/)).toBeInTheDocument();expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("keeps a rate-limited command available for the same-request retry and displays Retry-After",async()=>{
    vi.stubGlobal("fetch",vi.fn(async(_url:string,init?:RequestInit)=>init?.method==="POST"?Response.json({message:"QUEUE_RATE_LIMITED"},{status:429,headers:{"Retry-After":"17"}}):Response.json(fixtureCapabilities)));
    const user=userEvent.setup();renderWithIntl(<QueueActions entryId={fixtureFailure.id} jobId={fixtureId(1)} refresh={async()=>{}}/>);
    await user.click(await screen.findByRole("button",{name:"재처리 접수"}));await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"확인하고 실행"}));
    expect(await screen.findByText("요청이 많습니다. 17초 후 다시 시도해 주세요.")).toBeInTheDocument();
    await waitFor(()=>expect(within(screen.getByRole("dialog")).getByRole("button",{name:"같은 요청으로 다시 확인"})).toBeEnabled());
  });
});
