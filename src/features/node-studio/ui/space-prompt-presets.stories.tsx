import { useState } from "react";
import { CanvasProviders } from "@/shared/ui/canvas-providers";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { authoringValuesToImageConfig, resolveImageAuthoringDefaults } from "@/shared/generation/image-authoring";
import { resolveRuntimeImageMaxInputImages } from "@/shared/model-catalog/runtime-utils";
import { applyNodePromptPreset } from "../model/node-prompt-presets";
import { NodeBananaStudio } from "./node-banana-studio";
import type { GenerationGraphSnapshotDto } from "../model/graph-types";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { NodeAuthoringProvider } from "../model/node-authoring-context";
import { emptyImageNodeInputReadiness } from "../model/node-input-readiness";
import { ImagePresetInspector, GenerationPresetInspector } from "./nodes/space-generation-control-panel";
import type { PromptPreset } from "@/shared/prompt-presets/prompt-preset-contract";
import { storybookImage } from "@/test-utils/fixtures/storybook-media";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { appendResultNodes, bindResultNodes, reconcileResultNodes, resultSource } from "../model/generation-result-nodes";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import { canonicalNodeKinds, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { defaultConfigForKind } from "../runtime/node-banana/node-banana-runtime-adapter";

const presets = builtinPromptPresets.map(p => ({ ...p, builtinKey: p.key, builtinRevision: p.revision, defaultPrompt: p.prompt, isActive: true, isModified: false }));
const model = { ...runtimeImageModelsFixture[0], meta: { ...runtimeImageModelsFixture[0].meta, max_input_images: 1 } };
const catalog = { imageModels: [model], isLoading: false, error: null, retry: () => undefined };
const baseConfig = authoringValuesToImageConfig(resolveImageAuthoringDefaults(model), model);
const initial: GenerationGraphSnapshotDto = {
  id: "preset-preview", title: "Prompt presets", version: 1, schemaVersion: 3, minimumWriterVersion: 3, groups: [], edges: [],
  nodes: presets.map((preset, index) => ({ id: "preset-" + index, kind: "generate.image", configVersion: 1,
    config: { ...applyNodePromptPreset(baseConfig, preset, model).config, presentation: { customTitle: preset.name } } as CanonicalJsonValue,
    position: { x: 80 + index * 650, y: 80 }, selectedOutputAssetId: null })),
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
};
function PresetPreview({ inspector = false }: { inspector?: boolean }) {
  const [client] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity } } });
    client.setQueryData(["prompt-presets", "image", false], presets);
    return client;
  });
  const [graph, setGraph] = useState(initial);
  const [config, setConfig] = useState<Record<string, unknown>>({ ...baseConfig, prompt: "현재 작업 초안" });
  return <QueryClientProvider client={client}><main className="flex h-screen min-w-0 flex-col bg-neutral-900 text-white">
    {inspector ? <NodeAuthoringProvider value={{ ...catalog, graphId: graph.id, prepareImageNodeExecution: async () => 1,
      getImageNodeInputReadiness: emptyImageNodeInputReadiness, updateImageNodeConfig: () => undefined, duplicateImageNode: () => undefined,
      deleteImageNode: () => undefined, updateCanonicalNodeConfig: (_id, next) => setConfig(next as Record<string, unknown>) }}>
      <ImagePresetInspector id="image" config={config} />
    </NodeAuthoringProvider> : <NodeBananaStudio graph={graph} catalog={catalog} writable readOnlyReason={null}
      resolveUpstreamNodeData={(_id, data) => ({ supportsImageInput: resolveRuntimeImageMaxInputImages(catalog.imageModels.find(m => m.key === (data.config as Record<string, unknown>)?.modelKey)) > 0 })}
      prepareImageNodeExecution={async () => 1} onDraftChange={draft => setGraph(old => ({ ...old, ...draft, version: old.version + 1 }))}
      onRegenerateNode={async () => undefined} />}
  </main></QueryClientProvider>;
}
const meta = { title: "Features/Node Studio/Prompt Presets", component: PresetPreview, decorators: [(Story) => <CanvasProviders><section data-testid="node-banana-home" className="fixed inset-0 z-[100] flex flex-col"><Story /></section></CanvasProviders>], parameters: { layout: "fullscreen" } } satisfies Meta<typeof PresetPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Canvas: Story = {};
export const Inspector: Story = { args: { inspector: true } };

