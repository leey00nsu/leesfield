"use client";
import { useState,useEffect,useRef } from "react";
import { useLocale } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelect } from "@/shared/ui/app-form-control";
type Draft={
 type:"image"|"video";key:string;label:string;vendor:string;provider:string;isActive:boolean;isDefault:boolean;
 providerConfig:Record<string,unknown>;parameters:Record<string,unknown>;meta:Record<string,unknown>;
};
type Item={id:string;name:string;type:string;supported:boolean;message:string|null;limits?:{max_assets:number;max_output_bytes:number;max_input_bytes:number;request_timeout_ms:number;upload_timeout_ms:number;result_timeout_ms:number}};
export function ModalWorkflowImport({onImport}:{onImport:(draft:Draft)=>void}) {
 const ko=useLocale()==="ko";
 const [items,setItems]=useState<Item[]>([]),[selected,setSelected]=useState("");
 const [loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const run=async(importing:boolean)=>{
  setLoading(true);setError(null);
  try {
   const response=await fetch("/api/admin/models/modal-comfyui",importing?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workflowId:selected})}:{});
   const data=await response.json();
   if(!mounted.current)return;
   if(!response.ok)throw new Error(data.message??"MODAL_IMPORT_FAILED");
   if(importing) onImport(data.draft);
   else {setItems(data.items);setSelected(data.items.find((i:Item)=>i.supported)?.id??"");}
  } catch(error) {
   if(mounted.current)setError(error instanceof Error && error.message==="MODAL_NOT_CONFIGURED"
    ? ko?"서버의 Modal 연결 설정이 필요합니다.":"Configure the Modal connection on the server."
    : ko?"워크플로우를 가져오지 못했습니다. 연결과 워크플로우 계약을 확인해주세요.":"Unable to import the workflow. Check the connection and workflow contract.");
  } finally {if(mounted.current)setLoading(false);}
 };
 return <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
  <p className="text-sm">{ko?"Modal에 등록된 이미지·비디오 워크플로우를 모델로 가져옵니다.":"Import a registered Modal image or video workflow."}</p>
  <AppButton type="button" variant="surface" size="sm" disabled={loading} onClick={()=>run(false)}>{ko?"워크플로우 조회":"Load workflows"}</AppButton>
  {items.length>0 && <>
   <AppSelect value={selected} onValueChange={setSelected} disabled={loading} ariaLabel={ko?"Modal 워크플로우":"Modal workflow"} options={items.filter(i=>i.supported).map(i=>({value:i.id,label:i.name+" · "+i.type}))}/>
   <AppButton type="button" variant="surface" size="sm" disabled={loading||!selected} onClick={()=>run(true)}>{ko?"선택한 워크플로우 가져오기":"Import selected workflow"}</AppButton>
   {items.find(i=>i.id===selected)?.limits && (()=>{const limits=items.find(i=>i.id===selected)!.limits!;return <p className="text-xs text-muted-foreground">{ko?`실행 제한: 결과 ${limits.max_assets}개, 결과 합계 ${Math.round(limits.max_output_bytes/1048576)}MB, 입력 파일당 ${Math.round(limits.max_input_bytes/1048576)}MB. 요청 ${limits.request_timeout_ms/1000}초 · 업로드 ${limits.upload_timeout_ms/1000}초 · 결과 동기화 ${limits.result_timeout_ms/1000}초. 가져온 모델의 제공자 설정에서 limits와 timeout_ms를 변경할 수 있습니다.`:`Limits: ${limits.max_assets} results, ${Math.round(limits.max_output_bytes/1048576)}MB total output, ${Math.round(limits.max_input_bytes/1048576)}MB per input. Request ${limits.request_timeout_ms/1000}s, upload ${limits.upload_timeout_ms/1000}s, result sync ${limits.result_timeout_ms/1000}s. Edit limits and timeout_ms in the imported model's provider configuration.`}</p>;})()}
   {items.some(i=>!i.supported)&&<p role="status" className="text-xs">{ko?"일부 워크플로우는 입력 계약을 지원하지 않아 선택할 수 없습니다.":"Some workflows have unsupported input contracts."}</p>}
  </>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}
