import { useEffect, useMemo, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient } from "@tanstack/react-query";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import type { PromptPreset } from "@/shared/prompt-presets/prompt-preset-contract";
import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { authoringValuesToImageConfig, resolveImageAuthoringDefaults } from "@/shared/generation/image-authoring";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { canonicalNodeKinds, findNodeDefinition, type CanonicalNodeKind } from "@/shared/generation-graph/node-registry";
import { isUnavailableEditNodeKind } from "@/shared/generation-graph/node-availability";
import { defaultConfigForKind } from "@/shared/generation-graph/node-default-config";
import type { RuntimeImageModel, RuntimeVideoModel, RuntimeAudioModel } from "@/shared/model-catalog/runtime-utils";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { AppToaster } from "@/shared/ui/app-toast";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import { applyNodePromptPreset } from "../model/node-prompt-presets";
import { appendResultNodes, bindResultNodes, reconcileResultNodes } from "../model/generation-result-nodes";
import { projectGenerationModelSelectionDefaults } from "../model/generation-model-selection-defaults";
import type { NodeExecutionDto } from "../model/node-execution-types";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { SpaceEditor } from "./space-editor";
import { NativeStoryProviders, storyDate, storyMediaAsset, useStoryDocument } from "./native-story-fixtures";

type Modality = "image" | "video" | "audio";
const presets = builtinPromptPresets.map(preset => ({ ...preset, builtinKey: preset.key, builtinRevision: preset.revision,
  defaultPrompt: preset.prompt, isActive: true, isModified: false }));
const model = { ...runtimeImageModelsFixture[0], meta: { ...runtimeImageModelsFixture[0].meta, max_input_images: 1 } };
const catalog = { imageModels: [model], isLoading: false, error: null, retry: () => {} };
const baseConfig = authoringValuesToImageConfig(resolveImageAuthoringDefaults(model), model);

function presetClient(modality: Modality, entries: PromptPreset[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const media of ["image", "video", "audio"] as const) client.setQueryData(["prompt-presets", media, false], media === modality ? entries : []);
  return client;
}

/** Declared model contracts drive native fields, defaults, ports and the model browser. */
function composerModel(modality: Modality): RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel {
  return { type: modality, key: "preview-" + modality, label: "Preview " + modality, vendor: "Storybook", provider: "hf_space",
    isActive: true, isDefault: true, meta: {}, parameters: {},
    providerConfig: { space_id: "preview/only", gradio_contract: { version: 1, apiName: "/predict", reviewed: true, diagnostics: [],
      output: { media: modality, path: [0], multiple: false }, inputs: [
        { name: "prompt", label: "Prompt", kind: "string", required: true, nullable: false, canonical: "prompt", schema: { type: "string", minLength: 1 } },
        { name: "references", label: "참고 이미지", kind: "files", media: "image", required: false, nullable: false, default: [], schema: { type: "array", maxItems: 4 } },
        { name: "seed", label: "Seed", kind: "number", required: false, nullable: false, default: 0, schema: { type: "integer", minimum: 0 } },
      ] } },
  };
}
function modalityCatalog(previewModel: ReturnType<typeof composerModel>) {
  return { ...catalog, imageModels: previewModel.type === "image" ? [previewModel] : [],
    videoModels: previewModel.type === "video" ? [previewModel] : [], audioModels: previewModel.type === "audio" ? [previewModel] : [] };
}
function generationConfig(previewModel: ReturnType<typeof composerModel>, prompt: string) {
  return projectGenerationModelSelectionDefaults({}, { ...defaultConfigForKind(`generate.${previewModel.type}`), prompt,
    modelKey: previewModel.key, parameters: {} }, [previewModel]);
}

