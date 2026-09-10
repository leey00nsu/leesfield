import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,it,expect,vi} from "vitest";
vi.mock("next-intl",()=>({useLocale:()=>"ko"}));
vi.mock("@/shared/ui/app-form-control",()=>({AppSelect:({value,onValueChange,options,ariaLabel}:{value:string;onValueChange:(v:string)=>void;options:{value:string;label:string}[];ariaLabel:string})=><select aria-label={ariaLabel} value={value} onChange={e=>onValueChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
import {ModalWorkflowImport} from "./modal-workflow-import";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("loads, selects and imports the chosen workflow draft",async()=>{
 const draft={type:"video",provider:"modal_comfyui",isActive:false};
 const fetch=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({items:[
  {id:"krea2-t2i",name:"Krea2",type:"image",supported:true},
  {id:"minimax-h3-pdd-fl2va",name:"H3",type:"video",supported:true},
 ]})}).mockResolvedValueOnce({ok:true,json:async()=>({draft})});
 vi.stubGlobal("fetch",fetch);const onImport=vi.fn();render(<ModalWorkflowImport onImport={onImport}/>);
 fireEvent.click(screen.getByRole("button",{name:"워크플로우 조회"}));
 await screen.findByRole("combobox");
 fireEvent.change(screen.getByRole("combobox"),{target:{value:"minimax-h3-pdd-fl2va"}});
 fireEvent.click(screen.getByRole("button",{name:"선택한 워크플로우 가져오기"}));
 await waitFor(()=>expect(onImport).toHaveBeenCalledWith(draft));
 expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({workflowId:"minimax-h3-pdd-fl2va"});
});
it("shows a configuration error without applying a draft",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,json:async()=>({message:"MODAL_NOT_CONFIGURED"})}));
 const onImport=vi.fn();render(<ModalWorkflowImport onImport={onImport}/>);
 fireEvent.click(screen.getByRole("button",{name:"워크플로우 조회"}));
 expect(await screen.findByRole("alert")).toHaveTextContent("Modal 연결 설정");
 expect(onImport).not.toHaveBeenCalled();
});
