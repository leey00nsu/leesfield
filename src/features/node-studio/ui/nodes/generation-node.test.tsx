import { fireEvent, render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import messages from "@/shared/i18n/messages/en.json";
import { createIntlWrapper } from "@/test-utils/intl";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { promptPresetReference } from "@/shared/prompt-presets/prompt-preset-contract";
import { SpaceGenerationPrompt } from "./space-generation-prompt";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { composeNodePresetPrompt, hydrateNodePromptPreset, writeNodePromptPreset } from "../../model/node-prompt-presets";
function promptWrapper({children}: {children: ReactNode}) {
  const Intl = createIntlWrapper();
  return <QueryClientProvider client={new QueryClient()}><Intl>{children}</Intl></QueryClientProvider>;
}
const presetFixtures = builtinPromptPresets.map(p => ({ ...p, builtinKey: p.key, builtinRevision: p.revision, defaultPrompt: p.prompt, isActive: true, isModified: false }));
const personalPresetFixtures = (["video", "audio"] as const).map(modality => ({
  key: "personal-" + modality, revision: 1, name: modality + " preset", description: "", modality, prompt: modality + " prompt",
  requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {}, builtinKey: null, builtinRevision: null,
  defaultPrompt: null, isActive: true, isModified: false,
}));
vi.mock("@/entities/prompt-preset/model/use-prompt-preset-catalog", () => ({
  usePromptPresetCatalog: (modality: string) => ({ data: [...presetFixtures, ...personalPresetFixtures].filter(preset => preset.modality === modality), isLoading: false, isError: false, refetch: vi.fn() }),
}));
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  replaceAssets: vi.fn().mockReturnValue(true),
  ids: [] as string[],
  slots: [] as (string|null)[],
  writable: true,
  running: false,
  maxInputImages: 2,
  videoSupportsInitImage: true,
  videoContract: null as Record<string,unknown> | null,
  promptInput: { connected: false, text: null } as { connected: boolean; text: string | null },
}));

vi.mock("@xyflow/react", () => ({
  Handle: ({ id, "aria-label": ariaLabel }: { id: string; "aria-label"?: string }) => (
    <span data-testid={`handle-${id}`} aria-label={ariaLabel} />
  ),
  NodeResizer: () => <span data-testid="node-resizer" />,
  Position: { Left: "left", Right: "right" },
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    writable: mocks.writable,
    isNodeRunning: () => mocks.running,
    updateCanonicalNodeConfig: mocks.updateConfig,
    prepareImageNodeExecution: vi.fn().mockResolvedValue(1),
    imageModels: [{
      type: "image",
      key: "image-a",
      label: "Image A",
      vendor: "Leesfield",
      provider: "gradio",
      parameters: {
        width: { ui: "range", label: "Width", min: 256, max: 2048, step: 64, default: 1024 },
      },
      meta: { max_input_images: mocks.maxInputImages },
      isActive: true,
      isDefault: true,
    }],
    videoModels: [{
      type: "video",
      providerConfig: mocks.videoContract ? {gradio_contract:mocks.videoContract} : {},
      key: "video-a",
      label: "Video A",
      vendor: "Leesfield",
      provider: "hf_space",
      parameters: {
        durationSec: { ui: "range", label: "Duration", min: 1, max: 8, step: 0.5, default: 3 },
      },
      meta: { supports_init_image: mocks.videoSupportsInitImage },
      isActive: true,
      isDefault: true,
    }],
    audioModels: [{
      type: "audio",
      key: "audio-a",
      label: "Audio A",
      vendor: "Leesfield",
      provider: "hf_space",
      parameters: {
        speed: { ui: "range", label: "Speed", min: 0.5, max: 2, step: 0.1, default: 1 },
      },
      meta: {},
      isActive: true,
      isDefault: true,
    }],
    isLoading: false,
    error: null,
    retry: vi.fn(),
    getNodeRunReadiness: () => ({ ready: true, reasons: [] }),
    getNodePromptInput: () => mocks.promptInput,
    getNodeInputAssetIds: (_id:string,port:string) => port === "video-field-source" ? mocks.ids : port === "primary" ? mocks.ids.slice(0,1) : port === "references" ? mocks.ids.slice(1) : [],
    getNodeInputAssetSlots: () => mocks.slots,
    replaceNodeInputAssets: mocks.replaceAssets,
  }),
}));