function ModePreview({ modality, reference, inspector = false }: { modality: "image" | "video" | "audio"; reference: boolean; inspector?: boolean }) {
  const preset: PromptPreset = { key: "personal-mode", revision: 1, name: "Mode preset", description: "",
    modality, prompt: "Create a scene", requiredInputs: { referenceImageCount: reference ? 1 : 0 }, recommendedParameters: {},
    builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false };
  const [client] = useState(() => {
    const query = new QueryClient({ defaultOptions: { queries: { enabled: false, staleTime: Infinity } } });
    query.setQueryData(["prompt-presets", modality, false], [preset]); return query;
  });
  const [config, setConfig] = useState<Record<string, unknown>>(applyNodePromptPreset({ prompt: "", modelKey: null, parameters: {} }, preset).config);
  const modeGraph: GenerationGraphSnapshotDto = { ...initial, nodes: [{
    id: "mode", kind: "generate." + modality, configVersion: 1, position: { x: 80, y: 80 },
    config: config as CanonicalJsonValue, selectedOutputAssetId: null,
  }], edges: [] };
  return <QueryClientProvider client={client}><main className="flex h-screen min-w-0 flex-col bg-neutral-900 text-white">
    {inspector ? <NodeAuthoringProvider value={{ ...catalog, graphId: "mode", prepareImageNodeExecution: async () => 1,
      getImageNodeInputReadiness: emptyImageNodeInputReadiness, updateImageNodeConfig: () => undefined,
      duplicateImageNode: () => undefined, deleteImageNode: () => undefined,
      updateCanonicalNodeConfig: (_id, next) => setConfig(next as Record<string, unknown>) }}>
      <GenerationPresetInspector id="mode" modality={modality} config={config} />
    </NodeAuthoringProvider> : <NodeBananaStudio graph={modeGraph} catalog={catalog} writable readOnlyReason={null}
      prepareImageNodeExecution={async () => 1} onDraftChange={() => undefined} onRegenerateNode={async () => undefined} />}
  </main></QueryClientProvider>;
}
export const T2I: Story = { render: () => <ModePreview modality="image" reference={false} /> };
export const I2I: Story = { render: () => <ModePreview modality="image" reference /> };
export const T2V: Story = { render: () => <ModePreview modality="video" reference={false} /> };
export const I2V: Story = { render: () => <ModePreview modality="video" reference /> };
export const T2A: Story = { render: () => <ModePreview modality="audio" reference={false} /> };
export const VideoInspector: Story = { render: () => <ModePreview modality="video" reference inspector /> };
export const AudioInspector: Story = { render: () => <ModePreview modality="audio" reference={false} inspector /> };

