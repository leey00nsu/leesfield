import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import en from "@/shared/i18n/messages/en.json";
import type { RuntimeLlmModel, RuntimeVideoModel } from "@/shared/model-catalog/runtime-utils";
import type { SpaceDefaults } from "@/shared/generation-graph/space-preferences";
import { createSpaceEditorSession } from "../model/space-editor-store";
import type { SpaceEditorDocument } from "../model/space-editor-types";
import { useSpaceModelServices } from "./space-model-tools";
import { createSpaceEditorScope, SpaceEditorProvider, type SpaceEditorCatalog } from "./space-editor-provider";

const preferences = vi.hoisted(() => ({ defaults: {} as SpaceDefaults, track: vi.fn() }));
vi.mock("../hook/use-space-preferences", () => ({ useSpacePreferences: () => ({ data: { defaults: preferences.defaults, recentModelKeys: [] }, trackModel: preferences.track }) }));
afterEach(() => { cleanup(); preferences.defaults = {}; vi.clearAllMocks(); });
const video: RuntimeVideoModel = { type: "video", key: "video", label: "Image Video", provider: "modal_comfyui", vendor: "Test",
  isActive: true, isDefault: true, parameters: {}, meta: { supports_init_image: true, t2v_model_id: "test" } };
const textVideo = { ...video, key: "text-video", label: "Text Video", meta: { supports_init_image: false } };
const llm: RuntimeLlmModel = { type: "llm", key: "vision", label: "Vision Assistant", provider: "openai_compatible", vendor: "Test", isActive: true, isDefault: true,
  providerConfig: { base_url: "https://example.invalid/v1", model_id: "test", supports_images: true } };
const textLlm = { ...llm, key: "text", label: "Text Assistant", providerConfig: { ...llm.providerConfig, supports_images: false } };
const source = { nodeId: "image", portId: "image", direction: "output" as const };
const initial = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Connections", groups: [], edges: [], nodes: [
  { id: "image", kind: "input.image", configVersion: 1, position: { x: 0, y: 0 }, config: { assetId: null }, selectedOutputAssetId: null },
] });
function mount(kind: "generate.video" | "generate.assistant" = "generate.video", patch: Partial<SpaceEditorCatalog> = {}) {
  const catalog: SpaceEditorCatalog = { imageModels: [], videoModels: [textVideo, video], llmModels: [textLlm, llm], isLoading: false, error: null, retry: vi.fn(), ...patch };
  const session = createSpaceEditorSession({ id: "space", version: 1, document: initial() }), scope = createSpaceEditorScope(session), onError = vi.fn();
  const services = { onError };
  function Harness() {
    const models = useSpaceModelServices(scope);
    return <SpaceEditorProvider session={session} scope={scope} catalog={catalog} services={services}>
      <div data-space-canvas tabIndex={-1}><button onClick={() => models.createConnectedNode(models.createNode(kind, { x: 500, y: 100 }), source)}>Connect</button></div>
      {models.tools}
    </SpaceEditorProvider>;
  }
  const view = renderWithIntl(<Harness />, { locale: "en", messages: en });
  return { ...view, session, scope, onError, open: () => fireEvent.click(screen.getByRole("button", { name: "Connect" })) };
}

describe("automatic connected Space models", () => {
  it.each(["generate.video", "generate.assistant"] as const)("sets a compatible model for %s and saves its canonical edge atomically", kind => {
    const view = mount(kind), before = view.session.getDocument(); view.open();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const saved = view.session.getDocument(), target = saved.nodes[1];
    expect(saved.nodes).toHaveLength(2);
    expect(target).toMatchObject({ kind, config: { modelKey: kind === "generate.video" ? video.key : llm.key }, position: { x: 500, y: 100 } });
    expect(saved.edges).toEqual([{ id: expect.any(String), sourceNodeId: "image", sourcePortId: "image", targetNodeId: target.id,
      targetPortId: kind === "generate.video" ? "initImage" : "images", sortOrder: 0 }]);
    expect(view.session.getSnapshot().history.undo).toHaveLength(1);
    act(() => { view.session.undo(); }); expect(view.session.getDocument()).toEqual(before);
    act(() => { view.session.redo(); }); expect(view.session.getDocument()).toEqual(saved);
    expect(view.onError).not.toHaveBeenCalled();
  });

  it("preserves a compatible owner default ahead of the catalog default", () => {
    const saved = { ...video, key: "owner-model", isDefault: false };
    preferences.defaults = { video: { modelKey: saved.key, parameters: {} } };
    const view = mount("generate.video", { videoModels: [video, saved] }); view.open();
    expect(view.session.getDocument().nodes[1]).toMatchObject({ config: { modelKey: saved.key } });
  });

  it("automatically replaces an incompatible default with a compatible catalog model", () => {
    preferences.defaults = { video: { modelKey: textVideo.key, parameters: {} } };
    const view = mount(); view.open();
    expect(view.session.getDocument().nodes[1]).toMatchObject({ config: { modelKey: video.key } });
  });

  it.each([
    { catalog: { videoModels: [] }, error: "VIDEO_MODEL_MISSING" },
    { catalog: { videoModels: [textVideo] }, error: "INPUT_MODEL_UNSUPPORTED" },
    { catalog: { videoModels: [{ ...video, isActive: false }] }, error: "VIDEO_MODEL_MISSING" },
    { catalog: { isLoading: true }, error: "MODEL_CATALOG_LOADING" },
    { catalog: { error: "private details" }, error: "MODEL_CATALOG_UNAVAILABLE" },
  ])("reports $error without partial graph changes", ({ catalog, error }) => {
    const view = mount("generate.video", catalog), before = view.session.getDocument(); view.open();
    expect(view.session.getDocument()).toBe(before); expect(view.session.getSnapshot().history.undo).toHaveLength(0);
    expect(view.onError).toHaveBeenCalledOnce(); expect(view.onError.mock.calls[0][0].message).toBe(error);
  });

  it.each(["source removed", "readonly", "dispose"])("does not create a node for %s", condition => {
    const view = mount();
    act(() => {
      if (condition === "source removed") view.session.dispatch({ type: "node.remove", nodeId: "image" });
      if (condition === "readonly") view.session.setAccess(false);
      if (condition === "dispose") view.session.dispose();
    });
    const before = view.session.getDocument(); view.open();
    expect(view.session.getDocument()).toBe(before);
  });
});
