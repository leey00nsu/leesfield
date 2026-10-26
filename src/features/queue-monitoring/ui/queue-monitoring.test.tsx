import { consoleInterval, cycleAdmission, cycleStart, waitingUntil } from "./queue-times";
import {useState} from "react";
import {AppDateTimePicker} from "@/shared/ui/app-calendar";
import {QueueOverview} from "./queue-overview";
import { act, cleanup, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl, createIntlWrapper } from "@/test-utils/intl";
import { MonitoringDashboardScreen } from "@/screens/monitoring-dashboard/ui/monitoring-dashboard-screen";
import { useQueueConsole } from "../hook/use-queue-console";
import { fixtureDetail, fixtureFailure, fixtureJobs, fixtureOverview } from "../model/queue-console-fixtures";
import { QueueConsoleHttpError } from "../api/queue-console-api";
import { focusManager } from "@tanstack/react-query";

const stats=vi.hoisted(()=>vi.fn());
vi.mock("@/screens/monitoring-dashboard/ui/monitoring-request-statistics",()=>({MonitoringRequestStatistics:()=>{stats();return <div>Legacy statistics fixture</div>;}}));
beforeEach(()=>{window.history.replaceState(null,"","/");vi.clearAllMocks();});
afterEach(()=>{cleanup();focusManager.setFocused(undefined);vi.unstubAllGlobals();vi.useRealTimers();});
function setupFetch(){const urls:URL[]=[];const fetch=vi.fn(async(input:string)=>{const url=new URL(input,"http://localhost");urls.push(url);
  return Response.json(url.pathname.endsWith("overview")?fixtureOverview:/\/jobs\/[^/]+$/.test(url.pathname)?fixtureDetail(url.pathname.split('/').at(-1)):{sampledAt:fixtureOverview.sampledAt,items:url.pathname.endsWith("failed-jobs")?[]:fixtureJobs,nextCursor:null});});vi.stubGlobal("fetch",fetch);return{urls,fetch};}
