import type { ConsoleCleanup } from "@/shared/api/job-queue-console-contract";
import { mediaAssetRepository } from "@/server/media-assets/media-asset-repository";
import type { ConsoleReadTx } from "./job-queue-console-repository";

/** The exact deletion identity and present usage, without storage URLs or owner identity. */
export async function getConsoleCleanup(tx:ConsoleReadTx,executionId:string):Promise<ConsoleCleanup|null> {
  const task=await tx.mediaCleanupTask.findUnique({where:{id:executionId},select:{reason:true,status:true,storageProvider:true,storageObjectId:true,assetId:true,attempts:true,retryAt:true,lastError:true}});
  if(!task)return null;
  const asset=await tx.mediaAsset.findUnique({where:{storageProvider_storageObjectId:{storageProvider:task.storageProvider,storageObjectId:task.storageObjectId}},
    select:{id:true,ownerEmail:true,originalFileName:true,displayName:true,type:true,mimeType:true,bytes:true,status:true}});
  const usage={graphs:0,operations:0,generations:0,assistants:0,projectCovers:0};
  if(asset){const refs=await mediaAssetRepository.getAssetUsage(asset.ownerEmail,asset.id,tx);
    usage.graphs=refs.graphIds.length;usage.operations=refs.operationIds.length;usage.generations=refs.generationRequestIds.length;
    usage.assistants=refs.assistantExecutionIds.length;usage.projectCovers=refs.projectCoverIds.length;}
  const referenced=Object.values(usage).some(count=>count>0);
  const guarded=asset?.status==="completed"&&["upload_session","generation_input","generation_output","media_operation_output","asset_delete"].includes(task.reason);
  const protection=task.status==="completed"?null:task.status==="linked"?"linked":task.status==="uploading"?"upload_grace":referenced?"referenced":guarded?"completed_asset":null;
  return {reason:/^[a-z_]{1,80}$/.test(task.reason)?task.reason:"unknown",status:task.status,storageProvider:task.storageProvider,
    storageObjectId:task.storageObjectId.includes("://")?null:task.storageObjectId,
    assetId:asset?.id??task.assetId,fileName:asset?.originalFileName??asset?.displayName??null,mediaType:asset?.type??null,mimeType:asset?.mimeType??null,
    bytes:asset?.bytes?.toString()??null,assetStatus:asset?.status??null,attempts:task.attempts,retryAt:task.retryAt.toISOString(),
    lastError:task.lastError&&/^[A-Z][A-Z0-9_]{0,119}$/.test(task.lastError)?task.lastError:null,protection,usage};
}