vi.mock("./generation-node-execution", () => ({
  GenerationNodeExecution: ({ mediaType, expanded }: { mediaType: string; expanded?: boolean }) => (
    <div data-generation-section="execution" data-media={mediaType}>
      {expanded ? "execution-expanded" : "execution-compact"}
    </div>
  ),
}));

import { GenerationNode } from "./generation-node";

const modelKeyByMedia = {
  image: "image-a",
  video: "video-a",
  audio: "audio-a",
} as const;

function data(mediaType: "image" | "video" | "audio"): NodeBananaNodeData {
  const kind = `generate.${mediaType}`;
  return {
    canonicalKind: kind,
    configVersion: 1,
    config: { prompt: `make ${mediaType}`, modelKey: modelKeyByMedia[mediaType], parameters: {} },
    selectedOutputAssetId: null,
    ports: [],
    supported: true,
    supportReason: null,
  };
}

function node(mediaType: "image" | "video" | "audio", selected = false) {
  return (
    <GenerationNode
      id={`node-${mediaType}`}
      data={data(mediaType)}
      selected={selected}
      type="generationNode"
      dragging={false}
      draggable
      selectable
      deletable
      zIndex={0}
      isConnectable
      positionAbsoluteX={0}
      positionAbsoluteY={0}
    />
  );
}

function renderNodes() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node("image")}
      {node("video")}
      {node("audio")}
    </NextIntlClientProvider>,
  );
}