function PresetPreview({ inspector = false }: { inspector?: boolean }) {
  return <PresetCanvas key={String(inspector)} inspector={inspector} />;
}
function PresetCanvas({ inspector }: { inspector: boolean }) {
  const [client] = useState(() => presetClient("image", presets));
  const [session] = useState(() => {
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Prompt presets", groups: [], edges: [], nodes: inspector ? [
      { id: "image", kind: "generate.image", configVersion: 1, config: { ...baseConfig, prompt: "현재 작업 초안" } as CanonicalJsonValue,
        position: { x: 80, y: 80 }, selectedOutputAssetId: null },
    ] : presets.map((preset, index) => ({ id: "preset-" + index, kind: "generate.image", configVersion: 1,
      config: { ...applyNodePromptPreset(baseConfig, preset, model).config, presentation: { customTitle: preset.name } } as CanonicalJsonValue,
      position: { x: 80 + index * 650, y: 80 }, selectedOutputAssetId: null })) };
    const value = createSpaceEditorSession({ id: "preset-preview", version: 1, document });
    if (inspector) value.select(["image"]);
    return value;
  });
  const graph = useStoryDocument(session);
  return <NativeStoryProviders client={client} graphId="preset-preview" inlineParametersEnabled={!inspector}>
    <main className="relative h-screen min-w-0 bg-neutral-900 text-white"><SpaceEditor session={session} catalog={catalog} />
      <output hidden data-story-graph>{JSON.stringify(graph)}</output><AppToaster />
    </main>
  </NativeStoryProviders>;
}
const meta = { title: "Features/Node Studio/Prompt Presets", component: PresetPreview, parameters: { layout: "fullscreen" } } satisfies Meta<typeof PresetPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Canvas: Story = {};
export const Inspector: Story = { args: { inspector: true } };

function ModePreview({ modality, reference, inspector = false }: { modality: Modality; reference: boolean; inspector?: boolean }) {
  const previewModel = useMemo(() => composerModel(modality), [modality]);
  const preset: PromptPreset = { key: "personal-mode", revision: 1, name: "Mode preset", description: "", modality, prompt: "Create a scene",
    requiredInputs: { referenceImageCount: reference ? 1 : 0 }, recommendedParameters: {}, builtinKey: null, builtinRevision: null,
    defaultPrompt: null, isActive: true, isModified: false };
  const [client] = useState(() => presetClient(modality, [preset]));
  const [session] = useState(() => {
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Preset input modes", groups: [], edges: [], nodes: [
      { id: "mode", kind: `generate.${modality}`, configVersion: 1, position: { x: 80, y: 80 },
        config: applyNodePromptPreset(generationConfig(previewModel, ""), preset, previewModel).config as CanonicalJsonValue, selectedOutputAssetId: null },
    ] };
    const value = createSpaceEditorSession({ id: "mode-preview", version: 1, document });
    if (inspector) value.select(["mode"]);
    return value;
  });
  const graph = useStoryDocument(session);
  return <NativeStoryProviders client={client} graphId="mode-preview" inlineParametersEnabled={!inspector}>
    <main className="relative h-screen min-w-0 bg-neutral-900 text-white"><SpaceEditor session={session} catalog={modalityCatalog(previewModel)} />
      <output hidden data-story-graph>{JSON.stringify(graph)}</output>
    </main>
  </NativeStoryProviders>;
}
export const T2I: Story = { render: () => <ModePreview modality="image" reference={false} /> };
export const I2I: Story = { render: () => <ModePreview modality="image" reference /> };
export const T2V: Story = { render: () => <ModePreview modality="video" reference={false} /> };
export const I2V: Story = { render: () => <ModePreview modality="video" reference /> };
export const T2A: Story = { render: () => <ModePreview modality="audio" reference={false} /> };
export const VideoInspector: Story = { render: () => <ModePreview modality="video" reference inspector /> };
export const AudioInspector: Story = { render: () => <ModePreview modality="audio" reference={false} inspector /> };

