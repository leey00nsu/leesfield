import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { AppCanvasInputProvider } from "@/shared/ui/app-canvas-input-provider";
import { AppCanvasLocalizationProvider } from "@/shared/i18n/canvas-localization-provider";
import koMessages from "@/shared/i18n/messages/ko.json";
import { ReactFlowProvider } from "@xyflow/react";
import type { RuntimeLlmModel } from "@/shared/model-catalog/runtime-utils";
import type { NodeBananaNodeData } from "../../runtime/node-banana/node-banana-runtime-adapter";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  start: vi.fn(),
  refetch: vi.fn(),
  cancel: vi.fn(),
  executions: [] as Array<Record<string, unknown>>,
  models: [] as RuntimeLlmModel[],
  videoIds: [] as string[],
  copied: vi.fn(),
  copyError: vi.fn(),
  trackModel: vi.fn(),
  recentKeys: [] as string[],
}));

vi.mock("../../hook/use-space-preferences", () => ({
  useSpacePreferences: () => ({ data: { recentModelKeys: mocks.recentKeys }, trackModel: mocks.trackModel }),
}));
vi.mock("@/shared/ui/app-toast", () => ({ appToast: { copied: mocks.copied, error: mocks.copyError } }));

vi.mock("@/features/media-assets/api/media-asset-api", () => ({
  getMediaAsset: vi.fn().mockResolvedValue({ id: "video-1", type: "video", url: "https://example.com/reference.mp4" }),
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-assistant",
    writable: true,
    llmModels: mocks.models,
    isLoading: false,
    error: null,
    retry: vi.fn(),
    updateCanonicalNodeConfig: mocks.updateConfig,
    prepareNodeExecution: vi.fn().mockResolvedValue(2),
    isNodePersisted: () => true,
    getNodeRunReadiness: () => ({ ready: true, reasons: [] }),
    getNodeInputAssetIds: (_id: string, port: string) => port === "videos" ? mocks.videoIds : [],
    getNodePromptInput: () => ({ connected: false, text: null }),
  }),
}));
vi.mock("../../hook/use-node-executions", () => ({
  useNodeExecutions: () => ({ data: mocks.executions, refetch: mocks.refetch }),
  useStartNodeExecution: () => ({ mutateAsync: mocks.start, isPending: false }),
  useCancelNodeExecution: () => ({ mutateAsync: mocks.cancel, isPending: false }),
}));

import { AssistantNodeControls } from "./assistant-node-controls";

const llm: RuntimeLlmModel = {
  type: "llm", key: "llm-1", label: "Creative LLM", vendor: "OpenAI", provider: "openai_compatible",
  providerConfig: { base_url: "https://api.example.com/v1", model_id: "creative-1", supports_images: true },
  isActive: true, isDefault: false,
};

function renderAssistant(modelKey: string | null = "llm-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const data = {
    canonicalKind: "generate.assistant", configVersion: 1,
    config: { prompt: "Describe this clothes", modelKey },
    selectedOutputAssetId: null, ports: [], supported: true, supportReason: null,
  } as NodeBananaNodeData;
  const ui = () => <NextIntlClientProvider locale="ko" messages={koMessages}><QueryClientProvider client={queryClient}><ReactFlowProvider><AppCanvasInputProvider><AppCanvasLocalizationProvider><AssistantNodeControls id="assistant-1" data={data} selected /></AppCanvasLocalizationProvider></AppCanvasInputProvider></ReactFlowProvider></QueryClientProvider></NextIntlClientProvider>;
  const result = render(ui());
  return { ...result, redraw: () => result.rerender(ui()) };
}

