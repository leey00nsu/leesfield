import { Prisma, type QueueJob } from "@prisma/client";
import { z } from "zod";
import type { ConsoleCapabilities, ConsoleCapability } from "@/shared/api/job-queue-console-contract";
import { countPending, DEFAULT_ADMISSION_LIMITS } from "@/server/generation-admission/submission-ledger";
import { frozenExecutionModel, recordObject } from "@/server/generation-request/request-snapshot";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { assistantInputSnapshotSchema } from "./handlers/assistant-handler";
import { assertOwner, checkAssets, checkNode, versionedSnapshot } from "./job-queue-redrive-source";
import { QueueContractError } from "./contracts";
import { withConsoleRead, type ConsoleReadTx } from "./job-queue-console-repository";

function fail(code: string): never { throw new QueueContractError(code); }
const blocked = (...reasons: string[]): ConsoleCapability => ({ status: "blocked", reasons });
const needsValidation = (evidenceRef?: string): ConsoleCapability => ({ status: "requires_validation", reasons: ["QUEUE_FINAL_VALIDATION_REQUIRED"], ...(evidenceRef ? { evidenceRef } : {}) });
async function admission(tx: ConsoleReadTx, owner: string, model: string | null, now: Date) {
  const counts=await countPending(tx,owner,model,now), limits=DEFAULT_ADMISSION_LIMITS;
  if(counts.owner_count>=limits.ownerPending)fail("QUEUE_REDRIVE_OWNER_LIMIT");
  if(counts.global_count>=limits.globalPending)fail("QUEUE_REDRIVE_GLOBAL_LIMIT");
  if(model&&counts.provider_count>=limits.providerPending)fail("QUEUE_REDRIVE_PROVIDER_LIMIT");
}
const maxRefs=256;
function boundedRefs<T>(refs:T[]){if(refs.length>maxRefs)fail("QUEUE_REDRIVE_INPUT_LIMIT");return refs;}