function SharedComposerPreview({ modality = "image", readOnly = false, connected = false, compact = false, repeatCount = 1, progress }: {
  modality?: Modality; readOnly?: boolean; connected?: boolean; compact?: boolean; repeatCount?: number;
  progress?: { completed: number; failed: number; total: number; running: boolean };
}) {
  const previewModel = useMemo(() => composerModel(modality), [modality]);
  const previewPresets = modality === "image" ? presets : [{ ...presets[1], key: "preview-preset", modality,
    builtinKey: null, builtinRevision: null, requiredInputs: { referenceImageCount: 0 }, name: "Preview preset", prompt: "Create a scene" }];
  const [client] = useState(() => {
    const value = presetClient(modality, previewPresets);
    for (const id of ["reference-1", "reference-2"]) value.setQueryData(mediaAssetKeys.detail(id), storyMediaAsset(id, "image"));
    return value;
  });
  const [session] = useState(() => {
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Shared prompt composer", groups: [], nodes: [
      ...["reference-1", "reference-2"].map((assetId, index) => ({ id: assetId, kind: "input.image", configVersion: 1, config: { assetId },
        position: { x: -600, y: index * 320 }, selectedOutputAssetId: null })),
      ...(connected ? [{ id: "connected-prompt", kind: "input.prompt", configVersion: 1, config: { text: "Connected prompt" },
        position: { x: -600, y: 680 }, selectedOutputAssetId: null }] : []),
      { id: "generation", kind: `generate.${modality}`, configVersion: 1,
        config: { ...applyNodePromptPreset(generationConfig(previewModel, ""), previewPresets[0], previewModel).config,
          ...(modality === "image" ? { repeatCount } : {}), presentation: { customTitle: compact ? "Compact preview" : "Shared prompt preview" } } as CanonicalJsonValue,
        position: { x: 32, y: 64 }, selectedOutputAssetId: null },
    ], edges: [
      ...["reference-1", "reference-2"].map((sourceNodeId, sortOrder) => ({ id: "reference-edge-" + sortOrder, sourceNodeId,
        sourcePortId: "image", targetNodeId: "generation", targetPortId: "image-field-references", sortOrder })),
      ...(connected ? [{ id: "prompt-edge", sourceNodeId: "connected-prompt", sourcePortId: "text", targetNodeId: "generation", targetPortId: "prompt", sortOrder: 0 }] : []),
    ] };
    const value = createSpaceEditorSession({ id: "shared-composer", version: 1, document, writable: !readOnly, readOnlyReason: readOnly ? "READ_ONLY" : null });
    if (compact) value.measure("generation", { width: 300, height: 400 });
    if (progress) {
      const execution: NodeExecutionDto = { executionId: "repeat-preview", executionKind: "generation", mediaType: modality, graphNodeId: "generation",
        modelKey: previewModel.key, status: progress.running ? "processing" : "completed", progress: Math.round(100 * progress.completed / progress.total),
        errorCode: null, outputAssetIds: [], createdAt: storyDate, finishedAt: progress.running ? null : "2026-10-20T00:00:01Z" };
      value.patchRuntime("generation", { execution, repeatProgress: progress });
      client.setQueryData(nodeExecutionKeys.list("shared-composer", "generation"), [execution]);
    }
    return value;
  });
  const graph = useStoryDocument(session);
  return <NativeStoryProviders client={client} graphId="shared-composer" inlineParametersEnabled>
    <main className="relative h-screen bg-neutral-900"><SpaceEditor session={session} catalog={modalityCatalog(previewModel)} />
      <output hidden data-story-graph>{JSON.stringify(graph)}</output>
    </main>
  </NativeStoryProviders>;
}
export const SharedImageComposer: Story = { render: () => <SharedComposerPreview /> };
export const SharedVideoComposer: Story = { render: () => <SharedComposerPreview modality="video" /> };
export const SharedAudioComposer: Story = { render: () => <SharedComposerPreview modality="audio" /> };
export const SharedReadOnly: Story = { render: () => <SharedComposerPreview readOnly /> };
export const SharedConnected: Story = { render: () => <SharedComposerPreview connected /> };
export const SharedCompact: Story = { render: () => <SharedComposerPreview compact /> };
export const SharedRepeatFour: Story = { render: () => <SharedComposerPreview repeatCount={4} /> };
export const SharedRepeatPartial: Story = { render: () => <SharedComposerPreview repeatCount={4} progress={{ completed: 3, failed: 1, total: 4, running: true }} /> };
export const SharedRepeatCompleted: Story = { render: () => <SharedComposerPreview repeatCount={4} progress={{ completed: 4, failed: 1, total: 4, running: false }} /> };