describe("queue monitoring interactions",()=>{
  it("opens current jobs with five sidebar destinations and mounts only the selected console",async()=>{
    const {urls}=setupFetch(),user=userEvent.setup();renderWithIntl(<MonitoringDashboardScreen/>);
    expect(await screen.findByText("Example job 1")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation",{name:"모니터링 탐색",hidden:true})).getAllByRole("button",{hidden:true}).map(item=>item.textContent)).toEqual(["현재 작업","이력 조회","서비스 대기열","재처리 대기열","요청 통계"]);
    expect(screen.getByRole("button",{name:"현재 작업"})).toHaveAttribute("aria-current","page");
    expect(screen.queryByRole("heading",{name:"현재 작업"})).not.toBeInTheDocument();
    expect(urls.every(u=>u.pathname.endsWith("jobs")&&u.searchParams.get("view")==="current"&&!u.searchParams.has("from"))).toBe(true);
    await user.click(screen.getByRole("button",{name:"서비스 대기열"}));expect(await screen.findByText("병렬 실행 현황")).toBeInTheDocument();expect(screen.queryByRole("region",{name:"작업 목록"})).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"미해결 작업"})).not.toBeInTheDocument();
    expect(stats).not.toHaveBeenCalled();expect(urls.every(u=>u.pathname.startsWith("/api/internal/job-queue/"))).toBe(true);
    await user.click(screen.getByRole("button",{name:"요청 통계"}));expect(await screen.findByText("Legacy statistics fixture")).toBeInTheDocument();
    expect(screen.queryByText("병렬 실행 현황")).not.toBeInTheDocument();expect(stats).toHaveBeenCalled();
    expect(window.location.search).toContain("qm_tab=statistics");
  });
  it("closes the mobile navigation after selection and restores menu focus on Escape",async()=>{
    setupFetch();const user=userEvent.setup();renderWithIntl(<MonitoringDashboardScreen/>);await screen.findByText("Example job 1");
    const menu=screen.getByRole("button",{name:"모니터링 메뉴"});expect(menu).toHaveAttribute("aria-expanded","false");
    await user.click(menu);expect(menu).toHaveAttribute("aria-expanded","true");await user.click(screen.getByRole("button",{name:"이력 조회"}));
    expect(menu).toHaveAttribute("aria-expanded","false");expect(menu).toHaveFocus();expect(window.location.search).toContain("qm_tab=history");
    await user.click(menu);screen.getByRole("button",{name:"현재 작업"}).focus();await user.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded","false");expect(menu).toHaveFocus();expect(screen.getByRole("button",{name:"이력 조회"})).toHaveAttribute("aria-current","page");
  });
  it("restores legacy history and removes its date range when returning to current jobs",async()=>{
    window.history.replaceState(null,"","/?qm_tab=service&qm_view=history&qm_from=2026-10-24T00%3A00%3A00.000Z&qm_to=2026-10-25T00%3A00%3A00.000Z");
    const {urls}=setupFetch(),user=userEvent.setup();renderWithIntl(<MonitoringDashboardScreen/>);await screen.findByText("Example job 1");
    expect(screen.getByRole("button",{name:"이력 조회"})).toHaveAttribute("aria-current","page");expect(urls[0].searchParams.get("view")).toBe("history");
    await user.click(screen.getByRole("button",{name:"현재 작업"}));await waitFor(()=>expect(urls.at(-1)?.searchParams.get("view")).toBe("current"));
    expect(urls.at(-1)?.searchParams.has("from")).toBe(false);expect(window.location.search).not.toMatch(/qm_(view|from|to)=/);
  });
  it("keeps the status pill while omitting the paused reason below the row",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({sampledAt:fixtureOverview.sampledAt,items:[{...fixtureJobs[0],status:"retry_wait",primaryReason:"QUEUE_PAUSED",reasons:["QUEUE_PAUSED"]}],nextCursor:null})));
    renderWithIntl(<MonitoringDashboardScreen/>);await screen.findByText("Example job 1");expect(screen.getByText("자동 재시도 대기")).toBeInTheDocument();expect(screen.queryByText("큐 일시중지")).not.toBeInTheDocument();
  });
  it("keeps selection by ID, resets the cursor for a new filter and never shows another filter's placeholder rows",async()=>{
    const user=userEvent.setup(),{fetch,urls}=setupFetch();renderWithIntl(<MonitoringDashboardScreen/>);await screen.findByText("Example job 1");
    await user.click(screen.getByRole("button",{name:/Example job 1/}));expect(window.location.search).toContain("qm_job="+fixtureJobs[0].id);
    expect(screen.getByText("작업을 선택하여 목록 자동 갱신을 멈췄습니다.")).toBeInTheDocument();
    fetch.mockImplementation(async input=>{const url=new URL(input,"http://localhost");urls.push(url);if(url.pathname.endsWith("overview"))return Response.json(fixtureOverview);return new Promise<Response>(()=>{});});
    await act(async()=>{const url=new URL(window.location.href);url.searchParams.set("qm_kind","generate_audio");window.history.replaceState(null,"",url);window.dispatchEvent(new PopStateEvent("popstate"));});
    await waitFor(()=>expect(urls.some(u=>u.searchParams.get("kind")==="generate_audio")).toBe(true));
    expect(within(screen.getByRole("region",{name:"작업 목록",hidden:true})).queryByText("Example job 1")).not.toBeInTheDocument();expect(window.location.search).toContain("qm_job="+fixtureJobs[0].id);
    expect(urls.at(-1)?.searchParams.has("cursor")).toBe(false);
  });
  it("distinguishes an initial authorization failure from an empty list",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({message:"UNAUTHORIZED"},{status:401})));renderWithIntl(<MonitoringDashboardScreen/>);
    expect((await screen.findAllByText("설정된 관리자 계정으로 다시 로그인해 주세요.")).length).toBeGreaterThan(0);
    expect(screen.queryByText("조회된 작업이 없습니다")).not.toBeInTheDocument();
  });
});
describe("shared management controls",()=>{
  it("applies search while typing without losing focus and clears through the common input action",async()=>{
    const {urls}=setupFetch(),user=userEvent.setup();renderWithIntl(<MonitoringDashboardScreen/>);await screen.findByText("Example job 1");
    await user.click(screen.getByRole("button",{name:"검색"}));const input=await screen.findByLabelText("작업 검색");
    await user.type(input,"execution 18");expect(input).toHaveFocus();expect(input).toHaveValue("execution 18");
    await waitFor(()=>expect(urls.some(url=>url.searchParams.get("q")==="execution 18")).toBe(true));
    expect(screen.queryByRole("button",{name:"적용"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:/검색: execution-18/})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"입력 지우기"}));expect(input).toHaveValue("");expect(input).toHaveFocus();expect(window.location.search).not.toContain("qm_q=");
  });
  it("resets the cursor when a filter changes while keeping the search menu mounted",async()=>{
    const user=userEvent.setup(),urls:URL[]=[];vi.stubGlobal("fetch",vi.fn(async(input:string)=>{const url=new URL(input,"http://localhost");urls.push(url);return Response.json(url.pathname.endsWith("overview")?fixtureOverview:{sampledAt:fixtureOverview.sampledAt,items:fixtureJobs,nextCursor:url.searchParams.has("cursor")?null:"second-page"});}));
    renderWithIntl(<MonitoringDashboardScreen/>);await screen.findByText("Example job 1");await user.click(screen.getByRole("button",{name:"다음 페이지"}));await waitFor(()=>expect(urls.some(u=>u.searchParams.get("cursor")==="second-page")).toBe(true));
    await user.click(screen.getByRole("button",{name:"검색"}));const input=await screen.findByLabelText("작업 검색");await user.type(input,"image");
    await waitFor(()=>expect(urls.some(u=>u.searchParams.get("q")==="image")).toBe(true));expect(urls.filter(u=>u.searchParams.has("q")).every(u=>!u.searchParams.has("cursor"))).toBe(true);expect(input).toHaveFocus();expect(screen.getByText("1페이지")).toBeInTheDocument();
  });
  it("keeps failure-specific controls inside the shared filter menu and resets them together",async()=>{
    const {urls}=setupFetch(),user=userEvent.setup();window.history.replaceState(null,"","/?qm_tab=failed&qm_code=PROVIDER_UNAVAILABLE");renderWithIntl(<MonitoringDashboardScreen/>);
    expect(screen.queryByRole("textbox",{name:"오류 코드"})).not.toBeInTheDocument();await user.click(screen.getByRole("button",{name:"필터"}));
    const code=await screen.findByRole("textbox",{name:"오류 코드"});expect(code).toHaveValue("PROVIDER_UNAVAILABLE");expect(screen.getByRole("combobox",{name:"실패 처리 상태"})).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"필터 초기화"}));expect(code).toHaveValue("");expect(window.location.search).not.toContain("qm_code");await waitFor(()=>expect(urls.some(u=>u.pathname.endsWith("failed-jobs")&&!u.searchParams.has("code"))).toBe(true));
  });
});
describe("console query freshness",()=>{
  it("retains the last successful sample when refresh fails",async()=>{
    const {fetch}=setupFetch();const {result}=renderHook(()=>useQueueConsole<{sampledAt:string}>("jobs"),{wrapper:createIntlWrapper()});
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));fetch.mockResolvedValue(Response.json({message:"UNAVAILABLE"},{status:503}));
    await act(async()=>{await result.current.refetch();});expect(result.current.data?.sampledAt).toBe(fixtureOverview.sampledAt);
    await waitFor(()=>expect(result.current.error).toBeInstanceOf(QueueConsoleHttpError));expect(result.current.isError).toBe(true);
  });
  it("polls active queries every four seconds and stops when disabled or browsing a non-live page",async()=>{
    vi.useFakeTimers();const {fetch}=setupFetch();
    const {result,rerender}=renderHook(({enabled,poll})=>useQueueConsole("jobs",{},{enabled,poll}),{initialProps:{enabled:true,poll:true},wrapper:createIntlWrapper()});
    await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(result.current.isSuccess).toBe(true);
    const first=fetch.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(4001);});expect(fetch.mock.calls.length).toBe(first+1);
    focusManager.setFocused(false);const hidden=fetch.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});expect(fetch.mock.calls.length).toBe(hidden);
    focusManager.setFocused(true);
    rerender({enabled:true,poll:false});const second=fetch.mock.calls.length;await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});expect(fetch.mock.calls.length).toBe(second);
    rerender({enabled:false,poll:true});await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});expect(fetch.mock.calls.length).toBe(second);
  });
});

