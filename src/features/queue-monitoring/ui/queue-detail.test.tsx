import {appToast} from "@/shared/ui/app-toast";
import { createRef, useRef, useState } from "react";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import type { ConsoleAttempt } from "@/shared/api/job-queue-console-contract";
import { QueueDetail } from "./queue-detail";
import { fixtureCapabilities, fixtureDetail, fixtureFailure, fixtureId, fixtureTime } from "../model/queue-console-fixtures";
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it("uses shared background dismissal while protecting the job summary content",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(fixtureDetail())));
  function Harness(){const [open,setOpen]=useState(true);return <QueueDetail jobId={open?fixtureId(1):null} entryId={null} onClose={()=>setOpen(false)} returnFocus={createRef()}/>;}
  renderWithIntl(<Harness/>);const title=await screen.findByText("Example job 1");fireEvent.click(title);expect(screen.getByRole("dialog",{name:"작업 상세"})).toBeInTheDocument();
  fireEvent.click(title.closest('[data-app-media-detail-backdrop]')!);await waitFor(()=>expect(screen.queryByRole("dialog",{name:"작업 상세"})).not.toBeInTheDocument());
});
it("accumulates retained attempts on scroll and preserves the active tab, loaded history and scroll on refresh",async()=>{
  const detail={...fixtureDetail(),counts:{attempts:105,deadLetters:0,actions:0}};
  const attempt=(n:number):ConsoleAttempt=>({id:fixtureId(100+n),jobId:fixtureId(1),lifetimeOrdinal:n,cycle:1,cycleOrdinal:n,executionType:"image_generation",executionId:`attempt-execution-${n}`,
    workerInstanceId:fixtureId(700),phase:"ended",outcome:"failed",startedAt:fixtureTime,finishedAt:fixtureTime,heartbeatAt:fixtureTime,leaseUntil:fixtureTime,imported:false,reservations:[]});
  const urls:URL[]=[];vi.stubGlobal("fetch",vi.fn(async(input:string)=>{const url=new URL(input,"http://localhost");urls.push(url);
    return Response.json(url.pathname.endsWith("attempts")?{sampledAt:fixtureTime,items:[attempt(url.searchParams.has("cursor")?85:105)],nextCursor:url.searchParams.has("cursor")?null:"next-page"}:detail);}));
  const observers:Array<IntersectionObserverCallback>=[];vi.stubGlobal("IntersectionObserver",class { constructor(callback:IntersectionObserverCallback){observers.push(callback);} observe(){} disconnect(){} });
  const user=userEvent.setup();renderWithIntl(<QueueDetail jobId={fixtureId(1)} entryId={null} onClose={()=>{}} returnFocus={createRef()}/>);
  await screen.findByText("Example job 1");expect(screen.getByText("상세 정보").closest("details")).toHaveAttribute("open");await user.click(screen.getByRole("tab",{name:"실행 시도 (105)"}));
  expect(await screen.findByText("누적 시도 105 · 처리 주기 1")).toBeInTheDocument();await waitFor(()=>expect(observers.length).toBeGreaterThan(0));await act(async()=>{observers.at(-1)!([{isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver);});
  expect(await screen.findByText("누적 시도 85 · 처리 주기 1")).toBeInTheDocument();
  expect(screen.getByText("누적 시도 105 · 처리 주기 1")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"다음 페이지"})).not.toBeInTheDocument();
  expect(screen.getByTestId("queue-job-detail-rail")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"저장"})).not.toBeInTheDocument();
  const pane=screen.getByRole("dialog"),scrollPane=screen.getByRole("tabpanel",{name:"실행 시도 (105)"});scrollPane.scrollTop=173;await user.click(within(pane).getByRole("button",{name:"새로고침"}));
  await waitFor(()=>expect(urls.filter(u=>u.searchParams.get("cursor")==="next-page").length).toBeGreaterThanOrEqual(2));
  expect(screen.getByRole("tab",{name:"실행 시도 (105)"})).toHaveAttribute("aria-selected","true");expect(screen.getByText("누적 시도 85 · 처리 주기 1")).toBeInTheDocument();expect(scrollPane.scrollTop).toBe(173);
});