describe("AssistantNodeControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executions = [];
    mocks.models = [llm];
    mocks.recentKeys = [];
    mocks.videoIds = [];
    mocks.start.mockResolvedValue({ executionId: "run-1" });
    mocks.refetch.mockResolvedValue({ data: [] });
    mocks.cancel.mockResolvedValue(undefined);
  });

  it("edits the original, chooses an active LLM through the right-side browse flow, and runs explicitly", async () => {
    renderAssistant(null);
    expect(screen.getByRole("tab", { name: "원본" })).toHaveAttribute("aria-selected", "true");
    fireEvent.change(screen.getByRole("textbox", { name: "Assistant 지시문" }), { target: { value: "Describe both items" } });
    expect(mocks.updateConfig).toHaveBeenCalledWith("assistant-1", { prompt: "Describe both items", modelKey: null });
    expect(document.querySelector('button[data-canvas-action="run"]')).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Assistant 모델 선택" }));
    expect(screen.getByRole("dialog", { name: "Browse Models" })).toBeInTheDocument();
    expect(document.querySelector('[data-node-banana-component="ModelSearchDialog"]')).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "모델 검색" }), { target: { value: "creative-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Creative LLM/ }));
    expect(mocks.updateConfig).toHaveBeenCalledWith("assistant-1", { prompt: "Describe this clothes", modelKey: "llm-1" });
    expect(mocks.trackModel).toHaveBeenCalledWith("llm-1");
  });

  it("shares hosted cards and recent usage while excluding inactive LLMs and searching provider model IDs", async () => {
    mocks.models = [llm, { ...llm, key: "inactive-llm", label: "Inactive LLM", isActive: false },
      { ...llm, key: "goat-llm", label: "Goat LLM", vendor: "GOAT", providerConfig: { ...llm.providerConfig, model_id: "goat-text", supports_images: false } }];
    mocks.recentKeys = ["inactive-llm", "llm-1"];
    renderAssistant();
    fireEvent.click(screen.getByRole("button", { name: "Assistant 모델 선택" }));
    const dialog = screen.getByRole("dialog", { name: "Browse Models" });
    expect(within(dialog).queryByText("Inactive LLM")).not.toBeInTheDocument();
    expect(within(dialog).getByText("최근 사용")).toBeInTheDocument();
    expect(within(dialog).getByText("creative-1")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "모델 기능" })).toHaveTextContent("LLM");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "모델 검색" }), { target: { value: "goat-text" } });
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: /Creative LLM/ })).not.toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole("button", { name: /Goat LLM/ }));
    expect(mocks.updateConfig).toHaveBeenCalledWith("assistant-1", expect.objectContaining({ modelKey: "goat-llm" }));
    expect(mocks.trackModel).toHaveBeenCalledWith("goat-llm");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a new successful result, copies it, and keeps it after a failed retry", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const longText = Array.from({ length: 40 }, (_, index) => `${index + 1}. First item: pink bandana. Second item: brown coat.`).join("\n");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const { redraw } = renderAssistant();
    fireEvent.click(document.querySelector('button[data-canvas-action="run"]')!);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ graphId: "graph-assistant", nodeId: "assistant-1", expectedGraphVersion: 2 }));

    mocks.executions = [{ executionId: "run-1", executionKind: "assistant", status: "processing" }];
    redraw();
    expect(document.querySelector('button[data-canvas-action="run"]')).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "작업 취소" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith({ graphId: "graph-assistant", nodeId: "assistant-1", executionId: "run-1" }));

    mocks.executions = [{ executionId: "run-1", executionKind: "assistant", status: "completed", outputText: longText }];
    redraw();
    expect(document.querySelector('button[data-canvas-action="run"]')).toBeEnabled();
    expect(screen.getByRole("tab", { name: "결과" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "결과" })).toHaveTextContent("pink bandana");
    fireEvent.click(screen.getByRole("button", { name: "결과 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(longText));
    expect(mocks.copied).toHaveBeenCalledWith("복사했습니다.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    mocks.executions = [{ executionId: "run-2", executionKind: "assistant", status: "failed", errorCode: "ASSISTANT_PROVIDER_UNAVAILABLE" }, ...mocks.executions];
    redraw();
    expect(screen.getByRole("tabpanel", { name: "결과" })).toHaveTextContent("pink bandana");
    expect(screen.getByRole("alert")).toHaveTextContent("연결할 수 없습니다");
    fireEvent.keyDown(screen.getByRole("tab", { name: "결과" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "원본" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows a connected video as a small preview in the original tab", async () => {
    mocks.videoIds = ["video-1"];
    renderAssistant();
    const preview = await screen.findByLabelText("비디오 참고자료 1");
    expect(preview).toHaveAttribute("src", "https://example.com/reference.mp4");
    expect(preview).toHaveAttribute("preload", "metadata");
  });

  it("copies the current original draft and disables copy for empty original and result views", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderAssistant();
    expect(screen.getByRole("tab", { name: "원본" })).toHaveTextContent("원본");
    expect(screen.getByRole("tab", { name: "결과" })).toHaveTextContent("결과");
    const prompt = screen.getByRole("textbox", { name: "Assistant 지시문" });
    fireEvent.change(prompt, { target: { value: "Current draft.\n\nSecond paragraph." } });
    fireEvent.click(screen.getByRole("button", { name: "원본 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Current draft.\n\nSecond paragraph."));
    expect(mocks.copied).toHaveBeenCalledWith("복사했습니다.");
    fireEvent.change(prompt, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "원본 복사" })).toBeDisabled();
    writeText.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: "결과" }));
    const copy = screen.getByRole("button", { name: "결과 복사" });
    expect(copy).toBeDisabled();
    fireEvent.click(copy);
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole("tabpanel", { name: "결과" })).toHaveTextContent("아직 생성된 결과가 없습니다.");
    fireEvent.click(screen.getByRole("tab", { name: "원본" }));
    expect(screen.getByRole("button", { name: "원본 복사" })).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports a denied clipboard write and lets the user retry copying the full result", async () => {
    mocks.executions = [{ executionId: "run-1", executionKind: "assistant", status: "completed", outputText: "First paragraph.\n\nSecond paragraph." }];
    const writeText = vi.fn().mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderAssistant();
    fireEvent.click(screen.getByRole("button", { name: "결과 복사" }));
    await waitFor(() => expect(mocks.copyError).toHaveBeenCalledWith("복사하지 못했습니다."));
    fireEvent.click(screen.getByRole("button", { name: "결과 복사" }));
    await waitFor(() => expect(mocks.copied).toHaveBeenCalledWith("복사했습니다."));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(writeText).toHaveBeenLastCalledWith("First paragraph.\n\nSecond paragraph.");
  });
});
