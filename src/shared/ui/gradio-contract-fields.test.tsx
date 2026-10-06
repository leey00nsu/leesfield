import userEvent from "@testing-library/user-event";

import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GradioContractFields } from "./gradio-contract-fields";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
vi.mock("next-intl", () => ({
  useLocale: () => "ko",
  useTranslations: () => (key: string) => key,
}));
const contract: GradioContract = {
  version: 1,
  apiName: "/generate",
  inputs: [
    {
      name: "duration",
      label: "Duration",
      schema: { type: "number" },
      kind: "number",
      required: false,
      nullable: false,
      default: 5,
    },
    {
      name: "frame",
      label: "First Frame",
      schema: {},
      kind: "file",
      required: true,
      nullable: true,
    },
  ],
  output: { media: "video", path: [0], multiple: false },
  diagnostics: [],
  reviewed: true,
};
describe("Gradio contract fields", () => {
  it("edits typed multiple choices and custom values without converting numbers to strings", async () => {
    const user=userEvent.setup(),onChange=vi.fn();
    const choices={...contract,inputs:[{name:"tags",label:"Tags",kind:"json" as const,choiceMode:"multiple" as const,allowCustomValue:true,maxChoices:2,choices:[1,"a"],schema:{type:"array",items:{type:"string",enum:[1,"a"]}},required:false,nullable:false,default:[]}]};
    const {rerender}=render(<GradioContractFields contract={choices} values={{}} prompt="" onChange={onChange}/>);
    await user.click(screen.getByRole("checkbox",{name:"1"}));
    expect(onChange).toHaveBeenLastCalledWith({tags:[1]});
    rerender(<GradioContractFields contract={choices} values={{tags:[1]}} prompt="" onChange={onChange}/>);
    await user.type(screen.getByLabelText("Tags 직접 입력"),"custom");
    await user.click(screen.getByRole("button",{name:"추가"}));
    expect(onChange).toHaveBeenLastCalledWith({tags:[1,"custom"]});
    rerender(<GradioContractFields contract={choices} values={{tags:[1,"custom"]}} prompt="" onChange={onChange}/>);
    expect(screen.getByRole("checkbox",{name:"a"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"custom · 제거"}));
    expect(onChange).toHaveBeenLastCalledWith({tags:[1]});
  });
  it("preserves unsafe numeric text and distinguishes explicit null from missing/default", async()=>{
    const onChange=vi.fn(),user=userEvent.setup();
    const {rerender}=render(<GradioContractFields contract={contract} values={{frame:null}} prompt="demo" onChange={onChange}/>);
    fireEvent.change(screen.getByLabelText("Duration"),{target:{value:"9007199254740993"}});
    expect(onChange).toHaveBeenLastCalledWith({frame:null,duration:"9007199254740993"});
    const choice={...contract,inputs:[{name:"choice",label:"Choice",kind:"number" as const,choiceMode:"single" as const,schema:{type:"string",enum:[1,2]},choices:[1,2],required:true,nullable:true,default:1}]};
    rerender(<GradioContractFields contract={choice} values={{}} prompt="" onChange={onChange}/>);
    await user.click(screen.getByRole("combobox",{name:"Choice"}));
    await user.click(await screen.findByRole("option",{name:"선택 안 함"}));
    expect(onChange).toHaveBeenLastCalledWith({choice:null});
  });
  it("파일 이름 선택지가 있는 계약도 첨부 위치에서 원래 선택 제한을 유지한다", async () => {
    const onChange=vi.fn(), user=userEvent.setup();
    const fileChoices={...contract,inputs:[{...contract.inputs[1],choices:["first.png","second.png"]}]};
    render(<GradioContractFields scope="attachments" contract={fileChoices} values={{}} prompt="demo" onChange={onChange}/>);
    await user.click(screen.getByRole("combobox",{name:"First Frame"}));
    await user.click(await screen.findByRole("option",{name:"second.png"}));
    expect(onChange).toHaveBeenCalledWith({frame:"second.png"});
  });

  it("파일 읽기 중 다른 옵션 변경을 보존하며 모델 교체 뒤 이전 파일 결과는 버린다", async () => {
    let finish: (() => void) | undefined;
    class Reader {
      result="data:image/png;base64,YQ==";
      onload: (()=>void) | null=null;
      readAsDataURL(){finish=()=>this.onload?.();}
    }
    const OriginalReader=globalThis.FileReader;
    globalThis.FileReader=Reader as unknown as typeof FileReader;
    try {
      const onChange=vi.fn();
      const {rerender}=render(<GradioContractFields key="first" scope="attachments" contract={contract} values={{duration:5}} prompt="demo" onChange={onChange}/>);
      fireEvent.change(screen.getByLabelText("First Frame"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
      rerender(<GradioContractFields key="first" scope="attachments" contract={contract} values={{duration:7}} prompt="demo" onChange={onChange}/>);
      await act(async()=>finish?.());
      expect(onChange).toHaveBeenLastCalledWith({duration:7,frame:"data:image/png;base64,YQ=="});
      onChange.mockClear();
      fireEvent.change(screen.getByLabelText("First Frame"),{target:{files:[new File(["b"],"b.png",{type:"image/png"})]}});
      rerender(<GradioContractFields key="next-model" scope="attachments" contract={contract} values={{}} prompt="demo" onChange={onChange}/>);
      await act(async()=>finish?.());
      expect(onChange).not.toHaveBeenCalled();
    } finally {globalThis.FileReader=OriginalReader;}
  });

  it("첨부와 옵션을 분리해 범위 밖 값을 오류로 처리하지 않는다", () => {
    const {container} = render(<>
      <GradioContractFields scope="attachments" contract={contract} values={{duration:7}} prompt="demo" onChange={vi.fn()}/>
      <GradioContractFields scope="options" contract={contract} values={{duration:7}} prompt="demo" onChange={vi.fn()}/>
    </>);
    const attachments=within(container.querySelector('[data-contract-fields="attachments"]') as HTMLElement);
    const options=within(container.querySelector('[data-contract-fields="options"]') as HTMLElement);
    expect(attachments.getByRole("alert")).toHaveTextContent("First Frame");
    expect(attachments.queryByLabelText("Duration")).toBeNull();
    expect(options.queryByLabelText("First Frame")).toBeNull();
    expect(options.queryByRole("alert")).toBeNull();
    expect(options.getByLabelText("Duration")).toHaveValue(7);
  });

  it.each(["image","video","audio"] as const)("복수 %s 첨부는 원본 필드 배열로 보내고 선택/nullable/hidden 계약을 보존한다", async media => {
    const onChange=vi.fn(), user=userEvent.setup();
    const files={...contract,inputs:[
      {...contract.inputs[1],name:"refs",label:"References",kind:"files" as const,media,required:false},
      {...contract.inputs[1],name:"hidden",hidden:true},
    ]};
    const {rerender}=render(<GradioContractFields scope="attachments" contract={files} values={{duration:7}} prompt="demo" onChange={onChange}/>);
    const input=screen.getByLabelText("References");
    expect(input).toHaveAttribute("accept",media+"/*");
    expect(input).toHaveAttribute("multiple");
    expect(screen.queryByLabelText("First Frame")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await user.upload(input,[new File(["a"],"a."+media,{type:media+"/test"}),new File(["b"],"b."+media,{type:media+"/test"})]);
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith({duration:7,refs:[expect.stringMatching("data:"+media+"/"),expect.stringMatching("data:"+media+"/")]}));
    rerender(<GradioContractFields scope="attachments" contract={files} values={{duration:7,refs:["data:"+media+"/test;base64,YQ=="]}} prompt="demo" onChange={onChange}/>);
    await user.click(screen.getByRole("button",{name:"제거"}));
    expect(onChange).toHaveBeenLastCalledWith({duration:7,refs:null});
  });

  it("비활성 첨부는 파일 선택/삭제를 차단하고 파일 없는 계약은 첨부 영역이 없다", async () => {
    const onChange=vi.fn(), user=userEvent.setup();
    const {rerender,container}=render(<GradioContractFields disabled scope="attachments" contract={contract} values={{frame:"data:image/png;base64,YQ=="}} prompt="demo" onChange={onChange}/>);
    expect(screen.getByLabelText("First Frame")).toBeDisabled();
    expect(screen.getByRole("button",{name:"제거"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"제거"}));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<GradioContractFields scope="attachments" contract={{...contract,inputs:[contract.inputs[0]]}} values={{}} prompt="demo" onChange={onChange}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it("모델 고유 필드를 표시하고 원본 이름으로 값을 변경한다", () => {
    const onChange = vi.fn();
    render(
      <GradioContractFields
        contract={contract}
        values={{ frame: null }}
        prompt="demo"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Duration")).toHaveValue(5);
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "7" },
    });
    expect(onChange).toHaveBeenCalledWith({ frame: null, duration: 7 });
    expect(screen.queryByText("값 없음 (null)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name:"제거"})).not.toBeInTheDocument();
  });
});

it("labels required inputs and explains missing values without internal codes", () => {
  render(
    <GradioContractFields
      contract={contract}
      values={{}}
      prompt="demo"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByLabelText("First Frame")).toHaveAttribute(
    "aria-required",
    "true",
  );
  expect(screen.getByText("필수")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "First Frame: 필수 입력입니다.",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("HF_CONTRACT");
});

it("uses a shared select and preserves numeric option types", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const choices = {
    ...contract,
    inputs: [
      {
        name: "quality",
        label: "Quality",
        schema: { type: "number" },
        kind: "number" as const,
        required: true,
        nullable: false,
        choices: [0, 2],
        default: 0,
      },
    ],
  };
  const { container } = render(
    <GradioContractFields
      contract={choices}
      values={{}}
      prompt="demo"
      onChange={onChange}
    />,
  );
  expect(container.querySelector("select:not([aria-hidden])")).toBeNull();
  const select = screen.getByRole("combobox", { name: "Quality" });
  await user.click(select);
  await user.click(await screen.findByRole("option", { name: "2" }));
  expect(onChange).toHaveBeenCalledWith({ quality: 2 });
});

it("does not show prompt errors in options, but still shows invalid options",()=>{
const mapped={...contract,inputs:[{name:"text",label:"Text to Synthesize",schema:{type:"string"},kind:"string" as const,canonical:"prompt" as const,required:false,nullable:false},...contract.inputs]};
const {rerender}=render(<GradioContractFields contract={mapped} values={{frame:null}} prompt="" onChange={vi.fn()}/>);
expect(screen.queryByRole("alert")).toBeNull();
rerender(<GradioContractFields contract={mapped} values={{}} prompt="" onChange={vi.fn()}/>);
expect(screen.getByRole("alert")).toHaveTextContent("First Frame");
expect(screen.getByRole("alert")).not.toHaveTextContent("Text to Synthesize");
});

it("파일 첨부 후에만 삭제를 제공하며 nullable 파일 삭제는 null을 전달한다", async () => {
 const onChange=vi.fn(); const user=userEvent.setup();
 const {rerender}=render(<GradioContractFields contract={contract} values={{frame:null}} prompt="demo" onChange={onChange}/>);
 await user.upload(screen.getByLabelText("First Frame"),new File(["image"],"frame.png",{type:"image/png"}));
 expect(onChange).toHaveBeenCalledWith({frame:expect.stringMatching(/^data:image/)});
 rerender(<GradioContractFields contract={contract} values={{frame:"data:image/png;base64,aW1hZ2U="}} prompt="demo" onChange={onChange}/>);
 expect(screen.getByRole("img",{name:"First Frame"})).toBeVisible();
 await user.click(screen.getByRole("button",{name:"제거"}));
 expect(onChange).toHaveBeenLastCalledWith({frame:null});
});

it("복수 첨부는 순서대로 추가·개별 제거하고 초과 배치는 기존 파일을 유지한다", async () => {
  const user=userEvent.setup(), onChange=vi.fn();
  const files={...contract,inputs:[{...contract.inputs[1],name:"refs",label:"References",kind:"files" as const,media:"image" as const,schema:{type:"array",items:{type:"string"},maxItems:2}}]};
  const first="data:image/png;base64,YQ==";
  const {rerender}=render(<GradioContractFields scope="attachments" contract={files} values={{refs:[first]}} prompt="edit" onChange={onChange}/>);
  expect(screen.getByText("첨부")).toBeVisible();
  await user.upload(screen.getByLabelText("References"),new File(["b"],"b.png",{type:"image/png"}));
  await waitFor(()=>expect(onChange).toHaveBeenCalledWith({refs:[first,"data:image/png;base64,Yg=="]}));
  rerender(<GradioContractFields scope="attachments" contract={files} values={{refs:[first,"data:image/png;base64,Yg=="]}} prompt="edit" onChange={onChange}/>);
  expect(screen.getByRole("button",{name:"References: 파일 추가"})).toBeDisabled();
  await user.click(screen.getAllByRole("button",{name:"제거"})[0]);
  expect(onChange).toHaveBeenLastCalledWith({refs:["data:image/png;base64,Yg=="]});
  onChange.mockClear();
  rerender(<GradioContractFields scope="attachments" contract={files} values={{refs:[first]}} prompt="edit" onChange={onChange}/>);
  await user.upload(screen.getByLabelText("References"),[new File(["b"],"b.png",{type:"image/png"}),new File(["c"],"c.png",{type:"image/png"})]);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("최대 2개까지 첨부할 수 있습니다.");
  expect(screen.getAllByRole("img")).toHaveLength(1);
});
