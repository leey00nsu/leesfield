import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CloseLabelProvider } from "@/shared/ui/close-label";
import { MonitoringDashboardScreen } from "@/screens/monitoring-dashboard/ui/monitoring-dashboard-screen";
import ko from "@/shared/i18n/messages/ko.json";
import en from "@/shared/i18n/messages/en.json";
import { fixtureCapabilities, fixtureDetail, fixtureFailure, fixtureId, fixtureJob, fixtureJobs, fixtureOverview, fixtureTime } from "../model/queue-console-fixtures";
import type { ConsoleAction, ConsoleAttempt, ConsoleDeadLetter, ConsoleFailedJob, ConsoleJobDetail } from "@/shared/api/job-queue-console-contract";

type Scenario="current"|"service"|"failed"|"history"|"detail"|"empty"|"stale"|"unauthorized"|"protected"|"missing"|"many"|"conflict"|"rate";
type StoryProps={scenario:Scenario;locale:"ko"|"en";mobile?:boolean};
function sampleDetail(id:string,scenario:Scenario):ConsoleJobDetail{
  const job=fixtureDetail(id);if(["detail","many","conflict","rate","failed"].includes(scenario))return{...job,title:"가을 캠페인 · 제품 영상",kind:"generate_video",status:"dead_letter",sourceStatus:"failed",model:"leesfield-video",cycle:2,reasons:[],primaryReason:null,
    counts:{attempts:105,deadLetters:105,actions:106},currentDeadLetter:{...fixtureFailure,jobId:id},latestDeadLetter:{...fixtureFailure,jobId:id},phase:"ended",cycleAdmittedAt:"2026-10-25T02:57:00.000Z"};
  return scenario==="missing"?{...job,sourceAvailable:false,origin:"unknown",sourceStatus:null}:job;
}
function attempt(n:number,jobId=fixtureId(1)):ConsoleAttempt{return{id:fixtureId(1000+n),jobId,lifetimeOrdinal:n,cycle:n>1?2:1,cycleOrdinal:n>1?n-1:1,
  executionType:"video_generation",executionId:`example-execution-${n}`,workerInstanceId:fixtureId(700+n%2),phase:n===105?"remote_started":"ended",outcome:n===105?null:"failed",
  startedAt:n===105?"2026-10-25T02:58:00.000Z":"2026-10-25T02:54:00.000Z",finishedAt:n===105?null:"2026-10-25T02:57:00.000Z",heartbeatAt:fixtureTime,leaseUntil:fixtureTime,imported:n===1,
  reservations:[{resourceKey:"generation",disposition:n===104?"uncertain":"held",createdAt:"2026-10-25T02:54:00.000Z",releasedAt:n>=104?null:"2026-10-25T02:57:00.000Z"}]};}