/** Bounded private source checks. No clone, admission write, credential decrypt, row lock, asset URL or provider I/O. */
export async function validateQueueRedriveReadTx(tx:ConsoleReadTx,job:QueueJob,now:Date) {
  if(job.kind==="storage_cleanup"){
    const source=await tx.mediaCleanupTask.findUnique({where:{id:job.sourceId},select:{ownerEmail:true,storageProvider:true,queueRevision:true,status:true,assetId:true}});
    if(!source||source.queueRevision!==job.sourceRevision||source.status!=="failed")fail("QUEUE_REDRIVE_SOURCE_CHANGED");
    assertOwner(job,source.ownerEmail??"storage:"+source.storageProvider);
    if(source.assetId){
      const asset=await tx.mediaAsset.findUnique({where:{id:source.assetId},select:{ownerEmail:true,status:true,_count:{select:{coveringProjects:true,selectedByGraphNodes:true,
        graphNodeOutputs:true,operationInputs:true,generationInputAssets:true,assistantInputAssets:true}}}});
      if(asset){
        const inputNodes=await tx.generationGraphNode.count({where:{graph:{ownerEmail:asset.ownerEmail},OR:[{config:{path:["assetId"],equals:source.assetId}},
          {kind:"output.gallery",config:{path:["resultItems"],array_contains:[{assetId:source.assetId}]}}]}});
        if(asset.status==="completed"||inputNodes||Object.values(asset._count).some(Boolean))fail("QUEUE_REDRIVE_ASSET_PROTECTED");
      }
    }
    return;
  }
  if(job.kind==="assistant"){
    const [source]=await tx.$queryRaw<{ownerEmail:string;graphNodeId:string;modelKey:string;status:string;snapshot:unknown}[]>(Prisma.sql`
      SELECT "ownerEmail","graphNodeId","modelKey",status,CASE WHEN pg_column_size("inputSnapshot")<=1048576 THEN "inputSnapshot" END AS snapshot
      FROM "AssistantExecution" WHERE id=${job.sourceId}`);
    if(!source||source.status!=="failed"||!source.snapshot)fail("QUEUE_REDRIVE_SOURCE_MISSING");
    assertOwner(job,source.ownerEmail);
    const refs=boundedRefs(await tx.assistantExecutionInputAsset.findMany({where:{executionId:job.sourceId},select:{assetId:true,portId:true,sortOrder:true},take:maxRefs+1}));
    const snapshot=assistantInputSnapshotSchema.safeParse(source.snapshot);
    if(!snapshot.success||snapshot.data.assets.length!==refs.length||snapshot.data.assets.some(r=>!refs.some(s=>s.assetId===r.assetId&&s.portId===r.portId&&s.sortOrder===r.sortOrder)))fail("QUEUE_REDRIVE_INPUT_MISSING");
    await checkNode(tx,source.ownerEmail,source.graphNodeId,"generate.assistant");await checkAssets(tx,source.ownerEmail,refs,false);
    const model=await tx.modelCatalog.findFirst({where:{key:source.modelKey,type:"llm",isActive:true},select:{provider:true,providerConfig:true,credential:{select:{id:true}}}});
    if(!model||model.provider!=="openai_compatible")fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
    if(!model.credential)fail("QUEUE_REDRIVE_CREDENTIAL_REVOKED");
    if(snapshot.data.assets.length&&!recordObject(model.providerConfig).supports_images)fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
    await admission(tx,source.ownerEmail,source.modelKey,now);return;
  }
  if(job.kind==="media_operation"){
    const [source]=await tx.$queryRaw<{ownerEmail:string;graphNodeId:string|null;graphId:string|null;status:string;type:string;configVersion:number;parameters:unknown}[]>(Prisma.sql`
      SELECT "ownerEmail","graphNodeId","graphId",status,type,"configVersion",CASE WHEN pg_column_size(parameters)<=1048576 THEN parameters END AS parameters
      FROM "MediaOperation" WHERE id=${job.sourceId}`);
    if(!source||source.status!=="failed"||!source.graphNodeId||!source.graphId)fail("QUEUE_REDRIVE_SOURCE_MISSING");
    assertOwner(job,source.ownerEmail);
    if(!source.parameters||!validateNodeConfig(source.type,source.configVersion,{parameters:source.parameters}).supported)fail("QUEUE_REDRIVE_SNAPSHOT_INVALID");
    await checkNode(tx,source.ownerEmail,source.graphNodeId,source.type,source.configVersion);
    const refs=boundedRefs(await tx.mediaOperationInput.findMany({where:{operationId:job.sourceId},select:{assetId:true},take:maxRefs+1}));
    await checkAssets(tx,source.ownerEmail,refs,false);await admission(tx,source.ownerEmail,null,now);return;
  }
  const media=job.kind==="generate_image"?"image":job.kind==="generate_video"?"video":"audio";
  const table=job.kind==="generate_image"?Prisma.sql`"ImageGeneration"`:job.kind==="generate_video"?Prisma.sql`"VideoGeneration"`:Prisma.sql`"AudioGeneration"`;
  const [source]=await tx.$queryRaw<{ownerEmail:string|null;status:string;requestId:string;graphNodeId:string|null;modelKey:string|null;apiKeyId:string|null;snapshot:unknown}[]>(Prisma.sql`
    SELECT "ownerEmail",status,"requestId","graphNodeId","modelKey","apiKeyId",CASE WHEN pg_column_size("requestParams")<=1048576 THEN "requestParams" END AS snapshot
    FROM ${table} WHERE id=${job.sourceId}`);
  if(!source||source.status!=="failed"||!source.snapshot)fail("QUEUE_REDRIVE_SOURCE_MISSING");
  assertOwner(job,source.ownerEmail);
  if(job.snapshotRef.includes(":node:")&&!source.graphNodeId)fail("QUEUE_REDRIVE_TARGET_CHANGED");
  if(!source.modelKey)fail("QUEUE_REDRIVE_SNAPSHOT_MISSING");
  let frozen: ReturnType<typeof frozenExecutionModel>;
  try { frozen=frozenExecutionModel(source.snapshot,media,source.modelKey); } catch { fail("QUEUE_REDRIVE_SNAPSHOT_INVALID"); }
  if(!frozen&&!versionedSnapshot(source.snapshot))fail("QUEUE_REDRIVE_SNAPSHOT_MISSING");
  const model=await tx.modelCatalog.findFirst({where:{key:source.modelKey,type:media,isActive:true},select:{provider:true}});
  if(!model)fail("QUEUE_REDRIVE_MODEL_UNAVAILABLE");
  if(model.provider==="modal_comfyui"&&!frozen)fail("QUEUE_REDRIVE_SNAPSHOT_MISSING");
  await checkNode(tx,source.ownerEmail,source.graphNodeId,"generate."+media);
  if(source.apiKeyId&&!await tx.apiKey.findFirst({where:{id:source.apiKeyId,ownerEmail:source.ownerEmail,status:"active"},select:{id:true}}))fail("QUEUE_REDRIVE_CREDENTIAL_REVOKED");
  const refs=boundedRefs(await tx.generationInputAsset.findMany({where:{requestId:source.requestId,generationType:media},select:{assetId:true},take:maxRefs+1}));
  await checkAssets(tx,source.ownerEmail,refs,false);await admission(tx,source.ownerEmail,source.modelKey,now);
}

