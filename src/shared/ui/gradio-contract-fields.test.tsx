const referenceUpload = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/shared/api/reference-file-upload", async importOriginal => ({
  ...await importOriginal<typeof import("@/shared/api/reference-file-upload")>(),
  uploadReferenceFiles: (...args: unknown[]) => referenceUpload.run(...args),
}));
beforeEach(() => { referenceUpload.run.mockImplementation(async (files: File[]) => files.map(file => ({
  id: file.name, type: file.type.split("/")[0], status: "completed", mimeType: file.type,
  url: "https://storage.example/" + file.name,
}))); });
import userEvent from "@testing-library/user-event";

import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { MediaAssetDto, MediaType } from "@/shared/media-assets/media-asset-contract";
import { GradioFileField } from "./gradio-file-field";
import { GradioContractFields } from "./gradio-contract-fields";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
const assetQuery = vi.hoisted(() => ({data:{pages:[{items:[] as MediaAssetDto[]}]},isLoading:false,isError:false,isFetching:false,hasNextPage:false,refetch:vi.fn(),fetchNextPage:vi.fn(),requested:vi.fn()}));
vi.mock("@/features/media-assets/hook/use-media-assets",()=>({useAssetProjects:()=>({data:[]}),usePatchAssetMetadata:()=>({isPending:false,mutateAsync:vi.fn()}),useWriteAssetOrganization:()=>({isPending:false,mutateAsync:vi.fn()}),useMediaAssets:(...args:unknown[])=>{assetQuery.requested(...args);return assetQuery;}}));
const asset = (id:string,type:MediaType="image",status:MediaAssetDto["status"]="completed") => ({id,name:id,version:1,createdAt:"2026-10-13T00:00:00Z",type,status,url:"https://storage.example/"+id,mimeType:type === "image" ? "image/png" : type === "video" ? "video/mp4" : "audio/wav",origin:"upload"} as MediaAssetDto);
beforeEach(()=>{assetQuery.data={pages:[{items:[]}]};vi.clearAllMocks();});
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
  it("opens a separate declared audio section for videos and atomically moves/removes both arrays",async()=>{
    const user=userEvent.setup(),onChange=vi.fn();
    const fields:GradioContract["inputs"]=[{name:"clips",label:"Videos",kind:"files",media:"video",required:false,nullable:false,default:[],schema:{type:"array",items:{type:"string"},maxItems:3}},
      {name:"tracks",label:"Tracks",kind:"files",media:"audio",required:false,nullable:false,default:[],schema:{type:"array",items:{type:["string","null"]},maxItems:3},attachment:{role:"paired_audio",pairedWith:"clips",pairing:"index"}}];
    const props={contract:{...contract,inputs:fields},scope:"attachments" as const,prompt:"scene",onChange};
    const view=render(<GradioContractFields {...props} values={{}}/>);
    expect(screen.queryByRole("region",{name:"영상별 오디오"})).toBeNull();
    expect(screen.queryByLabelText("영상별 오디오 1")).toBeNull();
    const values={clips:["https://files/a.mp4","https://files/b.mp4"],tracks:[null,"https://files/b.wav"],duration:7};
    view.rerender(<GradioContractFields {...props} values={values}/>);
    expect(screen.getByLabelText("영상별 오디오 1")).toBeVisible();
    expect(screen.getByLabelText("영상별 오디오 2")).toBeVisible();
    expect(screen.queryByLabelText("영상별 오디오 3")).toBeNull();
    expect(screen.getByLabelText("영상별 오디오 1")).toHaveAttribute("data-paired-file-slot");
    const section=screen.getByRole("region",{name:"영상별 오디오"});
    expect(within(section).getByLabelText("영상별 오디오 1")).toBeVisible();
    expect(section.querySelector('input[accept="video/*"]')).toBeNull();
    expect(screen.getByLabelText("참조 영상").closest('[data-attachment-field]')?.querySelector('[data-paired-audio-section]')).toBeNull();
    await user.click(screen.getByRole("button",{name:"참조 영상 1: 뒤로 이동"}));
    expect(onChange).toHaveBeenLastCalledWith({clips:[values.clips[1],values.clips[0]],tracks:[values.tracks[1],null],duration:7});
    view.rerender(<GradioContractFields {...props} values={onChange.mock.lastCall![0]}/>);
    const parent=screen.getByRole("button",{name:"참조 영상 1: 뒤로 이동"}).parentElement!.parentElement!;
    await user.click(within(parent).getAllByRole("button",{name:"제거"})[0]);
    expect(onChange).toHaveBeenLastCalledWith({clips:[values.clips[0]],tracks:[null],duration:7});
    view.rerender(<GradioContractFields {...props} values={onChange.mock.lastCall![0]}/>);
    await user.click(screen.getByRole("button",{name:"제거"}));
    expect(onChange).toHaveBeenLastCalledWith({clips:[],tracks:[],duration:7});
    view.rerender(<GradioContractFields {...props} values={onChange.mock.lastCall![0]}/>);
    expect(screen.queryByRole("region",{name:"영상별 오디오"})).toBeNull();
  });
  it("does not infer a video relationship from a nullable audio field name",()=>{
    const tracks:GradioContract["inputs"][number]={name:"reference_video_audios",label:"reference_video_audios",kind:"files",media:"audio",required:false,nullable:false,schema:{type:"array",items:{type:["string","null"]},maxItems:3}};
    render(<GradioContractFields contract={{...contract,inputs:[tracks]}} values={{}} prompt="scene" onChange={vi.fn()}/>);
    for(let i=1;i<=3;i++)expect(screen.getByLabelText("영상별 오디오 "+i)).toBeVisible();
  });
  it("shows a normalized label and count once and rejects the seventh reference before reading",()=>{
    const onChange=vi.fn();
    const field={...contract.inputs[1],name:"references",label:"References (optional, up to 6)",kind:"files" as const,media:"image" as const,nullable:false,required:true,schema:{type:"array",items:{type:"string"}}};
    const refs=Array.from({length:5},(_,i)=>"https://files.example/"+i+".png");
    render(<GradioContractFields contract={{...contract,inputs:[field]}} values={{references:refs}} prompt="scene" onChange={onChange}/>);
    expect(screen.getAllByText("참조 이미지")).toHaveLength(1);
    expect(screen.getByText("필수")).toBeVisible();
    expect(screen.getByLabelText("첨부 개수")).toHaveTextContent("5 / 6");
    expect(screen.queryByText(field.label)).toBeNull();
    fireEvent.change(screen.getByLabelText("참조 이미지"),{target:{files:[new File(["i"],"sixth.png",{type:"image/png"}),new File(["i"],"seventh.png",{type:"image/png"})]}});
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("최대 6개");
  });
  it("allows the ninth reference image and rejects a tenth before reading files",async()=>{
    const onChange=vi.fn(),field={...contract.inputs[1],name:"refs",label:"Images",kind:"files" as const,media:"image" as const,required:false,nullable:false,schema:{type:"array",items:{type:"string"},maxItems:9}};
    const value=Array.from({length:8},(_,i)=>"https://files.example/"+i+".png");
    const view=render(<GradioFileField label="Images" field={field} value={value} onChange={onChange}/>);
    fireEvent.change(screen.getByLabelText("참조 이미지"),{target:{files:[new File(["i"],"ninth.png",{type:"image/png"})]}});
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith([...value,expect.stringMatching(/^https:\/\/storage.example\//)]));
    view.rerender(<GradioFileField label="Images" field={field} value={onChange.mock.calls[0][0]} onChange={onChange}/>);
    fireEvent.change(screen.getByLabelText("참조 이미지"),{target:{files:[new File(["i"],"tenth.png",{type:"image/png"})]}});
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it("clears and replaces nullable audio slots without shifting neighboring tracks",async()=>{
    const user=userEvent.setup(),onChange=vi.fn();
    const field={...contract.inputs[1],name:"tracks",label:"Track",kind:"files" as const,media:"audio" as const,nullable:false,required:false,
      schema:{type:"array",maxItems:3,items:{anyOf:[{type:"string",format:"comfy-input-name","x-media":"audio"},{type:"null"}]}}};
    const view=render(<GradioFileField label="Track" field={field} value={["https://cdn/a.wav",null,"https://cdn/c.wav"]} onChange={onChange}/>);
    const first=screen.getByRole("link",{name:"open: 참조 오디오 · Track 1"}).closest("[data-attachment-field]")!;
    await user.click(within(first as HTMLElement).getByRole("button",{name:"제거"}));
    expect(onChange).toHaveBeenLastCalledWith([null,null,"https://cdn/c.wav"]);
    view.rerender(<GradioFileField label="Track" field={field} value={[null,null,"https://cdn/c.wav"]} onChange={onChange}/>);
    fireEvent.change(screen.getByLabelText("참조 오디오 · Track 2"),{target:{files:[new File(["b"],"b.wav",{type:"audio/wav"})]}});
    await waitFor(()=>expect(onChange).toHaveBeenLastCalledWith([null,expect.stringMatching(/^https:\/\/storage.example\//),"https://cdn/c.wav"]));
  });
  it("shows a required positional array once without requiring every empty slot",()=>{
    const field={...contract.inputs[1],name:"reference_video_audios",label:"reference_video_audios",kind:"files" as const,media:"audio" as const,required:true,nullable:false,
      schema:{type:"array",maxItems:3,items:{anyOf:[{type:"string"},{type:"null"}]}}};
    render(<GradioFileField label="raw" field={field} value={[null,"https://cdn/second.wav",null]} onChange={vi.fn()}/>);
    expect(screen.getAllByText("필수")).toHaveLength(1);
    expect(screen.getAllByLabelText("첨부 개수")[0]).toHaveTextContent("1 / 3");
    expect(screen.getByLabelText("영상별 오디오 1")).toHaveAttribute("aria-required","false");
    expect(screen.getByLabelText("영상별 오디오 2")).toHaveAttribute("aria-required","false");
  });

  it.each(["video","audio"] as const)("previews %s on hover/focus, stops on leave, opens originals and recovers from stale sources",async media=>{
    const field={...contract.inputs[1],media,label:"Reference"};
    const play=vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue();
    const pause=vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
    const name=media==="video"?"open: 참조 영상":"open: 참조 오디오";
    try {
      const view=render(<GradioFileField label="Reference" field={field} value="asset:existing" getPreviewUrl={()=>""} onChange={vi.fn()}/>);
      fireEvent.error(view.container.querySelector(media)!);
      fireEvent.pointerEnter(screen.getByLabelText(name),{pointerType:"mouse"});
      expect(play).not.toHaveBeenCalled();
      view.rerender(<GradioFileField label="Reference" field={field} value="asset:existing" getPreviewUrl={()=>"https://assets.example/ready"} onChange={vi.fn()}/>);
      const link=screen.getByRole("link",{name});
      expect(link).toHaveAttribute("href","https://assets.example/ready");
      expect(link).toHaveAttribute("target","_blank");
      expect(link).toHaveAttribute("rel","noopener noreferrer");
      expect(screen.queryByRole("button",{name:/재생|일시 정지/})).toBeNull();
      if(media==="video")expect(view.container.querySelector("video")).toHaveProperty("muted",true);
      let resolve!:()=>void;
      play.mockImplementationOnce(()=>new Promise<void>(done=>{resolve=done;}));
      fireEvent.pointerEnter(link,{pointerType:"mouse"});
      fireEvent.pointerLeave(link,{pointerType:"mouse"});
      const oldPlayer=view.container.querySelector(media);
      await act(async()=>resolve());
      expect(pause.mock.instances).toContain(oldPlayer);
      fireEvent.focus(link);expect(play).toHaveBeenCalledTimes(2);
      fireEvent.blur(link);
      let reject!:(reason:Error)=>void;
      play.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
      fireEvent.pointerEnter(link,{pointerType:"mouse"});
      view.rerender(<GradioFileField label="Reference" field={field} value="asset:existing" getPreviewUrl={()=>"https://assets.example/replacement"} onChange={vi.fn()}/>);
      await act(async()=>reject(new Error("interrupted")));
      const replacement=screen.getByRole("link",{name});
      fireEvent.pointerEnter(replacement,{pointerType:"mouse"});
      expect(play).toHaveBeenCalledTimes(4);
      fireEvent.pointerLeave(replacement,{pointerType:"mouse"});
      play.mockRejectedValueOnce(new DOMException("blocked","NotAllowedError"));
      fireEvent.pointerEnter(replacement,{pointerType:"mouse"});
      await act(async()=>{});
      fireEvent.pointerLeave(replacement,{pointerType:"mouse"});
      fireEvent.pointerEnter(replacement,{pointerType:"mouse"});
      expect(play).toHaveBeenCalledTimes(6);
      fireEvent.pointerLeave(replacement,{pointerType:"mouse"});
      let rejectOld!: (reason: Error) => void;
      play.mockImplementationOnce(()=>new Promise((_,fail)=>{rejectOld=fail;}));
      fireEvent.pointerEnter(replacement,{pointerType:"mouse"});
      fireEvent.pointerLeave(replacement,{pointerType:"mouse"});
      fireEvent.pointerEnter(replacement,{pointerType:"mouse"});
      await act(async()=>rejectOld(new Error("old hover failed")));
      fireEvent.focus(replacement);
      expect(play).toHaveBeenCalledTimes(8);
      const hidden=vi.spyOn(document,"hidden","get").mockReturnValue(true);
      try {
        const pauses=pause.mock.calls.length;
        fireEvent(document,new Event("visibilitychange"));
        expect(pause.mock.calls.length).toBeGreaterThan(pauses);
        fireEvent.focus(replacement);
        expect(play).toHaveBeenCalledTimes(8);
      } finally {hidden.mockRestore();}
      replacement.addEventListener("click",event=>event.preventDefault());
      fireEvent.click(replacement,{button:0});
      view.unmount();
    } finally {play.mockRestore();pause.mockRestore();}
  });

  it.each(["image","video","audio"] as const)("opens local %s using a media Blob link and releases it on replacement/removal",media=>{
    const create=vi.fn().mockReturnValueOnce("blob:preview-1").mockReturnValueOnce("blob:preview-2"),revoke=vi.fn();
    const previousCreate=Object.getOwnPropertyDescriptor(URL,"createObjectURL"),previousRevoke=Object.getOwnPropertyDescriptor(URL,"revokeObjectURL");
    Object.defineProperty(URL,"createObjectURL",{configurable:true,value:create});Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:revoke});
    try {
      const mime={image:"image/png",video:"video/mp4",audio:"audio/wav"}[media];
      const view=render(<GradioFileField label="Reference" field={{...contract.inputs[1],media}} value={"data:"+mime+";base64,YQ=="} onChange={vi.fn()}/>);
      expect(screen.getByRole("link")).toHaveAttribute("href","blob:preview-1");
      expect(create.mock.calls[0][0]).toMatchObject({type:mime,size:1});
      view.rerender(<GradioFileField label="Reference" field={{...contract.inputs[1],media}} value={"data:"+mime+";base64,Yg=="} onChange={vi.fn()}/>);
      expect(revoke).toHaveBeenCalledWith("blob:preview-1");
      expect(screen.getByRole("link")).toHaveAttribute("href","blob:preview-2");
      view.unmount();expect(revoke).toHaveBeenCalledWith("blob:preview-2");
    } finally {
      if(previousCreate)Object.defineProperty(URL,"createObjectURL",previousCreate);else Reflect.deleteProperty(URL,"createObjectURL");
      if(previousRevoke)Object.defineProperty(URL,"revokeObjectURL",previousRevoke);else Reflect.deleteProperty(URL,"revokeObjectURL");
    }
  });

  const references:GradioContract={...contract,inputs:[contract.inputs[0],...(["image","video","audio"] as const).map(media=>({
    name:"reference_"+(media === "image" ? "images" : media === "video" ? "videos" : "audios"),
    label:"reference_"+(media === "image" ? "images" : media === "video" ? "videos" : "audios"),
    kind:"files" as const,media,required:false,nullable:false,default:[],schema:{type:"array",items:{type:"string"},maxItems:2},
  }))]};
  it("unifies entry points, routes assets by media, enforces independent limits and cancels a disabled picker",async()=>{
    const user=userEvent.setup(),onChange=vi.fn(),image=asset("img"),video=asset("vid","video"),audio=asset("aud","audio");
    assetQuery.data={pages:[{items:[image,video,audio]}]};
    const view=render(<GradioContractFields scope="attachments" contract={references} values={{duration:7,reference_images:[image.url]}} prompt="scene" onChange={onChange}/>);
    expect(screen.getAllByRole("button",{name:"참조 자료 업로드"})).toHaveLength(1);
    expect(screen.getAllByRole("button",{name:"참조 자료 에셋 선택"})).toHaveLength(1);
    expect(screen.getByText("참조 이미지")).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"참조 자료 에셋 선택"}));
    expect(assetQuery.requested).toHaveBeenLastCalledWith("image",true,undefined,{sort:"latest",query:""});
    expect(within(screen.getByRole("dialog")).getByRole("button",{name:image.id})).toBeDisabled();
    await user.click(screen.getByRole("tab",{name:"비디오"}));
    await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:video.id}));
    expect(onChange).toHaveBeenLastCalledWith({duration:7,reference_images:[image.url],reference_videos:[video.url]});
    view.rerender(<GradioContractFields scope="attachments" contract={references} values={{reference_videos:[video.url],reference_audios:[audio.url]}} prompt="scene" onChange={onChange}/>);
    expect(screen.getByRole("link",{name:"open: 참조 영상"})).toHaveAttribute("target","_blank");
    expect(screen.getByRole("link",{name:"open: 참조 오디오"})).toHaveAttribute("target","_blank");
    await user.click(screen.getByRole("button",{name:"참조 자료 에셋 선택"}));
    view.rerender(<GradioContractFields disabled scope="attachments" contract={references} values={{}} prompt="scene" onChange={onChange}/>);
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<GradioContractFields scope="attachments" contract={references} values={{}} prompt="scene" onChange={onChange}/>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("mixed file batches preserve each provider field and option; an overflow batch is rejected before reading",async()=>{
    const onChange=vi.fn();
    render(<GradioContractFields scope="attachments" contract={references} values={{duration:7}} prompt="scene" onChange={onChange}/>);
    const input=screen.getByLabelText("참조 자료 업로드",{selector:"input"});
    const image=new File(["img"],"ref.png",{type:"image/png"}),video=new File(["vid"],"ref.mp4",{type:"video/mp4"});
    fireEvent.change(input,{target:{files:[image,image,image,video]}});
    expect(screen.getByRole("alert")).toHaveTextContent("최대 2개");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input,{target:{files:[image,video]}});
    await waitFor(()=>expect(onChange).toHaveBeenLastCalledWith({duration:7,reference_images:["https://storage.example/ref.png"],reference_videos:[expect.stringMatching(/^https:\/\/storage.example\//)]}));
  });
  it("keeps named first/end frame slots separate instead of routing both by media",()=>{
    const roles={...contract,inputs:[{...contract.inputs[1],name:"first",label:"First frame",media:"image" as const},{...contract.inputs[1],name:"end",label:"End frame",media:"image" as const}]};
    render(<GradioContractFields scope="attachments" contract={roles} values={{}} prompt="scene" onChange={vi.fn()}/>);
    expect(screen.queryByRole("button",{name:"참조 자료 업로드"})).toBeNull();
    expect(screen.getByRole("button",{name:"시작 프레임: 에셋 선택"})).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"끝 프레임: 에셋 선택"})).toBeInTheDocument();
  });

  it("adds a compatible asset in order, preserves options, and enforces the current limit",async()=>{
    const user=userEvent.setup(),onChange=vi.fn(),first=asset("first"),second=asset("second");
    assetQuery.data={pages:[{items:[first,second,asset("wrong","video"),asset("failed","image","failed")]}]};
    const gallery={...contract,inputs:[contract.inputs[0],{...contract.inputs[1],name:"frames",kind:"files" as const,media:"image" as const,schema:{type:"array",items:{type:"string"},maxItems:2}}]};
    const view=render(<GradioContractFields scope="attachments" contract={gallery} values={{duration:7,frames:[first.url]}} prompt="scene" onChange={onChange}/>);
    await user.click(screen.getByRole("button",{name:"시작 프레임: 에셋 선택"}));
    expect(assetQuery.requested).toHaveBeenLastCalledWith("image",true,undefined,{sort:"latest",query:""});
    const dialog=screen.getByRole("dialog",{name:"에셋"});
    const cards=[first,second,asset("failed")].map(item=>within(dialog).getByRole("button",{name:item.id}));
    expect(cards[0]).toBeDisabled();expect(cards[2]).toBeDisabled();
    expect(within(dialog).getByRole("button",{name:"wrong"})).toBeDisabled();
    await user.click(cards[1]);
    expect(onChange).toHaveBeenLastCalledWith({duration:7,frames:[first.url,second.url]});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(()=>expect(screen.getByRole("button",{name:"시작 프레임: 에셋 선택"})).toHaveFocus());
    view.rerender(<GradioContractFields scope="attachments" contract={gallery} values={{duration:7,frames:[first.url,second.url]}} prompt="scene" onChange={onChange}/>);
    expect(screen.getByRole("button",{name:"시작 프레임: 에셋 선택"})).toBeDisabled();
  });
  it.each(["image","video","audio"] as const)("replaces a single %s reference with its matching existing asset",async media=>{
    const item=asset("saved",media),onChange=vi.fn(),user=userEvent.setup();
    assetQuery.data={pages:[{items:[item]}]};
    const typed={...contract,inputs:[{...contract.inputs[1],media,label:"References"}]};
    render(<GradioContractFields scope="attachments" contract={typed} values={{frame:"https://old.example/ref"}} prompt="scene" onChange={onChange}/>);
    await user.click(screen.getByRole("button",{name:({image:"참조 이미지",video:"참조 영상",audio:"참조 오디오"}[media])+": 에셋 선택"}));
    expect(assetQuery.requested).toHaveBeenLastCalledWith(media,true,undefined,{sort:"latest",query:""});
    await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:item.id}));
    expect(onChange).toHaveBeenLastCalledWith({frame:item.url});
  });
  it("cancels the picker when the field becomes disabled and permits a type filter only for unspecified media",async()=>{
    const user=userEvent.setup(),onChange=vi.fn();
    const view=render(<GradioContractFields scope="attachments" contract={contract} values={{}} prompt="scene" onChange={onChange}/>);
    await user.click(screen.getByRole("button",{name:"참조 파일 · First Frame: 에셋 선택"}));
    await user.click(screen.getByRole("tab",{name:"비디오"}));
    expect(assetQuery.requested).toHaveBeenLastCalledWith("video",true,undefined,{sort:"latest",query:""});
    view.rerender(<GradioContractFields disabled scope="attachments" contract={contract} values={{}} prompt="scene" onChange={onChange}/>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    view.rerender(<GradioContractFields scope="attachments" contract={contract} values={{}} prompt="scene" onChange={onChange}/>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
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
    await user.click(screen.getByRole("combobox",{name:"참조 파일 · First Frame"}));
    await user.click(await screen.findByRole("option",{name:"second.png"}));
    expect(onChange).toHaveBeenCalledWith({frame:"second.png"});
  });

  it("파일 읽기 중 다른 옵션 변경을 보존하며 모델 교체 뒤 이전 파일 결과는 버린다", async () => {
    let finish: (() => void) | undefined;
    referenceUpload.run.mockImplementation(() => new Promise(resolve => { finish = () => resolve([asset("uploaded")]); }));
    const onChange=vi.fn();
    const {rerender}=render(<GradioContractFields key="first" scope="attachments" contract={contract} values={{duration:5}} prompt="demo" onChange={onChange}/>);
    fireEvent.change(screen.getByLabelText("참조 파일 · First Frame"),{target:{files:[new File(["a"],"a.png",{type:"image/png"})]}});
    rerender(<GradioContractFields key="first" scope="attachments" contract={contract} values={{duration:7}} prompt="demo" onChange={onChange}/>);
    await act(async()=>finish?.());
    expect(onChange).toHaveBeenLastCalledWith({duration:7,frame:"https://storage.example/uploaded"});
    onChange.mockClear();
    fireEvent.change(screen.getByLabelText("참조 파일 · First Frame"),{target:{files:[new File(["b"],"b.png",{type:"image/png"})]}});
    rerender(<GradioContractFields key="next-model" scope="attachments" contract={contract} values={{}} prompt="demo" onChange={onChange}/>);
    await act(async()=>finish?.());
    expect(onChange).not.toHaveBeenCalled();
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
    expect(options.queryByLabelText("참조 파일 · First Frame")).toBeNull();
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
    const input=screen.getByLabelText({image:"참조 이미지",video:"참조 영상",audio:"참조 오디오"}[media]);
    expect(input).toHaveAttribute("accept",media+"/*");
    expect(input).toHaveAttribute("multiple");
    expect(screen.queryByLabelText("참조 파일 · First Frame")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    await user.upload(input,[new File(["a"],"a."+media,{type:media+"/test"}),new File(["b"],"b."+media,{type:media+"/test"})]);
    await waitFor(()=>expect(onChange).toHaveBeenCalledWith({duration:7,refs:[expect.stringMatching("https://storage.example/"),expect.stringMatching("https://storage.example/")]}));
    rerender(<GradioContractFields scope="attachments" contract={files} values={{duration:7,refs:["data:"+media+"/test;base64,YQ=="]}} prompt="demo" onChange={onChange}/>);
    await user.click(screen.getByRole("button",{name:"제거"}));
    expect(onChange).toHaveBeenLastCalledWith({duration:7,refs:null});
  });

  it("비활성 첨부는 파일 선택/삭제를 차단하고 파일 없는 계약은 첨부 영역이 없다", async () => {
    const onChange=vi.fn(), user=userEvent.setup();
    const {rerender,container}=render(<GradioContractFields disabled scope="attachments" contract={contract} values={{frame:"data:image/png;base64,YQ=="}} prompt="demo" onChange={onChange}/>);
    expect(screen.getByLabelText("참조 파일 · First Frame")).toBeDisabled();
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
  expect(screen.getByLabelText("참조 파일 · First Frame")).toHaveAttribute(
    "aria-required",
    "true",
  );
  expect(screen.getByText("필수")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "참조 파일 · First Frame: 필수 입력입니다.",
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
 await user.upload(screen.getByLabelText("참조 파일 · First Frame"),new File(["image"],"frame.png",{type:"image/png"}));
 expect(onChange).toHaveBeenCalledWith({frame:expect.stringMatching(/^https:\/\/storage.example\//)});
 rerender(<GradioContractFields contract={contract} values={{frame:"data:image/png;base64,aW1hZ2U="}} prompt="demo" onChange={onChange}/>);
 expect(screen.getByRole("img",{name:"참조 파일 · First Frame"})).toBeVisible();
 await user.click(screen.getByRole("button",{name:"제거"}));
 expect(onChange).toHaveBeenLastCalledWith({frame:null});
});

it("복수 첨부는 순서대로 추가·개별 제거하고 초과 배치는 기존 파일을 유지한다", async () => {
  const user=userEvent.setup(), onChange=vi.fn();
  const files={...contract,inputs:[{...contract.inputs[1],name:"refs",label:"References",kind:"files" as const,media:"image" as const,schema:{type:"array",items:{type:"string"},maxItems:2}}]};
  const first="data:image/png;base64,YQ==";
  const {rerender}=render(<GradioContractFields scope="attachments" contract={files} values={{refs:[first]}} prompt="edit" onChange={onChange}/>);
  expect(screen.getByText("업로드")).toBeVisible();
  await user.upload(screen.getByLabelText("참조 이미지"),new File(["b"],"b.png",{type:"image/png"}));
  await waitFor(()=>expect(onChange).toHaveBeenCalledWith({refs:[first,"https://storage.example/b.png"]}));
  rerender(<GradioContractFields scope="attachments" contract={files} values={{refs:[first,"https://storage.example/b.png"]}} prompt="edit" onChange={onChange}/>);
  expect(screen.getByRole("button",{name:"참조 이미지: 파일 업로드"})).toBeDisabled();
  await user.click(screen.getAllByRole("button",{name:"제거"})[0]);
  expect(onChange).toHaveBeenLastCalledWith({refs:["https://storage.example/b.png"]});
  onChange.mockClear();
  rerender(<GradioContractFields scope="attachments" contract={files} values={{refs:[first]}} prompt="edit" onChange={onChange}/>);
  await user.upload(screen.getByLabelText("참조 이미지"),[new File(["b"],"b.png",{type:"image/png"}),new File(["c"],"c.png",{type:"image/png"})]);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("최대 2개까지 첨부할 수 있습니다.");
  expect(screen.getAllByRole("img")).toHaveLength(1);
});