it("loads into the shared rail, closes only the nested confirmation on Escape, then restores list focus",async()=>{
  const detail={...fixtureDetail(),counts:{attempts:1,deadLetters:1,actions:0},currentDeadLetter:fixtureFailure};
  const fetch=vi.fn(async(input:string)=>Response.json(input.endsWith("capabilities")?fixtureCapabilities:detail));vi.stubGlobal("fetch",fetch);
  function Harness(){const [open,setOpen]=useState(false),focus=useRef<HTMLButtonElement|null>(null);return <><button ref={focus} onClick={()=>setOpen(true)}>작업 열기</button><QueueDetail jobId={open?fixtureId(1):null} entryId={null} onClose={()=>setOpen(false)} returnFocus={focus}/></>;}
  const user=userEvent.setup();renderWithIntl(<Harness/>);const trigger=screen.getByRole("button",{name:"작업 열기"});await user.click(trigger);await screen.findByText("Example job 1");
  expect(screen.getByRole("tab",{name:"실패 이력 (1)"})).toBeInTheDocument();
  const actions=await screen.findByRole("region",{name:"가능한 관리자 조치"});expect(within(actions).queryByRole("button",{name:"새로고침"})).not.toBeInTheDocument();expect(within(actions).queryByText(/현재 확인 가능한 조건/)).not.toBeInTheDocument();
  await user.click(await screen.findByRole("button",{name:"작업 포기"}));expect(screen.getByRole("dialog",{name:"작업 포기"})).toBeInTheDocument();
  await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog",{name:"작업 포기"})).not.toBeInTheDocument());expect(screen.getByRole("dialog",{name:"작업 상세"})).toBeInTheDocument();
  await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(trigger).toHaveFocus();
  expect(fetch.mock.calls.every(([url])=>url.startsWith("/api/internal/job-queue/"))).toBe(true);
});

it("shows an initial authorization error without leaving a loading message in the shared detail",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({message:"UNAUTHORIZED"},{status:401})));
  renderWithIntl(<QueueDetail jobId={fixtureId(1)} entryId={null} onClose={()=>{}} returnFocus={createRef()}/>);
  expect(await screen.findByText("설정된 관리자 계정으로 다시 로그인해 주세요.")).toBeInTheDocument();
  expect(screen.queryByText("불러오는 중…")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"닫기"})).toBeEnabled();
});