function SharedComposerPreview({ modality = "image", readOnly = false, connected = false, compact = false, repeatCount = 1, progress }: {
  modality?: "image" | "video" | "audio"; readOnly?: boolean; connected?: boolean; compact?: boolean; repeatCount?: number; progress?: {completed:number;failed:number;total:number;running:boolean};
}) {
  const previewModel: RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel = {
    type: modality, key: "preview-" + modality, label: "Preview model", vendor: "Storybook", provider: "hf_space",
    isActive: true, isDefault: true, meta: {},
    providerConfig: { space_id: "preview/only", api_name: "/predict", output: { media: modality, path: [0], multiple: false } },
    parameters: {
      prompt: { ui:"text", binding:{source:"hf_space",parameterName:"prompt",valueType:"string",canonicalKey:"prompt",order:0} },
      references: { ui:"upload",label:"참고 이미지",required:false,kind:"files",maxItems:4,
        binding:{source:"hf_space",parameterName:"references",valueType:"file",order:1,kind:"files",media:"image",schema:{maxItems:4}} },
    },
  };
  const previewPresets = modality === "image" ? presets : [{ ...presets[1], key: "preview-preset", modality, requiredInputs: {referenceImageCount:0}, name:"Preview preset",prompt:"Create a scene" }];
  const [client] = useState(() => {
    const query = new QueryClient({ defaultOptions:{queries:{enabled:false,staleTime:Infinity}} });
    query.setQueryData(["prompt-presets",modality,false],previewPresets);
    for (const id of ["reference-1","reference-2"]) query.setQueryData(mediaAssetKeys.detail(id), {
      id,version:1,type:"image",status:"completed",origin:"upload",mimeType:"image/jpeg",bytes:"1024",
      width:640,height:462,durationMs:null,sourceOperationId:null,url:storybookImage.url,
      createdAt:initial.createdAt,updatedAt:initial.updatedAt,
    });
    return query;
  });
  const [snapshot,setSnapshot] = useState<GenerationGraphSnapshotDto>(() => ({...initial, nodes:[
    ...["reference-1","reference-2"].map((assetId,index) => ({ id:assetId,kind:"input.image",configVersion:1,config:{assetId},
      position:{x:-600,y:index*320},selectedOutputAssetId:null })),
    ...(connected ? [{id:"connected-prompt",kind:"input.prompt",configVersion:1,config:{text:"Connected prompt"},position:{x:-600,y:680},selectedOutputAssetId:null}] : []),
    {id:"generation",kind:"generate." + modality,configVersion:1,
      config:applyNodePromptPreset({prompt:"",modelKey:previewModel.key,parameters:{},...(modality==="image"?{repeatCount}:{}),presentation:{customTitle:compact?"Compact preview":"Shared prompt preview"}},previewPresets[0]).config as CanonicalJsonValue,
      position:{x:32,y:64},selectedOutputAssetId:null },
  ],edges:[
    ...["reference-1","reference-2"].map((sourceNodeId,sortOrder)=>({id:"reference-edge-"+sortOrder,sourceNodeId,sourcePortId:"image",targetNodeId:"generation",targetPortId:"image-field-references",sortOrder})),
    ...(connected ? [{id:"prompt-edge",sourceNodeId:"connected-prompt",sourcePortId:"text",targetNodeId:"generation",targetPortId:"prompt",sortOrder:0}] : []),
  ]}));
  const previewCatalog = { ...catalog, imageModels: previewModel.type==="image"?[previewModel]:[],
    videoModels:previewModel.type==="video"?[previewModel]:[],audioModels:previewModel.type==="audio"?[previewModel]:[] };
  return <QueryClientProvider client={client}><div className="flex h-screen flex-col bg-neutral-900">
    <NodeBananaStudio graph={snapshot} catalog={previewCatalog} writable={!readOnly} readOnlyReason={readOnly?"Preview read-only":null}
      prepareImageNodeExecution={async()=>1} onDraftChange={draft=>setSnapshot(previous=>({...previous,...draft,version:previous.version+1}))}
      onRegenerateNode={async()=>undefined} resolveUpstreamNodeData={(_id,data)=> data.canonicalKind==="input.image"
        ? {image:storybookImage.url,imageRef:storybookImage.url} : modality==="image" ? {outputImage:storybookImage.url,repeatProgress:progress,executionStatus:progress?.running?"processing":"completed"} : {} } />
  </div></QueryClientProvider>;
}
export const SharedImageComposer: Story = {render:()=> <SharedComposerPreview />};
export const SharedVideoComposer: Story = {render:()=> <SharedComposerPreview modality="video" />};
export const SharedAudioComposer: Story = {render:()=> <SharedComposerPreview modality="audio" />};
export const SharedReadOnly: Story = {render:()=> <SharedComposerPreview readOnly />};
export const SharedConnected: Story = {render:()=> <SharedComposerPreview connected />};
export const SharedCompact: Story = {render:()=> <SharedComposerPreview compact />};

