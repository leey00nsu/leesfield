import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { GenerationHistoryItem } from "@/entities/generation/model/types";
import type { HistoryQuery } from "./lib/history-query";
import { toHistoryDurationMs } from "./lib/history-query";
export const assistantHistorySelect={id:true,graphId:true,graphNodeId:true,modelKey:true,status:true,inputSnapshot:true,outputText:true,errorCode:true,createdAt:true,updatedAt:true,finishedAt:true} satisfies Prisma.AssistantExecutionSelect;
type AssistantRow=Prisma.AssistantExecutionGetPayload<{select:typeof assistantHistorySelect}>;
export function assistantHistoryWhere(query:Pick<HistoryQuery,"model"|"prompt"|"query"|"hidden">,ownerEmail:string):Prisma.AssistantExecutionWhereInput {
  const text=query.prompt||query.query;
  return {ownerEmail,...(query.hidden?{id:{in:[]}}:{}),...(query.model?{modelKey:query.model}:{}),...(text?{OR:[{inputSnapshot:{path:["instruction"],string_contains:text,mode:"insensitive"}},{inputSnapshot:{path:["text"],string_contains:text,mode:"insensitive"}},...(!query.prompt?[{modelKey:{contains:text,mode:"insensitive" as const}}]:[])]}: {})};
}
export function projectAssistantHistory(row:AssistantRow,detail=false):GenerationHistoryItem {
  const snapshot=row.inputSnapshot&&typeof row.inputSnapshot==="object"&&!Array.isArray(row.inputSnapshot)?row.inputSnapshot:{};
  const text=(value:unknown)=>typeof value==="string"?value.slice(0,detail?20_000:4_000):"";
  return {id:row.id,type:"assistant",origin:"generation",graphId:row.graphId,graphNodeId:row.graphNodeId,status:row.status,model:row.modelKey,
    prompt:text(snapshot.instruction),inputText:text(snapshot.text),outputText:row.status==="completed"?text(row.outputText):null,
    createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),finishedAt:row.finishedAt?.toISOString()??null,
    durationMs:toHistoryDurationMs(row.createdAt,row.finishedAt,row.status),resultUrl:null,thumbnailUrl:null,errorMessage:row.errorCode};
}
export async function getAssistantHistoryItem(ownerEmail:string,id:string) {
  const row=await prisma.assistantExecution.findFirst({where:{id,ownerEmail},select:{...assistantHistorySelect,
    inputAssets:{where:{ownerEmail},orderBy:[{portId:"asc"},{sortOrder:"asc"}],take:256,select:{assetId:true}},
  }});
  if(!row)return null;
  const snapshot=row.inputSnapshot&&typeof row.inputSnapshot==="object"&&!Array.isArray(row.inputSnapshot)?row.inputSnapshot:{};
  return {...projectAssistantHistory(row,true),
    assistantSettings:{outputMode:snapshot.outputMode==="text"||snapshot.outputMode==="list"?snapshot.outputMode:null},
    sourceAssetIds:[...new Set((row.inputAssets??[]).map(input=>input.assetId))],
  } satisfies GenerationHistoryItem;
}

/** Only the authorized global monitoring route may omit the owner filter. */
export async function getAssistantHistoryDetail(ownerEmail: string | undefined, id: string) {
  const row = await prisma.assistantExecution.findFirst({
    where: { id, ...(ownerEmail !== undefined ? { ownerEmail } : {}) },
    select: assistantHistorySelect,
  });
  if (!row) return null;
  const item = projectAssistantHistory(row, true);
  return {
    id: item.id, type: "assistant" as const, origin: "generation" as const,
    status: item.status, model: item.model, prompt: item.prompt,
    inputText: item.inputText, outputText: item.outputText,
    createdAt: item.createdAt, updatedAt: row.updatedAt.toISOString(),
    finishedAt: item.finishedAt, durationMs: item.durationMs ?? null,
    progress: null, errorMessage: item.errorMessage, warningMessage: null,
    requestParameters: null, inputImages: [], inputAudios: [], inputVideos: [],
    inputMedia: [], referenceText: null, assets: [],
  };
}
