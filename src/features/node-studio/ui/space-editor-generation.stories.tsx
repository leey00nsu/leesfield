import { useEffect, useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppButton } from "@/shared/ui/app-button";
import { AppToaster } from "@/shared/ui/app-toast";
import type { RuntimeAudioModel, RuntimeImageModel, RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import { mappedReferenceImageModelFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { mediaAssetKeys } from "@/features/media-assets/hook/use-media-assets";
import { emptySpacePreferences } from "@/shared/generation-graph/space-preferences";
import { SpacePreferencesContext } from "../hook/use-space-preferences";
import { nodeExecutionKeys } from "../hook/use-node-executions";
import type { NodeExecutionDto } from "../model/node-execution-types";
import type { SpaceInputRuntime } from "../model/space-editor-inputs";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { createSpaceEditorSession } from "../model/space-editor-store";
import { projectGenerationModelSelectionDefaults } from "../model/generation-model-selection-defaults";
import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { SpaceEditor } from "./space-editor";

const imageModel: RuntimeImageModel = { ...mappedReferenceImageModelFixture, key: "native-image", label: "Native Image", parameters: {},
  providerConfig: { gradio_contract: { version: 1, apiName: "/generate", diagnostics: [], reviewed: true, output: { media: "image", path: [0], multiple: false }, inputs: [
    { name: "prompt", label: "Prompt", kind: "string", required: true, nullable: false, canonical: "prompt", schema: { type: "string", minLength: 1 } },
    { name: "refs", label: "References", kind: "gallery", media: "image", required: false, nullable: false, default: [], schema: { type: "array", maxItems: 6, items: { type: "string" } } },
    { name: "seed", label: "Seed", kind: "number", required: false, nullable: false, default: 3, schema: { type: "integer", minimum: 0 } },
    { name: "enabled", label: "Enabled", kind: "boolean", required: false, nullable: false, default: true, schema: { type: "boolean" } },
    { name: "gain", label: "Optional gain", kind: "number", required: false, nullable: true, default: null, schema: { type: ["number", "null"] } },
    { name: "payload", label: "Payload", kind: "json", required: false, nullable: false, default: { quality: "draft" }, schema: { type: "object", additionalProperties: true } },
  ] } } };
const otherImage: RuntimeImageModel = { ...imageModel, key: "native-image-two", label: "Second Image", provider: "fal", vendor: "FAL" };
const audioModel: RuntimeAudioModel = { type: "audio", key: "native-drama", label: "Script Audio", provider: "hf_space", vendor: "Hugging Face", isActive: true, isDefault: false, parameters: {}, meta: {},
  providerConfig: { gradio_contract: { version: 1, apiName: "/generate", diagnostics: [], reviewed: true, output: { media: "audio", path: [0], multiple: false }, inputs: [
    { name: "script", label: "Script", kind: "string", required: true, nullable: false, canonical: "prompt", schema: { type: "string", minLength: 1 } },
    { name: "temperature", label: "Temperature", kind: "number", required: false, nullable: false, default: 0, schema: { type: "number", minimum: 0, maximum: 1 } },
  ] } } };
const llm: RuntimeLlmModel = { type: "llm", key: "native-creative", label: "Creative LLM", vendor: "OpenAI", provider: "openai_compatible", isActive: true, isDefault: false,
  providerConfig: { base_url: "https://example.invalid/v1", model_id: "creative-fixture", supports_images: true } };
const videoModel = { ...runtimeVideoModelsFixture[0], key: "native-video", label: "Native Video", meta: { ...runtimeVideoModelsFixture[0].meta, coverImage: undefined, pageUrl: undefined } };
const initial: SpaceEditorDocument = { schemaVersion: 3, title: "Native generation", groups: [], edges: [
  { id: "selected-item", sourceNodeId: "assistant", sourcePortId: "item", targetNodeId: "downstream", targetPortId: "text", sortOrder: 0 },
  { id: "video-reference", sourceNodeId: "reference", sourcePortId: "image", targetNodeId: "video", targetPortId: "initImage", sortOrder: 0 },
  { id: "assistant-reference", sourceNodeId: "reference", sourcePortId: "image", targetNodeId: "assistant", targetPortId: "images", sortOrder: 0 },
], nodes: [
  { id: "image", kind: "generate.image", configVersion: 1, position: { x: 0, y: 0 }, config: { prompt: "레몬 비타민 광고", modelKey: imageModel.key, parameters: { dynamicParams: { seed: 3, enabled: true, gain: null, payload: { quality: "draft" } } } }, selectedOutputAssetId: null },
  { id: "video", kind: "generate.video", configVersion: 1, position: { x: 500, y: 0 }, config: projectGenerationModelSelectionDefaults({}, { prompt: "책상 위 비타민", modelKey: videoModel.key, parameters: {} }, [videoModel]) as CanonicalJsonValue, selectedOutputAssetId: null },
  { id: "audio", kind: "generate.audio", configVersion: 1, position: { x: 0, y: 520 }, config: { prompt: "오늘의 작은 활력을 소개합니다.", modelKey: audioModel.key, parameters: { dynamicParams: { script: "오늘의 작은 활력을 소개합니다.", temperature: 0 } } }, selectedOutputAssetId: null },
  { id: "assistant", kind: "generate.assistant", configVersion: 1, position: { x: 500, y: 520 }, config: { prompt: "광고 방향을 두 개 제안하세요.", modelKey: llm.key, outputMode: "list" }, selectedOutputAssetId: null },
  { id: "downstream", kind: "input.prompt", configVersion: 1, position: { x: 1050, y: 520 }, config: { text: "local fallback" }, selectedOutputAssetId: null },
  { id: "reference", kind: "input.image", configVersion: 1, position: { x: 1050, y: 0 }, config: { assetId: "native-reference" }, selectedOutputAssetId: null },
] };
const list: NodeExecutionDto = { executionId: "native-list-run", executionKind: "assistant", mediaType: "text", graphNodeId: "assistant", status: "completed", progress: 100,
  modelKey: llm.key, outputAssetIds: [], errorCode: null, createdAt: "2026-10-20T00:00:00Z", finishedAt: "2026-10-20T00:00:01Z", outputMode: "list", outputText: "1. 따뜻한 책상\n\n2. 활기찬 오후",
  outputItems: [{ id: "native-list-run:1", text: "따뜻한 책상" }, { id: "native-list-run:2", text: "활기찬 오후" }], selectedItemId: "native-list-run:1", selectionVersion: 0 };
function Fixture() {
  const [client] = useState(() => {
    const value = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    for (const id of ["image", "video", "audio"]) value.setQueryData(nodeExecutionKeys.list("native-generation-fixture", id), []);
    value.setQueryData(nodeExecutionKeys.list("native-generation-fixture", "assistant"), [list]);
    value.setQueryData(mediaAssetKeys.detail("native-reference"), { id: "native-reference", version: 1, type: "image", status: "completed", origin: "upload", mimeType: "image/jpeg", bytes: null, width: 640, height: 462, durationMs: null, sourceOperationId: null, url: "/assets/storybook/puppy.jpg", createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z" });
    return value;
  });
  const [session] = useState(() => createSpaceEditorSession({ id: "native-generation-fixture", version: 1, document: structuredClone(initial) }));
  const [draft, setDraft] = useState(session.getDocument()), [current, setCurrent] = useState(list), [runs, setRuns] = useState<string[]>([]);
  const [preferences, setPreferences] = useState(() => ({ ...emptySpacePreferences(), recentModelKeys: [imageModel.key, llm.key] }));
  useEffect(() => session.subscribeDurable(event => setDraft(event.document)), [session]);
  useEffect(() => client.getQueryCache().subscribe(() => {
    const result = client.getQueryData<NodeExecutionDto[]>(nodeExecutionKeys.list("native-generation-fixture", "assistant"))?.[0]; if (result) setCurrent(result);
  }), [client]);
  const inputRuntime = useMemo<SpaceInputRuntime>(() => ({ assistantResults: { assistant: { text: current.outputText ?? null,
    item: current.outputItems?.find(item => item.id === current.selectedItemId)?.text ?? null } } }), [current]);
  const preferenceValue = useMemo<NonNullable<React.ContextType<typeof SpacePreferencesContext>>>(() => ({ data: preferences, error: null, saving: false,
    trackModel: key => setPreferences(value => ({ ...value, recentModelKeys: [key, ...value.recentModelKeys.filter(item => item !== key)] })),
    saveDefaults: async defaults => setPreferences(value => ({ ...value, defaults })), saveSettings: async changes => setPreferences(value => ({ ...value, ...changes })),
    retry: () => {}, inlineParametersEnabled: preferences.inlineParametersEnabled ?? false,
    setInlineParametersEnabled: async inlineParametersEnabled => setPreferences(value => ({ ...value, inlineParametersEnabled })),
  }), [preferences]);
  const catalog = useMemo(() => ({ imageModels: [imageModel, otherImage], videoModels: [videoModel], audioModels: [audioModel], llmModels: [llm], isLoading: false, error: null, retry: () => {} }), []);
  const services = useMemo(() => ({ runNode: async (id: string) => {
    setRuns(value => [...value, id]);
    const node = session.getSnapshot().nodeById.get(id)!;
    session.patchRuntime(id, { execution: { executionId: "fixture-run-" + id, graphNodeId: id, executionKind: node.kind === "generate.assistant" ? "assistant" : "generation",
      mediaType: node.kind === "generate.assistant" ? "text" : node.kind === "generate.video" ? "video" : node.kind === "generate.audio" ? "audio" : "image", status: "processing", progress: 12, modelKey: String((node.config as Record<string, unknown>).modelKey), outputAssetIds: [], errorCode: null, createdAt: new Date().toISOString() } });
  }, cancelNode: async (id: string) => { const execution = session.getSnapshot().runtimeByNode.get(id)?.execution; if (execution) session.patchRuntime(id, { execution: { ...execution, status: "cancelled" } }); } }), [session]);
  return <QueryClientProvider client={client}><SpacePreferencesContext.Provider value={preferenceValue}>
    <div style={{ width: "100vw", height: "100vh" }}><SpaceEditor session={session} catalog={catalog} inputRuntime={inputRuntime} services={services} />
      <AppButton data-fixture-inline-toggle="" className="fixed left-3 top-3 z-[100]" size="sm" onClick={() => void preferenceValue.setInlineParametersEnabled(!preferenceValue.inlineParametersEnabled)}>인라인 설정 전환</AppButton>
      <output hidden data-native-generation-fixture="">{JSON.stringify({ draft, runs, recent: preferences.recentModelKeys, selectedItemId: current.selectedItemId })}</output>
      <AppToaster />
    </div>
  </SpacePreferencesContext.Provider></QueryClientProvider>;
}
const meta = { title: "Spaces/Native generation", component: Fixture, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Fixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Authoring: Story = {};