export const SharedRepeatFour: Story = {render:()=> <SharedComposerPreview repeatCount={4} />};
export const SharedRepeatPartial: Story = {render:()=> <SharedComposerPreview repeatCount={4} progress={{completed:3,failed:1,total:4,running:true}} />};
export const SharedRepeatCompleted: Story = {render:()=> <SharedComposerPreview repeatCount={4} progress={{completed:4,failed:1,total:4,running:false}} />};

function SeparateResultsPreview({ modality = "image", status = "idle" }: {
  modality?: "image" | "video" | "audio"; status?: "idle" | "pending" | "completed" | "failed" | "cancelled";
}) {
  const sampleUrl = modality === "image" ? storybookImage.url : modality === "video" ? "/assets/storybook/puppy.mp4" : "/assets/storybook/tone.wav";
  const previewModel = { ...model, type: modality, key: "separate-" + modality, label: "Storybook model", provider:"hf_space",meta:{max_input_images:0},
    providerConfig:{space_id:"preview/only",api_name:"/predict",output:{media:modality,path:[0],multiple:false}},parameters:{
      prompt:{ui:"text",binding:{source:"hf_space",parameterName:"prompt",valueType:"string",canonicalKey:"prompt",order:0}},
    }} as RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel;
  const [client] = useState(() => {
    const query = new QueryClient({defaultOptions:{queries:{enabled:false,staleTime:Infinity}}});
    query.setQueryData(["prompt-presets","image",false],presets);
    for (const media of ["video", "audio"] as const) query.setQueryData(["prompt-presets",media,false],[
      { ...presets[1], key: "separate-" + media + "-preset", modality: media, name: "Preview preset",
        builtinKey: null, requiredInputs: { referenceImageCount: 0 } },
    ]);
    query.setQueryData(["runtime-models"],[previewModel]);
    return query;
  });
  const [phase,setPhase] = useState(status);
  const [snapshot,setSnapshot] = useState<GenerationGraphSnapshotDto>(() => {
    const draft = { ...initial,schemaVersion:3 as const,minimumWriterVersion:3 as const,groups:[],edges:[],nodes:[{
      id:"generation",kind:`generate.${modality}`,configVersion:1,position:{x:40,y:40},selectedOutputAssetId:null,
      config:{prompt:"Describe a cinematic scene",modelKey:previewModel.key,parameters:{},presentation:{customTitle:"Generation input"}},
    }] };
    if(status === "idle") return draft;
    const appended = appendResultNodes(draft,"generation","preview-run");
    return status === "pending" ? {...draft,...appended.draft} : {...draft,...reconcileResultNodes(appended.draft,"generation",{
      executionId:"preview-run",status,outputAssetIds:status === "completed"?["sample-output"]:[],
    })};
  });
  const previewCatalog = { ...catalog,imageModels:previewModel.type === "image"?[previewModel]:[],
    videoModels:previewModel.type === "video"?[previewModel]:[],audioModels:previewModel.type === "audio"?[previewModel]:[] };
  return <QueryClientProvider client={client}><main className="flex h-screen flex-col bg-neutral-900" data-story-result-preview={modality}>
    <NodeBananaStudio graph={snapshot} catalog={previewCatalog} writable readOnlyReason={null} prepareImageNodeExecution={async()=>1}
      onDraftChange={draft=>setSnapshot(previous=>({...previous,...draft,version:previous.version+1}))}
      onRegenerateNode={async nodeId => {
        const appended = appendResultNodes({...snapshot,schemaVersion:3,groups:snapshot.groups??[]},nodeId,crypto.randomUUID());
        const executionId = resultSource(appended.draft.nodes.find(node=>node.id===appended.ids[0])?.config)!.executionId!;
        setSnapshot(previous=>({...previous,...bindResultNodes(appended.draft,appended.ids,executionId)}));setPhase("pending");
        return {executionId,completion:new Promise<void>(resolve=>setTimeout(()=>{
          setSnapshot(previous=>({...previous,...reconcileResultNodes({...previous,schemaVersion:3,groups:previous.groups??[]},nodeId,{
            executionId,status:"completed",outputAssetIds:["sample-output"],
          })}));setPhase("completed");resolve();
        },2000))};
      }}
      resolveUpstreamNodeData={(id,data)=> {
        if(id === "generation") return { executionStatus: phase === "pending" ? "processing" : phase === "idle" ? undefined : phase,
          supportsImageInput:false,providerInputSchema:[],outputImage:phase==="completed"?sampleUrl:null,outputVideo:phase==="completed"?sampleUrl:null };
        const source = resultSource(data.config);
        const assetId = (data.config as {assetId?:string}).assetId;
        return source ? {resultStatus:source.state,resultProgress:source.state==="pending"?35:100,
          image:assetId?sampleUrl:null,imageRef:assetId??null,video:assetId?sampleUrl:null,videoRef:assetId??null,
          audioFile:assetId?sampleUrl:null,audioFileRef:assetId??null,filename:assetId?"Storybook sample":null,duration:2,
          dimensions:modality==="audio"?null:{width:640,height:462}} : {};
      }} />
  </main></QueryClientProvider>;
}
export const SeparateImageResults: Story = {render:()=> <SeparateResultsPreview />};
export const SeparateVideoResults: Story = {render:()=> <SeparateResultsPreview modality="video" />};
export const SeparateAudioResults: Story = {render:()=> <SeparateResultsPreview modality="audio" />};
export const SeparateImagePending: Story = {render:()=> <SeparateResultsPreview status="pending" />};
export const SeparateVideoPending: Story = {render:()=> <SeparateResultsPreview modality="video" status="pending" />};
export const SeparateAudioPending: Story = {render:()=> <SeparateResultsPreview modality="audio" status="pending" />};
export const SeparateImageCompleted: Story = {render:()=> <SeparateResultsPreview status="completed" />};
export const SeparateVideoCompleted: Story = {render:()=> <SeparateResultsPreview modality="video" status="completed" />};
export const SeparateAudioCompleted: Story = {render:()=> <SeparateResultsPreview modality="audio" status="completed" />};

