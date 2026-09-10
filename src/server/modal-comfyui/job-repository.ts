import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ModalApiError } from "./client";

export type ModalSubmission={inputs:Record<string,unknown>;advanced:Record<string,unknown>;execution?:{config:unknown;values:Record<string,unknown>;origin:string}};
export type ModalJobRecord={requestId:string;fingerprint:string;jobId:string|null;submission:unknown;createdAt:Date};
export interface ModalJobRepository {
 find?(requestId:string):Promise<ModalJobRecord|null>;
 acquire(requestId:string,fingerprint:string,leaseMs:number):Promise<ModalJobRecord & {lease:string}>;
 save(requestId:string,lease:string,patch:{jobId?:string;submission?:ModalSubmission}):Promise<void>;
 release(requestId:string,lease:string):Promise<void>;
}
export const modalJobRepository:ModalJobRepository={
 async find(requestId){return prisma.modalComfyJob.findUnique({where:{requestId}});},
 async acquire(requestId,fingerprint,leaseMs) {
  const row=await prisma.modalComfyJob.upsert({where:{requestId},create:{requestId,fingerprint},update:{}});
  if(row.fingerprint!==fingerprint) throw new ModalApiError("MODAL_REQUEST_CONFLICT");
  if(!row.jobId && Date.now()-row.createdAt.getTime()>24*60*60*1000) throw new ModalApiError("MODAL_REQUEST_EXPIRED");
  const lease=randomUUID();
  const result=await prisma.modalComfyJob.updateMany({
   where:{requestId,OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]},
   data:{lease,leaseUntil:new Date(Date.now()+leaseMs)},
  });
  if(result.count!==1) throw new ModalApiError("MODAL_REQUEST_BUSY",true);
  const current=await prisma.modalComfyJob.findUniqueOrThrow({where:{requestId}});
  return {...current,lease};
 },
 async save(requestId,lease,patch) {
  const result=await prisma.modalComfyJob.updateMany({where:{requestId,lease},data:{
   ...(patch.jobId?{jobId:patch.jobId}:{}),
   ...(patch.submission?{submission:patch.submission as Prisma.InputJsonValue}:{}),
  }});
  if(result.count!==1) throw new ModalApiError("MODAL_REQUEST_LEASE_LOST");
 },
 async release(requestId,lease) {
  await prisma.modalComfyJob.updateMany({where:{requestId,lease},data:{lease:null,leaseUntil:null}});
 },
};