it("shows every occupied execution without a collapsed remainder",()=>{
  renderWithIntl(<QueueOverview data={fixtureOverview} onSelect={()=>{}}/>);
  expect(within(screen.getByRole("region",{name:"병렬 실행 현황"})).getAllByRole("button")).toHaveLength(fixtureOverview.occupants.length);
});
it("combines date and seconds without applying drafts on cancel and preserves keyboard focus",async()=>{
  const changed=vi.fn(),initial=new Date(2026,9,26,13,14,15),user=userEvent.setup();
  function Harness(){const [value,setValue]=useState(initial);return <AppDateTimePicker value={value} aria-label="시작 시각" onChange={next=>{changed(next);setValue(next);}}/>;}
  renderWithIntl(<Harness/>);const trigger=screen.getByRole("button",{name:"시작 시각"});await user.click(trigger);
  const time=screen.getByLabelText("시작 시각 · 시간");expect(time).toHaveValue("13:14:15");fireEvent.change(time,{target:{value:"09:30:45"}});
  await user.click(within(screen.getByRole("grid")).getByRole("button",{name:/10월.*28일/}));expect(time).toHaveValue("09:30:45");
  await user.click(screen.getByRole("button",{name:"취소"}));expect(changed).not.toHaveBeenCalled();
  await user.click(trigger);expect(screen.getByLabelText("시작 시각 · 시간")).toHaveValue("13:14:15");
  fireEvent.change(screen.getByLabelText("시작 시각 · 시간"),{target:{value:"09:30:45"}});await user.click(within(screen.getByRole("grid")).getByRole("button",{name:/10월.*28일/}));
  await user.click(screen.getByRole("button",{name:"적용"}));expect(changed).toHaveBeenCalledWith(new Date(2026,9,28,9,30,45));
  await user.click(trigger);await user.keyboard("{Escape}");await waitFor(()=>expect(screen.queryByRole("grid")).not.toBeInTheDocument());expect(trigger).toHaveFocus();
});