function SelectionStylePreview() {
  const [kind, setKind] = useState<CanonicalNodeKind>("generate.image");
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }));
  const media = kind === "input.image" ? "image" : kind === "input.video" ? "video" : kind === "input.audio" ? "audio" : null;
  const sampleUrl = media === "image" ? storybookImage.url : media === "video" ? "/assets/storybook/puppy.mp4" : "/assets/storybook/tone.wav";
  const config = media ? { assetId: "preview-media" } : defaultConfigForKind(kind);
  const graph: GenerationGraphSnapshotDto = { ...initial, id: "selection-preview", edges: [], nodes: [
    { id: "style-node", kind, configVersion: 1, config, selectedOutputAssetId: null, position: { x: 80, y: 80 } },
  ] };
  return <QueryClientProvider client={client}>
    <label className="absolute left-4 top-4 z-100 flex items-center gap-2 rounded bg-neutral-800 p-2 text-white">
      노드 선택 스타일
      <select aria-label="검증할 노드" value={kind} onChange={event => setKind(event.target.value as CanonicalNodeKind)}>
        {canonicalNodeKinds.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <div className="flex h-screen flex-col" data-preview-kind={kind}>
      <NodeBananaStudio key={kind} graph={graph} catalog={catalog} writable readOnlyReason={null}
        prepareImageNodeExecution={async () => 1} onDraftChange={() => undefined}
        resolveUpstreamNodeData={() => media ? { image: sampleUrl, video: sampleUrl, audioFile: sampleUrl, filename: "Storybook sample", duration: 2 } : {}}
      />
    </div>
  </QueryClientProvider>;
}
export const SelectionStyles: Story = { render: () => <SelectionStylePreview /> };
export const SeparateResultFailed: Story = {render:()=> <SeparateResultsPreview status="failed" />};
export const SeparateResultCancelled: Story = {render:()=> <SeparateResultsPreview status="cancelled" />};