describe("GenerationNode common presenter", () => {
  it("opens a separate Space audio section for attached videos and sends related IDs with a joint reorder",async()=>{
    mocks.ids=["v1","v2"];mocks.slots=[null,"a2"];
    mocks.videoContract={version:1,apiName:"/generate",inputs:[
      {name:"source",label:"Videos",kind:"files",media:"video",required:false,nullable:false,default:[],schema:{type:"array",items:{type:"string"},maxItems:3}},
      {name:"tracks",label:"Tracks",kind:"files",media:"audio",required:false,nullable:false,default:[],schema:{type:"array",items:{type:["string","null"]},maxItems:3},attachment:{role:"paired_audio",pairedWith:"source",pairing:"index"}},
    ],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true};
    const fetcher=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>new Response(JSON.stringify({asset:{url:"https://storage.example/preview"}}),{status:200}));
    try {
      const user=userEvent.setup();
      const config={modelKey:"video-a",prompt:"Scene",parameters:{}};
      const view=render(<SpaceGenerationPrompt nodeId="node" config={config} modality="video"/>,{wrapper:promptWrapper});
      expect(screen.getByLabelText("영상별 오디오 1")).toBeVisible();expect(screen.queryByLabelText("영상별 오디오 3")).toBeNull();
      expect(screen.getByRole("region",{name:"영상별 오디오"})).toContainElement(screen.getByLabelText("영상별 오디오 1"));
      expect(screen.getByLabelText("참조 영상").closest('[data-attachment-field]')?.querySelector('[data-paired-audio-section]')).toBeNull();
      await user.click(screen.getByRole("button",{name:"참조 영상 1: 뒤로 이동"}));
      await waitFor(()=>expect(mocks.replaceAssets).toHaveBeenCalledWith("node",expect.objectContaining({ports:["video-field-source"]}),["v2","v1"],
        {modelKey:"video-a",assetIds:["v1","v2"],relatedAssetIds:{tracks:[null,"a2"]}},[1,0]));
      expect(mocks.updateConfig).not.toHaveBeenCalled();
      mocks.ids=[];mocks.slots=[];
      view.rerender(<SpaceGenerationPrompt nodeId="node" config={config} modality="video"/>);
      expect(screen.queryByRole("region",{name:"영상별 오디오"})).toBeNull();
    } finally {fetcher.mockRestore();}
  });
  it("discards a delayed paired audio selection after its parent video changes",async()=>{
    mocks.ids=["v1"];mocks.slots=[];
    mocks.videoContract={version:1,apiName:"/generate",inputs:[
      {name:"source",label:"Videos",kind:"files",media:"video",required:false,nullable:false,default:[],schema:{type:"array",items:{type:"string"},maxItems:3}},
      {name:"tracks",label:"Tracks",kind:"files",media:"audio",required:false,nullable:false,default:[],schema:{type:"array",items:{type:["string","null"]},maxItems:3},attachment:{role:"paired_audio",pairedWith:"source",pairing:"index"}},
    ],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true};
    const item={id:"selected",type:"audio",status:"completed",mimeType:"audio/wav",url:"https://storage.example/selected.wav",origin:"upload"};
    let resolve!: (response:Response)=>void;
    const delayed=new Promise<Response>(done=>{resolve=done;});
    const fetcher=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>String(input).endsWith("/api/media-assets/selected")?delayed:
      new Response(JSON.stringify(String(input).includes("/api/media-assets?")?{items:[item],nextCursor:null}:{asset:{id:"v1",url:"https://storage.example/v1.mp4"}}),{status:200}));
    try {
      const user=userEvent.setup(),config={modelKey:"video-a",prompt:"Scene",parameters:{}};
      const view=render(<SpaceGenerationPrompt nodeId="node" config={config} modality="video"/>,{wrapper:promptWrapper});
      await user.click(screen.getAllByRole("button",{name:"에셋"})[1]);
      await user.click(await screen.findByRole("button",{name:"selected"}));
      await waitFor(()=>expect(fetcher.mock.calls.some(([input])=>String(input).endsWith("/api/media-assets/selected"))).toBe(true));
      mocks.ids=["replacement-video"];
      view.rerender(<SpaceGenerationPrompt nodeId="node" config={config} modality="video"/>);
      await act(async()=>{resolve(new Response(JSON.stringify({asset:item}),{status:200}));await delayed;});
      expect(mocks.replaceAssets).not.toHaveBeenCalled();
    } finally {fetcher.mockRestore();}
  });
  it("shows the same source-declared six-reference limit and localized label in Space",()=>{
    mocks.videoContract={version:1,apiName:"/generate",inputs:[
      {name:"refs",label:"References (optional, up to 6)",kind:"files",media:"image",default:[],required:false,nullable:false,schema:{type:"array",items:{type:"string"}}}
    ],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true};
    render(<SpaceGenerationPrompt nodeId="node" config={{modelKey:"video-a",prompt:"Keep",parameters:{}}} modality="video"/>,{wrapper:promptWrapper});
    expect(screen.getByLabelText("참조 이미지")).toHaveAttribute("multiple");
    expect(screen.getByLabelText("첨부 개수")).toHaveTextContent("0 / 6");
    expect(screen.queryByText("References (optional, up to 6)")).toBeNull();
    expect(screen.getAllByRole("button",{name:"에셋"})).toHaveLength(1);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(mocks.replaceAssets).not.toHaveBeenCalled();
  });
  it("clears a positional Space audio slot using asset IDs without moving its neighbors",async()=>{
    const user=userEvent.setup();
    mocks.slots=[null,"second"];
    mocks.videoContract={version:1,apiName:"/generate",inputs:[
      {name:"tracks",label:"Tracks",kind:"files",media:"audio",default:[],required:false,nullable:false,
        schema:{type:"array",maxItems:3,items:{anyOf:[{type:"string"},{type:"null"}]}}}
    ],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true};
    const fetcher=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({asset:{id:"second",type:"audio",status:"completed",mimeType:"audio/wav",url:"https://cdn/second.wav"}}),{status:200}));
    try{
      render(<SpaceGenerationPrompt nodeId="node" config={{modelKey:"video-a",prompt:"Keep",parameters:{}}} modality="video"/>,{wrapper:promptWrapper});
      expect(screen.getAllByRole("button",{name:/참조 오디오 · Tracks [123]: 에셋 선택/})).toHaveLength(3);
      await waitFor(()=>expect(screen.getByRole("link",{name:/참조 오디오 · Tracks 2$/})).toHaveAttribute("target","_blank"));
      await user.click(screen.getByRole("button",{name:"제거"}));
      await waitFor(()=>expect(mocks.replaceAssets).toHaveBeenCalledWith("node",expect.objectContaining({ports:["audio-field-tracks"]}),[null,null],{modelKey:"video-a",assetIds:[null,"second"]}));
      expect(mocks.updateConfig).not.toHaveBeenCalled();
    }finally{fetcher.mockRestore();}
  });

  it("routes grouped reference asset selection to its typed Space port using the actual asset ID",async()=>{
    const user=userEvent.setup(),item={id:"video-existing",type:"video",status:"completed",mimeType:"video/mp4",url:"https://storage.example/video.mp4",origin:"upload"};
    mocks.videoContract={version:1,apiName:"/generate",inputs:[
      {name:"text",label:"Prompt",canonical:"prompt",kind:"string",required:true,nullable:false,schema:{type:"string"}},
      ...(["image","video","audio"] as const).map(media=>({name:media,label:media,kind:"files",media,default:[],required:false,nullable:false,schema:{type:"array",items:{type:"string"},maxItems:3}})),
    ],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true};
    const fetcher=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>new Response(JSON.stringify(String(input).includes("/api/media-assets?") ? {items:[item],nextCursor:null} : {asset:item}),{status:200}));
    try {
      render(<SpaceGenerationPrompt nodeId="node" config={{modelKey:"video-a",prompt:"Keep",parameters:{}}} modality="video"/>,{wrapper:promptWrapper});
      expect(screen.getAllByRole("button",{name:"참조 자료 에셋 선택"})).toHaveLength(1);
      await user.click(screen.getByRole("button",{name:"참조 자료 에셋 선택"}));
      await user.click(screen.getByRole("tab",{name:"비디오"}));
      await user.click(await screen.findByRole("button",{name:item.id}));
      await waitFor(()=>expect(mocks.replaceAssets).toHaveBeenCalledWith("node",expect.objectContaining({ports:["video-field-video"]}),[item.id],{modelKey:"video-a",assetIds:[]}));
      expect(mocks.updateConfig).not.toHaveBeenCalled();
    } finally {fetcher.mockRestore();}
  });

  it("removes the English movement chip while preserving the video node source and other settings", async () => {
    const config = { prompt: "My scene", modelKey: null, parameters: { seed: 7 },
      cinema: { ...defaultCinemaSettings(), movement: "snorricam", lighting: "window" } };
    const user = userEvent.setup();
    render(<SpaceGenerationPrompt nodeId="node" config={config} modality="video" />, { wrapper: promptWrapper });
    await user.click(screen.getByRole("button", { name: "프롬프트 편집" }));
    expect(screen.getByRole("textbox", { name: "프롬프트" })).toHaveTextContent("Snorricam");
    await user.click(screen.getByRole("button", { name: "Remove Snorricam" }));
    expect(mocks.updateConfig).toHaveBeenLastCalledWith("node", { ...config, cinema: { ...config.cinema, movement: "auto" } });
  });
  it("stores Cinema beside a connected read-only prompt without replacing the authored source", async () => {
    mocks.promptInput = { connected: true, text: "connected scene" };
    const config = { prompt: "saved scene", modelKey: "image-a", parameters: { width: 640 }, cinema: defaultCinemaSettings() };
    const user = userEvent.setup();
    render(<SpaceGenerationPrompt nodeId="node" config={config} modality="image" />, { wrapper: promptWrapper });
    expect(screen.getByRole("textbox", { name: "프롬프트" })).toHaveAttribute("contenteditable", "false");
    await user.click(screen.getByRole("button", { name: /^카메라:/ }));
    await user.click(screen.getByRole("spinbutton", { name: "카메라" }));
    await user.keyboard("{ArrowDown}");
    expect(mocks.updateConfig).toHaveBeenCalledWith("node", { ...config, cinema: { ...config.cinema, camera: "modular-8k" } });
  });
  it("disables Cinema selection while the node execution is running", () => {
    mocks.running = true;
    render(<SpaceGenerationPrompt nodeId="node" config={{ prompt: "scene", modelKey: "image-a", parameters: {} }} modality="image" />, { wrapper: promptWrapper });
    expect(screen.getByRole("button", { name: /^카메라:/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^비주얼 스타일:/ })).toBeDisabled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  it.each(["video", "audio"] as const)("applies a %s inline preset and preserves user text and canonical state", async modality => {
    const user = userEvent.setup(), config = { prompt: "My idea", modelKey: null, parameters: {} };
    const view = render(<SpaceGenerationPrompt nodeId="node" config={config} modality={modality} />, { wrapper: promptWrapper });
    await user.click(screen.getByRole("button", {name: "프리셋"}));
    await user.click(screen.getByRole("button", {name: new RegExp(modality + " preset")}));
    const applied = mocks.updateConfig.mock.lastCall![1];
    expect(applied).toMatchObject({ prompt: modality + " prompt\n\nMy idea", promptPresetState: {userText: "My idea", tokenOffset: 0} });
    view.rerender(<SpaceGenerationPrompt nodeId="node" config={applied} modality={modality} />);
    expect(screen.getByRole("textbox", {name: "프롬프트"})).toHaveTextContent("My idea");
    expect(screen.queryByText(modality + " prompt")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: new RegExp("제거")}));
    expect(mocks.updateConfig.mock.lastCall![1]).toEqual(config);
  });
  it("shows connected attachment previews and removes an edge without changing the node prompt", async () => {
    mocks.ids=["asset-A","asset-B"];
    const fetcher=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>new Response(JSON.stringify({asset:{url:"/assets/storybook/puppy.jpg"}}),{status:200}));
    try {
      const user=userEvent.setup();
      render(<SpaceGenerationPrompt nodeId="node" config={{modelKey:"image-a",prompt:"Keep",parameters:{}}} modality="image" />,{wrapper:promptWrapper});
      await waitFor(()=>expect(screen.getAllByRole("img")).toHaveLength(2));
      await user.click(screen.getAllByRole("button",{name:"제거"})[0]);
      await waitFor(()=>expect(mocks.replaceAssets).toHaveBeenCalledWith("node",expect.objectContaining({limit:2,ports:["primary","references"]}),["asset-B"],{modelKey:"image-a",assetIds:["asset-A","asset-B"]}));
      expect(mocks.updateConfig).not.toHaveBeenCalled();
    } finally {fetcher.mockRestore();}
  });
  it("disables prompt and attachment changes in a read-only Space", () => {
    mocks.writable=false;
    render(<SpaceGenerationPrompt nodeId="node" config={{modelKey:"image-a",prompt:"Keep",parameters:{}}} modality="image" />,{wrapper:promptWrapper});
    expect(screen.getByRole("textbox",{name:"프롬프트"})).toHaveAttribute("contenteditable","false");
    expect(screen.getByRole("button",{name:/참조 이미지:.*파일 추가/})).toBeDisabled();
    expect(screen.getByRole("button",{name:"프리셋"})).toBeDisabled();
  });
  it("rehydrates a token between paragraphs, clears only its body and never guesses legacy text", () => {
    const preset = presetFixtures[0], base = {parameters: {width:640}};
    const config = writeNodePromptPreset(base, "앞뒤", preset, "작업 본문", 1);
    expect(config.prompt).toBe("앞\n\n작업 본문\n\n뒤");
    expect(hydrateNodePromptPreset(JSON.parse(JSON.stringify(config)), "image")).toMatchObject({text:"앞뒤", body:"작업 본문",offset:1,preset:{key:preset.key}});
    expect(writeNodePromptPreset(config,"앞뒤",null)).toEqual({parameters:{width:640},prompt:"앞뒤"});
    expect(hydrateNodePromptPreset({...config,prompt:"기존 편집 문자열"},"image")).toMatchObject({preset:null,text:"기존 편집 문자열"});
    expect(composeNodePresetPrompt("앞뒤", "작업 본문", 1)).toBe(config.prompt);
  });
  it("renders the connected prompt read-only and restores the persisted inline draft after disconnection", () => {
    mocks.promptInput={connected:true,text:"연결된 문구"};
    const preset = presetFixtures[0];
    const config = { prompt: "개인 저장본", modelKey: null, parameters: {}, promptPreset: promptPresetReference(preset),
      promptPresetState:{name:preset.name,appliedPrompt:"개인 저장본"}};
    const view = render(<SpaceGenerationPrompt nodeId="node" config={config} modality="image" connected connectedValue="연결된 문구" />, {wrapper:promptWrapper});
    const editor = screen.getByRole("textbox", {name:"프롬프트"});
    expect(editor).toHaveTextContent("연결된 문구");
    expect(editor).toHaveAttribute("contenteditable","false");
    expect(screen.queryByText("캐릭터 시트")).not.toBeInTheDocument();
    mocks.promptInput={connected:false,text:null};
    view.rerender(<SpaceGenerationPrompt nodeId="node" config={config} modality="image" />);
    expect(screen.getByText(/^캐릭터 시트/)).toBeVisible();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ids = [];
    mocks.slots = [];
    mocks.writable = true;
    mocks.running = false;
    mocks.maxInputImages = 2;
    mocks.videoSupportsInitImage = true;
    mocks.videoContract = null;
    mocks.promptInput = { connected: false, text: null };
  });

  it("uses one compact anatomy for Image, Video, and Audio and never expands on selection", () => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node("image", true)}
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("make image")).toBeInTheDocument();
    expect(screen.getByText("execution-compact")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(view.container.querySelector("[data-generation-node]")).toHaveAttribute("data-generation-media", "image");
  });

  it("keeps the full section order and geometry identical across all generation media", () => {
    const view = renderNodes();
    screen.getAllByRole("button", { name: "Expand editor" }).forEach((button) => fireEvent.click(button));

    const articles = Array.from(view.container.querySelectorAll<HTMLElement>("[data-generation-node]"));
    expect(articles).toHaveLength(3);
    const anatomy = (article: HTMLElement) => Array.from(
      article.querySelectorAll<HTMLElement>("[data-generation-section]"),
      (section) => section.dataset.generationSection,
    );
    expect(anatomy(articles[0])).toEqual(["header", "authoring", "prompt", "model", "parameters", "execution"]);
    expect(anatomy(articles[1])).toEqual(anatomy(articles[0]));
    expect(anatomy(articles[2])).toEqual(anatomy(articles[0]));
    expect(articles.map((article) => article.className)).toEqual([
      articles[0].className,
      articles[0].className,
      articles[0].className,
    ]);

    const promptClasses = articles.map((article) => within(article).getByRole("textbox").className);
    expect(promptClasses).toEqual([promptClasses[0], promptClasses[0], promptClasses[0]]);
    for (const article of articles) {
      expect(within(article).getByRole("button", { name: /Model/i })).toBeInTheDocument();
      expect(within(article).getByRole("button", { name: /Parameters/i })).toBeInTheDocument();
    }
  });

  it("keeps only capability-supported media inputs while preserving the same labels", () => {
    const view = renderNodes();
    const articles = Array.from(view.container.querySelectorAll<HTMLElement>("[data-generation-node]"));
    expect(within(articles[0]).getAllByLabelText("Image")).toHaveLength(2);
    expect(within(articles[1]).getByLabelText("Image")).toBeInTheDocument();
    expect(within(articles[2]).queryByLabelText("Image")).not.toBeInTheDocument();
    for (const article of articles) expect(within(article).getByLabelText("Prompt")).toBeInTheDocument();
  });

  it("uses the same config adapter and catalog-driven defaults for image authoring", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GenerationNode
          id="node-image"
          data={{ ...data("image"), config: { prompt: "new image", modelKey: null, parameters: {} } }}
          selected={false}
          type="generationNode"
          dragging={false}
          draggable
          selectable
          deletable
          zIndex={0}
          isConnectable
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand editor" }));
    fireEvent.click(screen.getByRole("button", { name: /Model/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Image A/ }));

    expect(mocks.updateConfig).toHaveBeenCalledWith("node-image", expect.objectContaining({
      prompt: "new image",
      modelKey: "image-a",
      parameters: expect.objectContaining({ width: 1024 }),
    }));
  });

  it("disables the internal editor and uses a connected Prompt node without destroying the internal draft", () => {
    mocks.promptInput = { connected: true, text: "prompt from node" };
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node("image")}
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand editor" }));

    const promptEditor = screen.getByRole("textbox");
    expect(promptEditor).toBeDisabled();
    expect(promptEditor).toHaveValue("prompt from node");
    expect(screen.getByRole("textbox", { name: "Prompt from connected Prompt node" })).toBeDisabled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();

    mocks.promptInput = { connected: false, text: null };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node("image")}
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("textbox")).toBeEnabled();
    expect(screen.getByRole("textbox")).toHaveValue("make image");
  });

  it.each([
    ["image", "Width"],
    ["video", "Duration"],
    ["audio", "Speed"],
  ] as const)("opens the same Parameters popover for %s", async (mediaType, parameterLabel) => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        {node(mediaType)}
      </NextIntlClientProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Expand editor" }));
    await user.click(screen.getByRole("button", { name: /Parameters/i }));

    expect(screen.getByRole("spinbutton", { name: parameterLabel })).toBeInTheDocument();
  });
});
