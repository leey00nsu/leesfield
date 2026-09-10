import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { createModalClient, ModalApiError } from "@/server/modal-comfyui/client";
import { buildModalModelDraft } from "@/server/modal-comfyui/importer";
import { modalWorkflowIdSchema, modalExecutionLimitsSchema, modalExecutionLimits } from "@/shared/model-catalog/modal-comfyui-contract";
export const dynamic="force-dynamic";
const bodySchema=z.object({workflowId:modalWorkflowIdSchema,limits:modalExecutionLimitsSchema.partial().optional(),timeoutMs:z.number().int().min(1000).max(86_400_000).optional()}).strict();
async function authorized() {
 const session=await getSession();return session.isLoggedIn && Boolean(session.adminEmail);
}
function failure(error:unknown) {
 return NextResponse.json({message:error instanceof ModalApiError?error.code:"MODAL_CONTRACT_INVALID"},{status:400});
}
export async function GET() {
 if(!await authorized()) return NextResponse.json({message:"UNAUTHORIZED"},{status:401});
 try {
  const data=z.object({workflows:z.array(z.unknown()).max(100)}).parse(await createModalClient().json("/api/workflows"));
  const items=data.workflows.flatMap<{id:string;name:string;type:string;supported:boolean;message:string|null;limits?:z.infer<typeof modalExecutionLimitsSchema>}>(raw=>{
   const id=(raw as {id?:unknown})?.id;
   if((raw as {category?:unknown})?.category === "audio") return [];
   try {
    const draft=buildModalModelDraft(raw);
    return [{id:String(id),name:draft.label,type:draft.type,supported:true,message:null as string|null,limits:draft.provider==="modal_comfyui"?modalExecutionLimits(draft.providerConfig):undefined}];
   } catch {return [{id:String(id),name:String(id),type:"unknown",supported:false,message:"MODAL_CONTRACT_INVALID"}];}
  });
  return NextResponse.json({items},{headers:{"Cache-Control":"no-store"}});
 } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
 if(!await authorized()) return NextResponse.json({message:"UNAUTHORIZED"},{status:401});
 try {
  const {workflowId,limits,timeoutMs}=bodySchema.parse(await request.json());
  const raw=await createModalClient().json("/api/workflows/"+workflowId);
  const draft=buildModalModelDraft(raw);
  if(draft.provider!=="modal_comfyui" || draft.providerConfig.workflow_id!==workflowId) throw new ModalApiError("MODAL_WORKFLOW_MISMATCH");
  draft.providerConfig={...draft.providerConfig,...(limits?{limits}:{}),...(timeoutMs?{timeout_ms:timeoutMs}:{})};
  return NextResponse.json({draft},{headers:{"Cache-Control":"no-store"}});
 } catch(error) {return failure(error);}
}