function InputUXCanvas({ media, readOnly = false, overlap = false }: {
  media: "image" | "video" | "audio"; readOnly?: boolean; overlap?: boolean;
}) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } }));
  const sampleUrl = media === "image" ? storybookImage.url : media === "video" ? "/assets/storybook/puppy.mp4" : "/assets/storybook/tone.wav";
  const [snapshot, setSnapshot] = useState<GenerationGraphSnapshotDto>(() => {
    const nodes: GenerationGraphSnapshotDto["nodes"] = [
    { id: "source", kind: "input." + media, configVersion: 1, config: { assetId: "sample", presentation: { customTitle: "Back source" } },
      position: overlap ? { x: 80, y: 180 } : { x: 40, y: 80 }, selectedOutputAssetId: null },
    { id: "target", kind: "input." + media, configVersion: 1, config: { assetId: "sample",
      resultSource: { nodeId: "source", portId: media, index: 0, executionId: "preview", state: "completed" },
      presentation: { customTitle: "Target" } }, position: { x: 720, y: 80 }, selectedOutputAssetId: null },
    ];
    if (overlap) nodes.push({ id: "front", kind: "note.memo", configVersion: 1, config: { text: "Front node", size: { width: 560, height: 440 } },
      position: { x: 60, y: 100 }, selectedOutputAssetId: null });
    return { ...initial, id: "input-ux", nodes, edges: [{ id: "input-edge", sourceNodeId: "source", sourcePortId: media, targetNodeId: "target",
      targetPortId: media === "image" ? "reference" : media, sortOrder: 0 }] };
  });
  return <QueryClientProvider client={client}><div className="flex h-screen flex-col" data-story-input-ux={media}>
    <NodeBananaStudio graph={snapshot} catalog={catalog} writable={!readOnly} readOnlyReason={readOnly ? "READ_ONLY" : null}
      prepareImageNodeExecution={async () => 1} onDraftChange={draft => setSnapshot(previous => ({ ...previous, ...draft, version: previous.version + 1 }))}
      resolveUpstreamNodeData={(_id, data) => (data.config as Record<string, unknown>)?.assetId
        ? { image: sampleUrl, video: sampleUrl, audioFile: sampleUrl, filename: "Sample", duration: 2 } : {}}
    />
    <output data-story-graph="" className="hidden">{JSON.stringify(snapshot)}</output>
  </div></QueryClientProvider>;
}
function InputUXPreview() {
  const [media, setMedia] = useState<"image" | "video" | "audio">("image");
  const [readOnly, setReadOnly] = useState(false), [overlap, setOverlap] = useState(false);
  return <>
    <div className="absolute left-4 top-4 z-100 flex gap-3 rounded bg-neutral-800 p-2 text-white">
      <select aria-label="입력 매체" value={media} onChange={event => setMedia(event.target.value as typeof media)}>
        {["image", "video", "audio"].map(value => <option key={value}>{value}</option>)}
      </select>
      <label><input type="checkbox" checked={readOnly} onChange={event => setReadOnly(event.target.checked)} />읽기 전용</label>
      <label><input type="checkbox" checked={overlap} onChange={event => setOverlap(event.target.checked)} />겹침</label>
    </div>
    <InputUXCanvas key={media + readOnly + overlap} media={media} readOnly={readOnly} overlap={overlap} />
  </>;
}
export const InputInteractions: Story = { render: () => <InputUXPreview /> };