type ResultPhase = "idle" | "pending" | "completed" | "failed" | "cancelled";
type StoryRun = { ids: string[]; execution: NodeExecutionDto };
type StoryBatch = { nodeId: string; runs: StoryRun[]; index: number; timer?: ReturnType<typeof setTimeout> };
function resultExecution(modality: Modality, modelKey: string, executionId: string, status: Exclude<ResultPhase, "idle"> | "processing"): NodeExecutionDto {
  return { executionId, executionKind: "generation", mediaType: modality, graphNodeId: "generation", modelKey, status,
    progress: status === "completed" ? 100 : status === "processing" ? 35 : 0, errorCode: status === "failed" ? "PROVIDER_UNAVAILABLE" : null,
    outputAssetIds: status === "completed" ? ["sample-output"] : [],
    outputBindings: status === "completed" ? [{ portId: modality, sortOrder: 0, assetId: "sample-output" }] : [],
    createdAt: storyDate, finishedAt: status === "pending" || status === "processing" ? null : "2026-10-20T00:00:01Z" };
}
function SeparateResultsPreview({ modality = "image", status = "idle", repeatCount = 1 }: {
  modality?: Modality; status?: ResultPhase; repeatCount?: number;
}) {
  const previewModel = useMemo(() => composerModel(modality), [modality]);
  const graphId = "separate-" + modality;
  const [client] = useState(() => {
    const value = presetClient(modality, modality === "image" ? presets : []);
    value.setQueryData(mediaAssetKeys.detail("sample-output"), { ...storyMediaAsset("sample-output", modality), origin: "generation" });
    return value;
  });
  const [session] = useState(() => {
    let document: SpaceEditorDocument = { schemaVersion: 3, title: "Separate result reservations", groups: [], edges: [], nodes: [
      { id: "generation", kind: `generate.${modality}`, configVersion: 1, position: { x: 40, y: 40 }, selectedOutputAssetId: status === "completed" ? "sample-output" : null,
        config: { ...generationConfig(previewModel, "Describe a cinematic scene"), ...(modality === "image" ? { repeatCount } : {}),
          presentation: { customTitle: "Generation input" } } as CanonicalJsonValue },
    ] };
    const records: NodeExecutionDto[] = [];
    if (status !== "idle") for (let index = 0; index < (modality === "image" ? repeatCount : 1); index++) {
      const execution = resultExecution(modality, previewModel.key, "preview-run-" + index, status);
      records.push(execution);
      document = appendResultNodes(document, "generation", execution.executionId).draft;
      document = reconcileResultNodes(document, "generation", execution);
    }
    client.setQueryData(nodeExecutionKeys.list(graphId, "generation"), records);
    const value = createSpaceEditorSession({ id: graphId, version: 1, document });
    if (records.length) value.patchRuntime("generation", { execution: records[records.length - 1], ...(modality === "image" ? {
      repeatProgress: { completed: status === "pending" ? 0 : records.length, failed: status === "failed" ? records.length : 0,
        total: records.length, running: status === "pending" },
    } : {}) });
    return value;
  });
  const graph = useStoryDocument(session);
  const active = useRef<StoryBatch | null>(null);
  const services = useMemo(() => {
    const publish = (execution: NodeExecutionDto) => {
      session.patchRuntime(execution.graphNodeId, { execution });
      client.setQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, execution.graphNodeId), previous =>
        [execution, ...(previous ?? []).filter(row => row.executionId !== execution.executionId)]);
    };
    const progress = (completed: number, total: number, running: boolean) => {
      if (modality === "image") session.patchRuntime("generation", { repeatProgress: { completed, failed: 0, total, running } });
    };
    const next = () => {
      const batch = active.current;
      if (!batch || !session.getSnapshot().nodeById.has(batch.nodeId)) { active.current = null; return; }
      const run = batch.runs[batch.index];
      session.transact(document => bindResultNodes(document, run.ids, run.execution.executionId), { origin: "system", label: "story.result.bind" });
      publish(run.execution);
      progress(batch.index, batch.runs.length, true);
      batch.timer = setTimeout(() => {
        if (active.current !== batch || session.getSnapshot().disposed) return;
        const completed: NodeExecutionDto = { ...run.execution, status: "completed", progress: 100, outputAssetIds: ["sample-output"],
          outputBindings: [{ portId: modality, sortOrder: 0, assetId: "sample-output" }], finishedAt: new Date().toISOString() };
        session.transact(document => {
          const reconciled = reconcileResultNodes(document, batch.nodeId, completed);
          return { ...reconciled, nodes: reconciled.nodes.map(node => node.id === batch.nodeId ? { ...node, selectedOutputAssetId: "sample-output" } : node) };
        }, { origin: "system", label: "story.result.complete" });
        publish(completed);
        batch.index++;
        progress(batch.index, batch.runs.length, batch.index < batch.runs.length);
        if (batch.index < batch.runs.length) next(); else active.current = null;
      }, 1600);
    };
    const stop = () => { if (active.current?.timer) clearTimeout(active.current.timer); active.current = null; };
    return {
      runNode: (nodeId: string) => {
        const node = session.getSnapshot().nodeById.get(nodeId);
        if (active.current || nodeId !== "generation" || !node || !session.getSnapshot().writable) return;
        const config = node.config as Record<string, unknown>;
        const count = modality === "image" && typeof config.repeatCount === "number" ? config.repeatCount : 1;
        const runs: StoryRun[] = [];
        const reserved = session.transact(document => {
          let draft = document;
          for (let index = 0; index < count; index++) {
            const appended = appendResultNodes(draft, nodeId);
            runs.push({ ids: appended.ids, execution: { ...resultExecution(modality, previewModel.key, crypto.randomUUID(), "processing"), createdAt: new Date().toISOString() } });
            draft = appended.draft;
          }
          return draft;
        }, { origin: "system", label: "story.result.reserve" });
        if (!reserved.ok || !runs.length) return;
        active.current = { nodeId, runs, index: 0 }; next();
      },
      cancelNode: async (nodeId: string) => {
        const batch = active.current;
        if (batch?.nodeId === nodeId) {
          stop();
          for (const run of batch.runs.slice(batch.index)) {
            const cancelled = { ...run.execution, status: "cancelled" as const, finishedAt: new Date().toISOString() };
            session.transact(document => reconcileResultNodes(bindResultNodes(document, run.ids, cancelled.executionId), nodeId, cancelled), { origin: "system", label: "story.result.cancel" });
            publish(cancelled);
          }
          progress(batch.index, batch.runs.length, false);
        } else {
          const execution = session.getSnapshot().runtimeByNode.get(nodeId)?.execution;
          if (!execution || !["pending", "processing"].includes(execution.status)) return;
          const pending = (client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list(graphId, nodeId)) ?? [])
            .filter(row => row.status === "pending" || row.status === "processing")
            .map(row => ({ ...row, status: "cancelled" as const, finishedAt: new Date().toISOString() }));
          session.transact(document => {
            let next = document;
            for (const row of pending) next = reconcileResultNodes(next, nodeId, row);
            return next;
          }, { origin: "system", label: "story.result.cancel" });
          for (const row of pending) publish(row);
          progress(0, modality === "image" ? repeatCount : 1, false);
        }
      },
      stop,
    };
  }, [session, client, graphId, modality, previewModel.key, repeatCount]);
  useEffect(() => services.stop, [services]);
  return <NativeStoryProviders client={client} graphId={graphId} inlineParametersEnabled>
    <main className="relative h-screen bg-neutral-900" data-story-result-preview={modality}>
      <SpaceEditor session={session} catalog={modalityCatalog(previewModel)} services={services} />
      <output hidden data-story-graph>{JSON.stringify(graph)}</output><AppToaster />
    </main>
  </NativeStoryProviders>;
}
export const SeparateImageResults: Story = { render: () => <SeparateResultsPreview /> };
export const SeparateVideoResults: Story = { render: () => <SeparateResultsPreview modality="video" /> };
export const SeparateAudioResults: Story = { render: () => <SeparateResultsPreview modality="audio" /> };
export const SeparateImagePending: Story = { render: () => <SeparateResultsPreview status="pending" /> };
export const SeparateVideoPending: Story = { render: () => <SeparateResultsPreview modality="video" status="pending" /> };
export const SeparateAudioPending: Story = { render: () => <SeparateResultsPreview modality="audio" status="pending" /> };
export const SeparateImageCompleted: Story = { render: () => <SeparateResultsPreview status="completed" /> };
export const SeparateVideoCompleted: Story = { render: () => <SeparateResultsPreview modality="video" status="completed" /> };
export const SeparateAudioCompleted: Story = { render: () => <SeparateResultsPreview modality="audio" status="completed" /> };
export const SeparateResultFailed: Story = { render: () => <SeparateResultsPreview status="failed" /> };
export const SeparateResultCancelled: Story = { render: () => <SeparateResultsPreview status="cancelled" /> };
export const SeparateRepeatFour: Story = { render: () => <SeparateResultsPreview repeatCount={4} /> };
export const SeparateRepeatFourPending: Story = { render: () => <SeparateResultsPreview repeatCount={4} status="pending" /> };