function mockResponse(url:URL,scenario:Scenario,locale:string){
  const page=Number(url.searchParams.get("cursor")??0),id=url.pathname.split('/').at(-1)!;
  if(url.pathname.endsWith("overview"))return scenario==="empty"?{...fixtureOverview,byKind:Object.fromEntries(Object.entries(fixtureOverview.byKind).map(([k])=>[k,{states:{},oldestPendingAt:null}])),counts:{pending:0,active:0,suspended:0,unresolvedJobs:0,reconciliationJobs:0,uncertainJobs:0},resources:fixtureOverview.resources.map(r=>({...r,reserved:0,uncertain:0,available:r.capacity})),occupants:[]}:fixtureOverview;
  if(url.pathname.endsWith("capabilities"))return{...fixtureCapabilities,jobId:url.pathname.includes(fixtureId(18))?fixtureId(18):fixtureId(1),...(scenario==="missing"?{redrive:{status:"blocked",reasons:["QUEUE_REDRIVE_SOURCE_MISSING"]}}:{})};
  if(url.pathname.endsWith("failed-jobs"))return{sampledAt:fixtureTime,nextCursor:null,items:scenario==="empty"?[]:[
    {...fixtureJob(1),title:locale==="ko"?"가을 캠페인 · 제품 영상":"Autumn campaign · product video",status:"dead_letter",failureCount:3,entry:fixtureFailure,currentEntry:fixtureFailure},
    {...fixtureJob(18),title:locale==="ko"?"결과 미확정 · 브랜드 영상":"Brand video · unconfirmed result",status:"reconciliation_required",failureCount:1,entry:{...fixtureFailure,id:fixtureId(518),jobId:fixtureId(18),classification:"reconciliation",safeErrorCode:"QUEUE_REMOTE_STILL_UNCONFIRMED"},currentEntry:null},
    {...fixtureJob(2),title:locale==="ko"?"제품 썸네일 재처리":"Product thumbnail recovery",status:"active",failureCount:2,entry:{...fixtureFailure,id:fixtureId(502),jobId:fixtureId(2),state:"redriven"},currentEntry:null},
  ] satisfies ConsoleFailedJob[]};
  if(/\/jobs\/[^/]+$/.test(url.pathname))return sampleDetail(id,new URLSearchParams(window.location.search).get("qm_entry")?"failed":scenario);
  if(url.pathname.endsWith("attempts"))return{sampledAt:fixtureTime,nextCursor:page<100?String(page+20):null,items:Array.from({length:Math.min(20,105-page)},(_,i)=>attempt(105-page-i))};
  if(url.pathname.endsWith("dead-letters"))return{sampledAt:fixtureTime,nextCursor:page<100?String(page+20):null,items:Array.from({length:Math.min(20,105-page)},(_,i)=>({...fixtureFailure,id:fixtureId(2000+105-page-i),state:page+i===0?"open":"redriven",jobId:fixtureId(1)} satisfies ConsoleDeadLetter))};
  if(url.pathname.endsWith("actions"))return{sampledAt:fixtureTime,nextCursor:page<100?String(page+20):null,items:Array.from({length:Math.min(20,106-page)},(_,i)=>({id:fixtureId(3000+106-page-i),requestId:fixtureId(4000+106-page-i),action:"redrive",outcome:"succeeded",safeReason:"CAUSE_FIXED",createdAt:fixtureTime,result:{code:null,status:null,cycle:2,executionId:"example-recovery-execution",mode:"execute"}} satisfies ConsoleAction))};
  return{sampledAt:fixtureTime,nextCursor:null,items:scenario==="empty"?[]:fixtureJobs.map((j,i)=>({...j,title:locale==="ko"?["가을 캠페인 · 제품 이미지","브랜드 스토리 · 숏폼 영상","콘텐츠 내레이션","영상에서 프레임 추출","캠페인 문구 제안","사용하지 않는 파일 정리"][i]:["Autumn campaign · product image","Brand story · short video","Content narration","Extract frames from video","Campaign copy suggestions","Unused file cleanup"][i],...(scenario==="protected"&&i===0?{status:"suspended"}:{}),...(scenario==="missing"&&i===1?{sourceAvailable:false,origin:"unknown"}:{} )}))};
}
function QueueConsoleStory({scenario,locale,mobile=false}:StoryProps){
  const [ready,setReady]=useState(false),[client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}}));
  useEffect(()=>{
    const original=window.fetch;
    if(scenario==="stale")client.setQueryData(["queue-console","overview",""],fixtureOverview,{updatedAt:0});
    const url=new URL(window.location.href);for(const key of [...url.searchParams.keys()])if(key.startsWith("qm_"))url.searchParams.delete(key);
    url.searchParams.set("qm_tab",scenario==="failed"?"failed":scenario==="history"?"history":["service","stale"].includes(scenario)?"service":"current");
    if(["detail","many","conflict","rate","missing"].includes(scenario))url.searchParams.set("qm_job",fixtureId(1));
    window.history.replaceState(null,"",url);window.dispatchEvent(new PopStateEvent("popstate"));
    window.fetch=async(input,init)=>{
      const request=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,window.location.origin);
      if(!request.pathname.startsWith("/api/internal/job-queue/"))return original(input,init);
      if(scenario==="unauthorized")return Response.json({message:"UNAUTHORIZED"},{status:401});
      if(scenario==="stale"&&request.pathname.endsWith("overview")&&client.getQueryData(["queue-console","overview",""]))return Response.json({message:"UNAVAILABLE"},{status:503});
      if(init?.method==="POST"){
        if(scenario==="conflict")return Response.json({message:"QUEUE_VERSION_CONFLICT"},{status:409});
        if(scenario==="rate")return Response.json({message:"QUEUE_RATE_LIMITED"},{status:429,headers:{"Retry-After":"30"}});
        const body=JSON.parse(String(init.body));return Response.json({requestId:body.requestId,outcome:"succeeded",result:{mode:"execute"}});
      }
      return Response.json(mockResponse(request,scenario,locale));
    };
    // The isolated story installs its HTTP fixture before mounting the production screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);return()=>{window.fetch=original;client.clear();};
  },[scenario,locale,client]);
  return <QueryClientProvider client={client}><NextIntlClientProvider locale={locale} messages={locale==="ko"?ko:en} timeZone="Asia/Seoul"><CloseLabelProvider>
    <div className="mx-auto min-h-screen bg-background px-4 text-foreground sm:px-8" style={{maxWidth:mobile?390:1440}}>{ready&&<MonitoringDashboardScreen/>}</div>
  </CloseLabelProvider></NextIntlClientProvider></QueryClientProvider>;
}
const meta={title:"Features/Queue monitoring",component:QueueConsoleStory,args:{scenario:"current",locale:"ko"},parameters:{layout:"fullscreen",nextjs:{appDirectory:false}}} satisfies Meta<typeof QueueConsoleStory>;
export default meta;type Story=StoryObj<typeof meta>;
export const Current:Story={};export const Service:Story={args:{scenario:"service"}};export const Recovery:Story={args:{scenario:"failed"}};export const History:Story={args:{scenario:"history"}};
export const Detail:Story={args:{scenario:"detail"}};export const MoreThan100:Story={args:{scenario:"many"}};export const Protected:Story={args:{scenario:"protected"}};
export const MissingSource:Story={args:{scenario:"missing"}};export const Empty:Story={args:{scenario:"empty"}};export const Stale:Story={args:{scenario:"stale"}};
export const Unauthorized:Story={args:{scenario:"unauthorized"}};export const Conflict:Story={args:{scenario:"conflict"}};export const RateLimited:Story={args:{scenario:"rate"}};
export const English:Story={args:{locale:"en"}};export const Mobile:Story={args:{mobile:true}};