it("renders named occupants once across pool and model reservations",()=>{
  const first={...fixtureOverview.occupants[0],title:"Campaign image",model:"image-model"};
  const data={...fixtureOverview,occupants:[first,...fixtureOverview.occupants.slice(1),{...first,resourceKey:"image-model-resource"}]};
  renderWithIntl(<QueueOverview data={data} onSelect={()=>{}}/>);
  const table=screen.getByRole("table",{name:"병렬 실행 현황"});
  expect(within(table).getAllByRole("button")).toHaveLength(8);
  expect(within(table).getByRole("button",{name:"Campaign image"})).toBeInTheDocument();
  expect(within(table).getByText("image-model")).toBeInTheDocument();
  expect(within(table).getByText("종료 미확인")).toBeInTheDocument();
});
it("uses cycle admission and first attempt rather than retry gaps or updatedAt for timing",()=>{
  const job={...fixtureJobs[0],cycle:2,cycleAdmittedAt:"2026-10-25T02:59:00Z",cycleStartedAt:"2026-10-25T02:59:32Z",attemptCount:4};
  expect(consoleInterval(cycleAdmission(job),cycleStart(job))).toBe(32000);
  expect(waitingUntil(job,fixtureOverview.sampledAt)).toBe(job.cycleStartedAt);
  expect(cycleAdmission({...job,cycleAdmittedAt:null})).toBeNull();
  expect(cycleStart({...job,cycleStartedAt:null})).toBeNull();
  expect(cycleStart({...job,cycle:1,cycleStartedAt:null,attempt:{...job.attempt!,cycle:1,ordinal:1,startedAt:"2020-01-01T00:00:00Z"}})).toBeNull();
  expect(waitingUntil({...job,cycleStartedAt:null},fixtureOverview.sampledAt)).toBeNull();
  expect(consoleInterval("invalid",fixtureOverview.sampledAt)).toBeNull();
  expect(consoleInterval(fixtureOverview.sampledAt,"2020-01-01T00:00:00Z")).toBeNull();
  expect(waitingUntil({...fixtureJobs[0],attemptCount:0},fixtureOverview.sampledAt)).toBe(fixtureOverview.sampledAt);
});
it("toggles only overview polling and keeps polling stopped while a detail is selected",async()=>{
  vi.useFakeTimers();window.history.replaceState(null,"","/?qm_tab=service");const {urls}=setupFetch();renderWithIntl(<MonitoringDashboardScreen/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  const count=()=>urls.filter(url=>url.pathname.endsWith("overview")).length;
  fireEvent.click(screen.getByRole("button",{name:"자동 갱신 켜짐"}));const paused=count();
  await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});expect(count()).toBe(paused);
  fireEvent.click(screen.getByRole("button",{name:"자동 갱신 꺼짐"}));await act(async()=>{await vi.advanceTimersByTimeAsync(4001);});expect(count()).toBeGreaterThan(paused);
  fireEvent.click(within(screen.getByRole("region",{name:"병렬 실행 현황"})).getAllByRole("button")[0]);await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  const selected=count();await act(async()=>{await vi.advanceTimersByTimeAsync(8000);});expect(count()).toBe(selected);
  fireEvent.click(screen.getByRole("button",{name:"닫기"}));await act(async()=>{await vi.advanceTimersByTimeAsync(4001);});expect(count()).toBeGreaterThan(selected);
  expect(urls.every(url=>url.pathname.startsWith("/api/internal/job-queue/"))).toBe(true);
});

it("opens a recovery table row with the original job and failure entry",async()=>{
  window.history.replaceState(null,"","/?qm_tab=failed");
  const job={...fixtureJobs[0],failureCount:2,entry:fixtureFailure,currentEntry:fixtureFailure};
  vi.stubGlobal("fetch",vi.fn(async(input:string)=>Response.json(input.includes("failed-jobs")?{sampledAt:fixtureOverview.sampledAt,items:[job],nextCursor:null}:fixtureDetail())));
  const user=userEvent.setup();renderWithIntl(<MonitoringDashboardScreen/>);
  const table=await screen.findByRole("table",{name:"재처리 대기열"});expect(within(table).getByRole("columnheader",{name:"실패 시각"})).toBeInTheDocument();
  await user.click(within(table).getByRole("button",{name:/Example job 1/}));
  expect(window.location.search).toContain("qm_job="+job.id);expect(window.location.search).toContain("qm_entry="+fixtureFailure.id);
  expect(await screen.findByRole("dialog",{name:"작업 상세"})).toBeInTheDocument();
});
