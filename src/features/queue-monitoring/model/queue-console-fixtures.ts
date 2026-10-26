import { queueJobKinds, type ConsoleJob, type ConsoleOverview, type ConsoleJobDetail, type ConsoleDeadLetter, type ConsoleCapabilities } from "@/shared/api/job-queue-console-contract";
/** Fictional, deterministic data for product-component stories and interaction tests only. */
export const fixtureId=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
export const fixtureTime="2026-10-25T03:00:00.000Z";
export function fixtureJob(n:number,patch:Partial<ConsoleJob>={}):ConsoleJob{
  const kind=queueJobKinds[(n-1)%6];return{id:fixtureId(n),kind,status:"ready",version:1,cycle:1,sourceType:kind,sourceId:`source-${n}`,sourceRevision:0,
    executionType:kind,executionId:`execution-${n}`,createdAt:"2026-10-25T02:55:00.000Z",updatedAt:fixtureTime,availableAt:"2026-10-25T02:55:00.000Z",cancelRequestedAt:null,
    title:`Example job ${n}`,origin:"space",sourceAvailable:true,sourceStatus:"pending",model:null,sourceRequestId:null,requestId:null,graphId:fixtureId(800),nodeId:fixtureId(900+n),group:null,
    resources:[kind.startsWith("generate_")?"generation":kind==="media_operation"?"media-operation":kind==="assistant"?"assistant":"storage-cleanup"],primaryReason:"CONDITIONS_PENDING",reasons:["CONDITIONS_PENDING"],attempt:null,...patch};
}
export const fixtureJobs=Array.from({length:6},(_,i)=>fixtureJob(i+1));
export const fixtureFailure:ConsoleDeadLetter={id:fixtureId(501),jobId:fixtureId(1),failedAttemptId:fixtureId(601),classification:"terminal",state:"open",safeErrorCode:"PROVIDER_UNAVAILABLE",phase:"execute",version:0,createdAt:fixtureTime,resolvedAt:null,detailPurgedAt:null};
export function fixtureDetail(id=fixtureId(1)):ConsoleJobDetail{return{...fixtureJob(1,{id}),sampledAt:fixtureTime,counts:{attempts:1,deadLetters:0,actions:0},maxAttempts:1,retryDelayMs:0,phase:"admitted",cycleAdmittedAt:"2026-10-25T02:55:00.000Z",currentDeadLetter:null,latestDeadLetter:null};}
export const fixtureCapabilities:ConsoleCapabilities={checkedAt:fixtureTime,jobId:fixtureId(1),entryId:fixtureFailure.id,entryVersion:0,jobVersion:1,
  redrive:{status:"requires_validation",reasons:["QUEUE_FINAL_VALIDATION_REQUIRED"]},reconcile:{status:"blocked",reasons:["QUEUE_RECONCILIATION_UNSUPPORTED"]},abandon:{status:"available",reasons:[]}};
const occupants=[
  {n:11,kind:"generate_image",pool:"generation"},{n:12,kind:"generate_video",pool:"generation"},{n:13,kind:"generate_audio",pool:"generation"},
  {n:14,kind:"media_operation",pool:"media-operation"},{n:15,kind:"media_operation",pool:"media-operation"},
  {n:16,kind:"assistant",pool:"assistant"},{n:17,kind:"assistant",pool:"assistant"},{n:18,kind:"generate_video",pool:"generation",uncertain:true},
] as const;
export const fixtureOverview:ConsoleOverview={sampledAt:fixtureTime,scope:"database_global",runtime:{mode:"shared",epoch:1,migrationVerified:true},
  byKind:Object.fromEntries(queueJobKinds.map(kind=>[kind,{states:{ready:2,active:occupants.filter(j=>j.kind===kind&&!("uncertain"in j)).length},oldestPendingAt:"2026-10-25T02:55:00.000Z"}])) as ConsoleOverview["byKind"],
  counts:{pending:12,active:7,suspended:1,unresolvedJobs:3,reconciliationJobs:1,uncertainJobs:1},
  resources:[{key:"generation",capacity:4,reserved:4,uncertain:1},{key:"media-operation",capacity:2,reserved:2,uncertain:0},
    {key:"assistant",capacity:4,reserved:2,uncertain:0},{key:"storage-cleanup",capacity:2,reserved:0,uncertain:0}].map(r=>({...r,modelKey:null,available:r.capacity-r.reserved,excess:0,capacitySource:"database"})),
  resourcesTruncated:false,occupantsTruncated:false,
  occupants:occupants.map(j=>({resourceKey:j.pool,attemptId:fixtureId(100+j.n),jobId:fixtureId(j.n),kind:j.kind,status:"uncertain"in j?"reconciliation_required":"active",
    executionId:`example-execution-${j.n}`,workerInstanceId:fixtureId(j.n%2?700:701),disposition:"uncertain"in j?"uncertain":"held",startedAt:"2026-10-25T02:58:00.000Z",finishedAt:"uncertain"in j?"2026-10-25T02:59:00.000Z":null})),
  process:{scope:"responding_process",sampledAt:fixtureTime,started:true,stopping:false,workerInstanceId:fixtureId(700),lastHeartbeatAt:fixtureTime,heartbeatAgeSeconds:0},
};