it("shows the current redrive request result in General with inputs, output media and warnings",async()=>{
  const detail={...fixtureDetail(),kind:"generate_image",cycle:2,requestId:"current-request",sourceRequestId:"original-request"};
  const urls:string[]=[];vi.stubGlobal("fetch",vi.fn(async(input:string)=>{urls.push(input);return Response.json(input.startsWith("/api/monitoring/")?{id:"current-request",type:"image",status:"completed",model:"Example image model",prompt:"Current redrive prompt",createdAt:fixtureTime,finishedAt:fixtureTime,updatedAt:fixtureTime,durationMs:1200,progress:100,errorMessage:null,warningMessage:"Output warning",inputImages:["/sample-image.png"],inputAudios:[],referenceText:"Reference text",assets:[{url:"/sample-image.png",width:640,height:480,durationSec:null}]}:detail);}));
  renderWithIntl(<QueueDetail jobId={fixtureId(1)} entryId={null} onClose={()=>{}} returnFocus={createRef()}/>);
  expect(await screen.findByText("Current redrive prompt")).toBeInTheDocument();expect(screen.getByText("Output warning")).toBeInTheDocument();expect(screen.getByText("640x480")).toBeInTheDocument();
  expect(within(screen.getByRole("region",{name:"결과 요약"})).getByAltText("결과 요약")).toBeInTheDocument();
  expect(urls.filter(url=>url.startsWith("/api/monitoring/")).length).toBe(1);
  expect(screen.getByAltText("input-1")).toBeInTheDocument();expect(screen.getByAltText("result-1")).toBeInTheDocument();
  expect(urls.filter(url=>url.startsWith("/api/monitoring/")).every(url=>new URL(url,"http://localhost").searchParams.get("requestId")==="current-request")).toBe(true);
  expect(screen.getByText("original-request")).toBeInTheDocument();
});
it.each(["suspended", "cancelled"])("distinguishes cleanup protection/released reservation from deletion: %s",async(status)=>{
  const detail={...fixtureDetail(),kind:"storage_cleanup",status,sourceStatus:"linked",cleanup:{reason:"generation_input",status:"linked",storageProvider:"example-storage",storageObjectId:"files/campaign.png",assetId:"asset-1",fileName:"campaign.png",mediaType:"image",mimeType:"image/png",bytes:"1234",assetStatus:"completed",attempts:0,retryAt:fixtureTime,lastError:null,protection:"linked",usage:{graphs:1,operations:0,generations:2,assistants:0,projectCovers:0}}};
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(detail)));
  renderWithIntl(<QueueDetail jobId={fixtureId(1)} entryId={null} onClose={()=>{}} returnFocus={createRef()}/>);
  expect(await screen.findByText("campaign.png")).toBeInTheDocument();expect(screen.getByText("files/campaign.png")).toBeInTheDocument();expect(screen.getByText("생성 입력 파일")).toBeInTheDocument();
  expect(screen.getAllByText(status==="cancelled"?"정리 예약 해제":"파일 보호 중")).toHaveLength(2);
  if(status==="cancelled") expect(screen.queryByText("파일 보호 중")).not.toBeInTheDocument();
  expect(screen.getByRole("region",{name:"정리 정보"})).toHaveTextContent("사용처");expect(screen.queryByText(/실제 삭제 대기 아님/)).not.toBeInTheDocument();
});
it("keeps loaded history when the next chunk fails and retries that same cursor",async()=>{
  const detail={...fixtureDetail(),counts:{attempts:0,deadLetters:2,actions:0}};let tries=0;
  vi.stubGlobal("fetch",vi.fn(async(input:string)=>{const u=new URL(input,"http://localhost");if(!u.pathname.endsWith("dead-letters"))return Response.json(detail);if(u.searchParams.has("cursor")&&++tries===1)return Response.json({message:"UNAVAILABLE"},{status:503});return Response.json({sampledAt:fixtureTime,items:[{...fixtureFailure,id:fixtureId(u.searchParams.has("cursor")?502:501),safeErrorCode:u.searchParams.has("cursor")?"SECOND_FAILURE":"FIRST_FAILURE"}],nextCursor:u.searchParams.has("cursor")?null:"retry-cursor"});}));
  const user=userEvent.setup();renderWithIntl(<QueueDetail jobId={fixtureId(1)} entryId={null} onClose={()=>{}} returnFocus={createRef()}/>);await screen.findByText("Example job 1");
  await user.click(screen.getByRole("tab",{name:"실패 이력 (2)"}));await screen.findByText("(FIRST_FAILURE)");await user.click(screen.getByRole("button",{name:"내역 더 불러오기"}));
  await screen.findByRole("alert");expect(screen.getByText("(FIRST_FAILURE)")).toBeInTheDocument();await user.click(within(screen.getByRole("alert")).getByRole("button",{name:"새로고침"}));
  expect(await screen.findByText("(SECOND_FAILURE)")).toBeInTheDocument();expect(screen.getByText("(FIRST_FAILURE)")).toBeInTheDocument();expect(tries).toBe(2);
});

it("puts the sample time opposite Close and reports icon-copy through the shared toast",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json(fixtureDetail())));const user=userEvent.setup();
  const write=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:write}});
  const copied=vi.spyOn(appToast,"copied"),failed=vi.spyOn(appToast,"error");
  renderWithIntl(<QueueDetail jobId={fixtureId(1)} entryId={null} onClose={()=>{}} returnFocus={createRef()}/>);await screen.findByText("Example job 1");
  const header=screen.getByRole("button",{name:"닫기"}).parentElement!;expect(within(header).getByText(/조회 시각/)).toBeInTheDocument();
  const button=screen.getByRole("button",{name:"작업 ID 복사"});expect(button).not.toHaveTextContent("복사");await user.click(button);
  await waitFor(()=>expect(copied).toHaveBeenCalled());expect(write).toHaveBeenCalledWith(fixtureId(1));
  write.mockRejectedValue(Error("blocked"));await user.click(button);await waitFor(()=>expect(failed).toHaveBeenCalled());
});
