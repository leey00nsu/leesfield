import {useState} from "react";
import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe,it,expect,vi} from "vitest";
import {renderWithIntl} from "@/test-utils/intl";
import {getGradioContract,gradioInputValues} from "@/shared/model-catalog/gradio-contract";
import {ModelPrimaryTextInput} from "./model-primary-text-input";

describe("primary text role editing",()=>{
 it("promotes and clears a native text role without rewriting provider semantics",async()=>{
  const changed=vi.fn();
  const contract={version:1,apiName:"/speak",inputs:[{name:"dialogue",label:"Dialogue",kind:"string",schema:{type:"string",minLength:1},required:true,nullable:false}],output:{media:"audio",path:[0],multiple:false},diagnostics:[],reviewed:false};
  function Form(){
   const [draft,setDraft]=useState({providerConfigText:JSON.stringify({gradio_contract:contract}),parametersText:"{}"});
   return <ModelPrimaryTextInput {...draft} onChange={next=>{changed(next);setDraft(next);}}/>;
  }
  const user=userEvent.setup();renderWithIntl(<Form/>);
  Element.prototype.scrollIntoView=vi.fn();
  screen.getByRole("combobox",{name:"주 텍스트 입력"}).focus();
  await user.keyboard("{ArrowDown}{End}{Enter}");
  const state=changed.mock.lastCall![0];
  const model={providerConfig:JSON.parse(state.providerConfigText),parameters:JSON.parse(state.parametersText)};
  const primary=getGradioContract(model)!;
  expect(primary.inputs[0]).toMatchObject({...contract.inputs[0],canonical:"prompt"});
  expect(gradioInputValues(primary,{prompt:"Brand narration"})).toEqual({dialogue:"Brand narration"});
  // Existing explicit native values retain their established precedence.
  expect(gradioInputValues(primary,{prompt:".",dynamicParams:{dialogue:"Saved script"}})).toEqual({dialogue:"Saved script"});
  await user.click(screen.getByRole("combobox",{name:"주 텍스트 입력"}));
  await user.click(await screen.findByRole("option",{name:"미지정 · 원본 입력 사용"}));
  const cleared=changed.mock.lastCall![0];
  expect(getGradioContract({providerConfig:JSON.parse(cleared.providerConfigText),parameters:JSON.parse(cleared.parametersText)})?.inputs[0].canonical).toBeUndefined();
 });
});