function SelectionCanvas({ kind, running }: { kind: CanonicalNodeKind; running: boolean }) {
  const media = kind === "input.image" ? "image" : kind === "input.video" ? "video" : kind === "input.audio" ? "audio" : null;
  const modality = kind === "generate.video" ? "video" : kind === "generate.audio" ? "audio" : "image";
  const previewModel = useMemo(() => composerModel(modality), [modality]);
  const [client] = useState(() => {
    const value = presetClient(modality, []);
    if (media) value.setQueryData(mediaAssetKeys.detail("preview-media"), storyMediaAsset("preview-media", media));
    return value;
  });
  const [session] = useState(() => {
    const config = media ? { assetId: "preview-media" } : ["generate.image", "generate.video", "generate.audio"].includes(kind)
      ? generationConfig(previewModel, "Describe a scene") : defaultConfigForKind(kind);
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Selection styles", groups: [], edges: [], nodes: [
      { id: "style-node", kind, configVersion: 1, config: config as CanonicalJsonValue, selectedOutputAssetId: null, position: { x: 80, y: 80 } },
    ] };
    const value = createSpaceEditorSession({ id: "selection-preview", version: 1, document });
    value.select(["style-node"]);
    if (running && findNodeDefinition(kind)?.executionMode !== "none" && !isUnavailableEditNodeKind(kind)) {
      const execution: NodeExecutionDto = { executionId: "selection-run", graphNodeId: "style-node", status: "processing", progress: 92,
        executionKind: kind === "generate.assistant" ? "assistant" : kind.startsWith("generate.") ? "generation" : "media_operation",
        mediaType: kind === "generate.assistant" ? "text" : kind === "edit.video.extractFrames" ? "image" : kind.startsWith("edit.video.") ? "video" : modality,
        modelKey: kind.startsWith("generate.") ? previewModel.key : null, errorCode: null, outputAssetIds: [], createdAt: storyDate, finishedAt: null };
      value.patchRuntime("style-node", { execution });
      client.setQueryData(nodeExecutionKeys.list("selection-preview", "style-node"), [execution]);
    }
    return value;
  });
  const graph = useStoryDocument(session);
  return <NativeStoryProviders client={client} graphId="selection-preview" inlineParametersEnabled>
    <main className="relative h-screen" data-preview-kind={kind}><SpaceEditor session={session} catalog={modalityCatalog(previewModel)} />
      <output hidden data-story-graph>{JSON.stringify(graph)}</output>
    </main>
  </NativeStoryProviders>;
}
function SelectionStylePreview({ running = false }: { running?: boolean }) {
  const [kind, setKind] = useState<CanonicalNodeKind>("generate.image");
  return <>
    <label className="absolute left-4 top-4 z-[100] flex items-center gap-2 rounded bg-neutral-800 p-2 text-white">노드 선택 스타일
      <select aria-label="검증할 노드" value={kind} onChange={event => setKind(event.target.value as CanonicalNodeKind)}>
        {canonicalNodeKinds.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>
    <SelectionCanvas key={kind + running} kind={kind} running={running} />
  </>;
}
export const SelectionStyles: Story = { render: () => <SelectionStylePreview /> };
export const RunningSelection: Story = { render: () => <SelectionStylePreview running /> };

function InputUXCanvas({ media, readOnly = false, overlap = false }: { media: Modality; readOnly?: boolean; overlap?: boolean }) {
  const [client] = useState(() => {
    const value = presetClient(media, []);
    value.setQueryData(mediaAssetKeys.detail("sample"), storyMediaAsset("sample", media));
    return value;
  });
  const [session] = useState(() => {
    const document: SpaceEditorDocument = { schemaVersion: 3, title: "Input interactions", groups: [], nodes: [
      { id: "source", kind: `input.${media}`, configVersion: 1, config: { assetId: "sample", presentation: { customTitle: "Back source" } },
        position: overlap ? { x: 80, y: 180 } : { x: 40, y: 80 }, selectedOutputAssetId: null },
      { id: "target", kind: `input.${media}`, configVersion: 1, config: { assetId: "sample",
        resultSource: { nodeId: "source", portId: media, index: 0, executionId: "preview", state: "completed" }, presentation: { customTitle: "Target" } },
        position: { x: 720, y: 80 }, selectedOutputAssetId: null },
      ...(overlap ? [{ id: "front", kind: "note.memo", configVersion: 1, config: { text: "Front node", size: { width: 560, height: 440 } },
        position: { x: 60, y: 100 }, selectedOutputAssetId: null }] : []),
    ], edges: [{ id: "input-edge", sourceNodeId: "source", sourcePortId: media, targetNodeId: "target", targetPortId: media === "image" ? "reference" : media, sortOrder: 0 }] };
    return createSpaceEditorSession({ id: "input-ux", version: 1, document, writable: !readOnly, readOnlyReason: readOnly ? "READ_ONLY" : null });
  });
  const graph = useStoryDocument(session);
  return <NativeStoryProviders client={client} graphId="input-ux">
    <main className="relative h-screen" data-story-input-ux={media}><SpaceEditor session={session} catalog={catalog} />
      <output data-story-graph hidden>{JSON.stringify(graph)}</output>
    </main>
  </NativeStoryProviders>;
}
function InputUXPreview() {
  const [media, setMedia] = useState<Modality>("image");
  const [readOnly, setReadOnly] = useState(false), [overlap, setOverlap] = useState(false);
  return <>
    <div className="absolute left-4 top-4 z-[100] flex gap-3 rounded bg-neutral-800 p-2 text-white">
      <select aria-label="입력 매체" value={media} onChange={event => setMedia(event.target.value as Modality)}>
        {["image", "video", "audio"].map(value => <option key={value}>{value}</option>)}
      </select>
      <label><input type="checkbox" checked={readOnly} onChange={event => setReadOnly(event.target.checked)} />읽기 전용</label>
      <label><input type="checkbox" checked={overlap} onChange={event => setOverlap(event.target.checked)} />겹침</label>
    </div>
    <InputUXCanvas key={media + readOnly + overlap} media={media} readOnly={readOnly} overlap={overlap} />
  </>;
}
export const InputInteractions: Story = { render: () => <InputUXPreview /> };