export function getConsoleCapabilities(id:string):Promise<ConsoleCapabilities>{
  z.string().uuid().parse(id);
  return withConsoleRead(async(tx,now)=>{
    const entry=await tx.queueDeadLetter.findUniqueOrThrow({where:{id},select:{id:true,version:true,state:true,classification:true,job:true}}),job=entry.job;
    const runtime=await tx.queueRuntime.findUniqueOrThrow({where:{id:1},select:{mode:true}});
    const failed=["dead_letter","reconciliation_required"].includes(job.status),open=entry.state==="open";
    const reasons:string[]=[];
    if(!open)reasons.push("QUEUE_DLQ_NOT_OPEN");if(!failed)reasons.push("QUEUE_JOB_NOT_FAILED");
    if(runtime.mode!=="shared")reasons.push("QUEUE_PAUSED");
    if(entry.classification!=="terminal"||job.status==="reconciliation_required"||await tx.queueReservation.count({where:{attempt:{jobId:job.id},releasedAt:null}}))reasons.push("QUEUE_REMOTE_STOP_NOT_CONFIRMED");
    if(job.cancelRequestedAt)reasons.push("QUEUE_JOB_CANCEL_REQUESTED");
    if(job.orderGroupId&&(await tx.queueOrderGroup.findUnique({where:{id:job.orderGroupId},select:{closedAt:true}}))?.closedAt)reasons.push("QUEUE_GROUP_CLOSED");
    if(!reasons.length){try{await validateQueueRedriveReadTx(tx,job,now);}catch(error){if(error instanceof QueueContractError)reasons.push(error.code);else throw error;}}
    let reconcile:ConsoleCapability=blocked("QUEUE_RECONCILIATION_UNSUPPORTED");
    if(entry.classification==="reconciliation"&&(open||entry.state==="abandoned")&&(failed||job.status==="abandoned")&&["generate_image","generate_video"].includes(job.kind)){
      const table=job.kind==="generate_image"?Prisma.sql`"ImageGeneration"`:Prisma.sql`"VideoGeneration"`;
      const [ledger]=await tx.$queryRaw<{requestId:string}[]>(Prisma.sql`SELECT s."requestId" FROM ${table} s JOIN "ModalComfyJob" m ON m."requestId"=s."requestId"
        WHERE s.id=${job.executionId} AND m."jobId" IS NOT NULL AND jsonb_typeof(m.submission->'execution')='object' LIMIT 1`);
      const busy=await tx.queueAdminAction.count({where:{jobId:job.id,action:"reconcile",outcome:"accepted",createdAt:{gt:new Date(now.getTime()-120000)}}});
      reconcile=busy?blocked("QUEUE_RECONCILIATION_BUSY"):ledger&&/^[a-zA-Z0-9_:.-]{1,390}$/.test(ledger.requestId)?needsValidation("modal:"+ledger.requestId):blocked("QUEUE_REMOTE_REFERENCE_MISSING");
    }
    return{checkedAt:now.toISOString(),jobId:job.id,entryId:entry.id,entryVersion:entry.version,jobVersion:job.version,
      redrive:reasons.length?blocked(...reasons):needsValidation(),reconcile,abandon:open&&failed?{status:"available",reasons:[]}:blocked(open?"QUEUE_JOB_NOT_FAILED":"QUEUE_DLQ_NOT_OPEN")};
  });
}
