import { ImageGenerationResult } from "./image-generation-result";
import type { ImageGenerationState } from "../hook/use-image-generation";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach } from "vitest";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { renderWithIntl } from "@/test-utils/intl";
import { imageModels } from "@/features/image-generation/model/image-models";
import {
  runtimeImageModelsFixture,
  runtimeVideoModelsFixture,
} from "@/test-utils/fixtures/runtime-model-catalog";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/image",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
  useSearchParams: () => navigationMocks.searchParams,
}));

const mockUseImageGeneration = vi.hoisted(() => vi.fn());

vi.mock("@/features/image-generation/hook/use-image-generation", () => ({
  useImageGeneration: mockUseImageGeneration,
}));

async function waitForModels() {
  await screen.findByRole("button", {
    name: /Z-Image Turbo|FLUX\.2 Klein 9B/i,
  });
}

async function openModelPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", {
      name: /Z-Image Turbo|FLUX\.2 Klein 9B|GPT Image 2/i,
    }),
  );
}

describe("ImageGenerationForm", () => {
  beforeEach(() => {
    navigationMocks.push.mockReset();
    navigationMocks.pathname = "/image";
    navigationMocks.searchParams = new URLSearchParams();
    mockUseImageGeneration.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: [
                ...runtimeImageModelsFixture,
                ...runtimeVideoModelsFixture,
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("쿼리 파라미터로 prompt/model/initImage를 초기화한다", async () => {
    const startGeneration = vi.fn();
    const reset = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset,
    });

    navigationMocks.searchParams = new URLSearchParams();
    navigationMocks.searchParams.set("prompt", "a query prompt");
    navigationMocks.searchParams.set("model", "flux2-klein-9b");
    navigationMocks.searchParams.append(
      "initImage",
      "https://example.com/one.png",
    );
    navigationMocks.searchParams.append(
      "initImage",
      "https://example.com/two.png",
    );

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByRole("textbox")).toHaveTextContent("a query prompt");
    expect(await screen.findAllByAltText("입력 이미지 미리보기")).toHaveLength(
      2,
    );

    const modelButton = screen.getByRole("button", {
      name: /FLUX\.2 Klein 9B/i,
    });
    expect(modelButton).toHaveClass("border-primary");
  });

  it("renders a bottom creation input with model and actual settings controls", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });

    expect(dock).toHaveAttribute("data-app-prompt-field");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveAttribute(
      "data-variant",
      "prompt",
    );
    expect(dock).toHaveAttribute("data-surface", "hero");
    expect(dock).toHaveClass("bg-black/24");
    expect(dock).toHaveClass("backdrop-blur-xl");
    expect(dock.className).not.toContain("gradient");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveClass(
      "bg-card",
    );
    expect(screen.queryByTestId("shared-prompt-meta")).not.toBeInTheDocument();
    expect(dock).toHaveTextContent("모델 선택");
    expect(dock).not.toHaveTextContent("1:1");
    expect(dock).not.toHaveTextContent("1K");
    expect(dock).not.toHaveTextContent("Draw");
    expect(dock).toHaveTextContent("상세 옵션");
    expect(dock).not.toHaveTextContent("출력 크기");
    expect(dock).not.toHaveTextContent("이미지 수");
    expect(within(dock).queryByRole("spinbutton", { name: "너비" })).toBeNull();
    expect(within(dock).queryByRole("spinbutton", { name: "높이" })).toBeNull();
    expect(screen.queryByText("준비 완료")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Z-Image Turbo|FLUX\.2 Klein 9B/i }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("button", { name: "생성" })).toBeInTheDocument();
  });

  it("renders a text-first image studio preview without mock media cards", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByText("이미지 생성")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "원하는 이미지를 만들어 보세요." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "아이디어를 입력하고 설정을 선택해 이미지를 생성하세요.",
      ),
    ).toBeInTheDocument();
    const resultFrame = screen.getByTestId("generation-canvas");
    expect(resultFrame).toHaveClass("rounded-[1.75rem]");
    expect(resultFrame).toHaveClass("max-w-6xl");
    expect(resultFrame).not.toHaveClass("bg-[#07090a]");
    expect(
      screen
        .getByRole("heading", { name: "원하는 이미지를 만들어 보세요." })
        .closest("[data-testid='generation-canvas']"),
    ).toBeNull();
    expect(
      screen.queryByAltText("어두운 톤의 인물 레퍼런스"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("VISUAL TAKE")).not.toBeInTheDocument();
  });

  it("등록 모델이 없으면 상단 alert 대신 dock 모델 영역에 상태를 표시한다", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    expect(
      await screen.findByText("선택 가능한 모델 없음"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("지금 사용할 수 있는 생성 모델이 없습니다."),
    ).not.toBeInTheDocument();
  });

  it("빈 프롬프트에서는 생성 버튼을 비활성화한다", async () => {
    const startGeneration = vi.fn();
    const reset = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset,
    });

    const user = userEvent.setup();

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.queryByTestId("shared-prompt-feedback")).toBeNull();

    const submit=screen.getByRole("button", { name: "생성" });
    expect(submit).toBeDisabled();
    await user.click(submit);
    await user.type(within(screen.getByRole("region", {name:"작업 입력"})).getByRole("textbox"), "sunset");
    expect(submit).toBeEnabled();
    expect(startGeneration).not.toHaveBeenCalled();
  });

  it("생성 중 상태를 표시한다", () => {
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "processing",
        progress: 42,
        requestId: "request-id",
      },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    expect(screen.queryByText("42%")).not.toBeInTheDocument();
    const button = screen.getByRole("button", {name: "생성 중…"});
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("완료된 결과 이미지를 표시한다", () => {
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "completed",
        progress: 100,
        requestId: "request-id",
        result: {
          images: [{ url: "https://example.com/generated.png",requestId:"first-id",outputIndex:1 },{url:"https://example.com/second.png",requestId:"second-id",outputIndex:0}],
        },
      },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    expect(screen.getByAltText("생성된 이미지 1")).toBeInTheDocument();
    expect(screen.getAllByRole("link", {name:"다운로드"}).map(link=>link.getAttribute("href"))).toEqual(["/api/image-generation/first-id/download?index=1","/api/image-generation/second-id/download?index=0"]);
    expect(screen.queryByText("준비 완료")).not.toBeInTheDocument();
    expect(screen.queryByText("생성 중…")).not.toBeInTheDocument();
  });

  it("비로그인 상태에서 로그인 페이지로 이동한다", async () => {
    const startGeneration = vi.fn();
    const reset = vi.fn();

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration,
      reset,
    });

    const user = userEvent.setup();

    renderWithIntl(<ImageGenerationForm isAuthenticated={false} />);
    expect(screen.getByRole("button", {name:"장수 · 1장"})).toBeDisabled();

    expect(
      await screen.findByText("로그인하면 바로 만들 수 있습니다."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(navigationMocks.push).toHaveBeenCalledWith(
      "/login?returnTo=%2Fimage",
    );
    expect(startGeneration).not.toHaveBeenCalled();
  });

  it("FLUX 모델에서 모드/가이던스/업샘플링 옵션을 노출한다", async () => {
    const fluxModel = imageModels.find(
      (model) => model.key === "flux2-klein-9b",
    );
    expect(fluxModel).toBeDefined();
    if (!fluxModel) return;

    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);

    await openModelPicker(user);
    await user.click(
      await screen.findByRole("button", { name: /FLUX\.2 Klein 9B/i }),
    );
    await user.click(await screen.findByRole("button", { name: /상세 옵션/i }));

    expect(await screen.findByText("모드")).toBeInTheDocument();
    expect(await screen.findByText("가이던스")).toBeInTheDocument();
    expect(await screen.findByText("프롬프트 보강")).toBeInTheDocument();
  });

  it("GPT Image 2 모델들에서는 빈 상세 옵션을 열 수 없다", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    for (const label of ["GPT Image 2", "GPT Image 2 Bridge"]) {
      await openModelPicker(user);
      const modelLabel = await screen.findByText(label);
      const gptButton = modelLabel.closest("button");
      expect(gptButton).not.toBeNull();
      await user.click(gptButton as HTMLButtonElement);

      await waitFor(() => {
        expect(screen.getByRole("button", {name:"상세 옵션"})).toBeDisabled();
        expect(
          screen.queryByRole("heading", { name: "설정" }),
        ).not.toBeInTheDocument();
      });
    }
  });

  it("모델 카드에서 입력 유형과 기본 배지를 표시하고 기술 설명을 생략한다", async () => {
    mockUseImageGeneration.mockReturnValue({
      state: { status: "idle", progress: 0 },
      startGeneration: vi.fn(),
      reset: vi.fn(),
    });

    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();

    await openModelPicker(userEvent.setup());
    expect(screen.getByText("기본")).toBeInTheDocument();
    expect(screen.getAllByText("T2I").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I2I").length).toBeGreaterThan(0);
    expect(screen.queryByText("기술 정보")).not.toBeInTheDocument();
  });

  it("모델 전환 시 생성 폴링을 리셋한다", async () => {
    const reset = vi.fn();
    mockUseImageGeneration.mockReturnValue({
      state: {
        status: "processing",
        progress: 0,
        requestId: "request-id",
      },
      startGeneration: vi.fn(),
      reset,
    });

    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();
    expect(screen.getByRole("button", {name:"장수 · 1장"})).toBeDisabled();

    await openModelPicker(user);
    await user.click(
      await screen.findByRole("button", { name: /FLUX\.2 Klein 9B/i }),
    );

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("프리셋 칩 편집·교체 취소·제거가 추가 문장을 보존하고 최종 요청을 고정한다", async () => {
    const { builtinPromptPresets } = await import("@/shared/prompt-presets/builtin-prompt-presets");
    const items = builtinPromptPresets.map(p => ({ ...p, prompt: "저장한 " + p.name, revision: 3, builtinKey: p.key, builtinRevision: 1, defaultPrompt: p.prompt, isActive: true, isModified: true }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith("/api/prompt-presets") ? { items } : { items: runtimeImageModelsFixture }))));
    const startGeneration = vi.fn();
    mockUseImageGeneration.mockReturnValue({ state: { status: "idle", progress: 0 }, startGeneration, reset: vi.fn() });
    navigationMocks.searchParams.set("model", "flux2-klein-9b");
    navigationMocks.searchParams.append("initImage", "https://example.com/reference.png");
    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await waitForModels();
    await user.click(screen.getByRole("button", { name: "프리셋" }));
    await user.click(await screen.findByRole("button", { name: /멀티 카메라 9 그리드.*제공 프리셋/ }));
    const prompt = within(screen.getByRole("region", { name: "작업 입력" })).getByRole("textbox");
    expect(prompt.querySelector("[data-prompt-token]")).toBeInTheDocument();
    expect(startGeneration).not.toHaveBeenCalled();
    prompt.focus();
    const cursor = document.createRange(); cursor.setStartAfter(prompt.querySelector("[data-prompt-token]")!); cursor.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(cursor);
    await user.keyboard("현재 작업 수정본");
    await user.click(screen.getByRole("button", { name: "멀티 카메라 9 그리드 프리셋 설정" }));
    const editor = screen.getByRole("dialog");
    await user.clear(within(editor).getByRole("textbox", { name: "프롬프트" }));
    await user.type(within(editor).getByRole("textbox", { name: "프롬프트" }), "이번 생성의 프리셋 본문");
    await user.click(within(editor).getByRole("button", { name: "적용" }));
    await user.click(screen.getByRole("button", { name: "프리셋" }));
    await user.click(await screen.findByRole("button", { name: /캐릭터 시트.*제공 프리셋/ }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(prompt).toHaveTextContent("현재 작업 수정본");
    expect(screen.getByRole("button", { name: "멀티 카메라 9 그리드 프리셋 설정" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "프리셋" }));
    for (const name of ["저장본 다시 적용", "제공 원문으로 복원", "선택 해제"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(startGeneration).toHaveBeenCalledTimes(1));
    expect(startGeneration).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: "이번 생성의 프리셋 본문\n\n현재 작업 수정본", imageCount: 1, initImages: ["https://example.com/reference.png"], promptPreset: expect.objectContaining({ key: "multi-camera-nine-grid", revision: 3 }) }), 1);
    await user.click(screen.getByRole("button", { name: "멀티 카메라 9 그리드 프리셋 제거" }));
    expect(prompt).toHaveTextContent("현재 작업 수정본");
    await user.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(startGeneration).toHaveBeenCalledTimes(2));
    expect(startGeneration.mock.calls[1][0].promptPreset).toBeUndefined();
  });
  it("이미지 필수 프리셋은 참고 이미지가 없으면 실행되지 않는다", async () => {
    const { builtinPromptPresets } = await import("@/shared/prompt-presets/builtin-prompt-presets");
    const p = builtinPromptPresets[1], preset = { ...p, builtinKey: p.key, builtinRevision: 1, defaultPrompt: p.prompt, isActive: true, isModified: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify({ items: url.startsWith("/api/prompt-presets") ? [preset] : runtimeImageModelsFixture }))));
    mockUseImageGeneration.mockReturnValue({ state: { status: "idle", progress: 0 }, startGeneration: vi.fn(), reset: vi.fn() });
    navigationMocks.searchParams.set("model", "flux2-klein-9b");
    const user = userEvent.setup(); const { container } = renderWithIntl(<ImageGenerationForm isAuthenticated />); await waitForModels();
    await user.click(screen.getByRole("button", { name: "프리셋" }));
    await user.click(await screen.findByRole("button", { name: /멀티 카메라 9 그리드.*제공 프리셋/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("참고 이미지 1개를 추가하세요.");
    expect(screen.getByRole("button", { name: "생성" })).toBeDisabled();
    await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["image"], "reference.png", { type: "image/png" }));
    await waitFor(() => expect(screen.queryByText("참고 이미지 1개를 추가하세요.")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "생성" })).toBeEnabled();
  });


  it("mapped 모델의 사용자가 수정한 실제 크기를 프리셋 권장값으로 덮지 않는다", async () => {
    const { builtinPromptPresets } = await import("@/shared/prompt-presets/builtin-prompt-presets");
    const p = builtinPromptPresets[0], preset = { ...p, builtinKey: p.key, builtinRevision: 1, defaultPrompt: p.prompt, isActive: true, isModified: false };
    const model = { ...runtimeImageModelsFixture[0], key: "mapped-preset", label: "Mapped preset model", parameters: {}, providerConfig: { gradio_contract: {
      version: 1, mappingConfirmed: true, apiName: "/generate", reviewed: true, diagnostics: [],
      inputs: [
        { name: "text", label: "Prompt", kind: "string", canonical: "prompt", schema: { type: "string" }, confirmed: true, required: true, nullable: false },
        { name: "width", label: "Width", kind: "number", schema: { type: "integer", minimum: 32, maximum: 2048, multipleOf: 32 }, min: 32, max: 2048, step: 32, default: 1024, required: true, nullable: false },
        { name: "height", label: "Height", kind: "number", schema: { type: "integer", minimum: 32, maximum: 2048, multipleOf: 32 }, min: 32, max: 2048, step: 32, default: 1024, required: true, nullable: false },
        { name: "reference", label: "Reference", kind: "file", media: "image", schema: {}, confirmed: true, required: false, nullable: true },
      ], output: { media: "image", path: [0], multiple: false },
    } } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify({ items: url.startsWith("/api/prompt-presets") ? [preset] : [model] }))));
    mockUseImageGeneration.mockReturnValue({ state: { status: "idle", progress: 0 }, startGeneration: vi.fn(), reset: vi.fn() });
    const user = userEvent.setup(); renderWithIntl(<ImageGenerationForm isAuthenticated />);
    await screen.findByRole("button", { name: /Mapped preset model/ });
    await user.click(screen.getByRole("button", { name: "상세 옵션" }));
    const width = screen.getByRole("spinbutton", { name: "Width" }), height = screen.getByRole("spinbutton", { name: "Height" });
    fireEvent.change(width, { target: { value: "640" } }); fireEvent.change(height, { target: { value: "640" } });
    expect(width).toHaveValue(640); expect(height).toHaveValue(640);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "프리셋" }));
    await user.click(await screen.findByRole("button", { name: /캐릭터 시트.*제공 프리셋/ }));
    await user.click(screen.getByRole("button", { name: "상세 옵션" }));
    expect(screen.getByRole("spinbutton", { name: "Width" })).toHaveValue(640);
    expect(screen.getByRole("spinbutton", { name: "Height" })).toHaveValue(640);
  });
  it("Krea2 Identity Edit의 실제 필수 image를 첨부에서 받아 원본 필드로 제출한다", async () => {
    const {identityEditModel}=await import("@/test-utils/fixtures/media-attachment-models");
    const startGeneration=vi.fn(), user=userEvent.setup();
    mockUseImageGeneration.mockReturnValue({state:{status:"idle",progress:0},startGeneration,reset:vi.fn()});
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({items:[identityEditModel]}))));
    navigationMocks.searchParams = new URLSearchParams({model:identityEditModel.key,imageCount:"3"});
    renderWithIntl(<ImageGenerationForm isAuthenticated/>);
    await screen.findByRole("button",{name:/Krea2 Turbo Identity Edit/});
    expect(screen.getByRole("button", {name:"장수 · 3장"})).toBeInTheDocument();
    const dock=screen.getByRole("region",{name:"작업 입력"});
    const input=within(dock).getByLabelText("image");
    expect(input).toHaveAttribute("accept","image/*");
    expect(input).not.toHaveAttribute("multiple");
    await user.type(screen.getByRole("textbox"),"edit identity");
    expect(screen.getByRole("button",{name:"생성"})).toBeDisabled();
    await user.upload(input,new File(["image"],"identity.png",{type:"image/png"}));
    await user.click(screen.getByRole("button",{name:"상세 옵션"}));
    const options=document.querySelector('[data-contract-fields="options"]') as HTMLElement;
    expect(within(options).queryByLabelText("image")).toBeNull();
    expect(within(options).queryByRole("alert")).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button",{name:"생성"}));
    await waitFor(()=>expect(startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      model:identityEditModel.key,prompt:"edit identity",dynamicParams:{image:expect.stringMatching(/^data:image/),advanced__batch_size:1},
    }), 3));
    await user.click(within(dock).getByRole("button",{name:"제거"}));
    expect(screen.getByRole("button",{name:"생성"})).toBeDisabled();
    const {getGradioContract,gradioInputValues}=await import("@/shared/model-catalog/gradio-contract");
    expect(gradioInputValues(getGradioContract(identityEditModel)!,startGeneration.mock.calls[0][0])).toEqual(expect.objectContaining({width:512,height:512}));
  });

  it("장수는 독립 반복 횟수로 제공하고 모델 전환에도 유지한다", async () => {
    const {identityEditModel, multiImageAttachmentModel} = await import("@/test-utils/fixtures/media-attachment-models");
    const startGeneration = vi.fn(), user = userEvent.setup();
    mockUseImageGeneration.mockReturnValue({state:{status:"idle",progress:0},startGeneration,reset:vi.fn()});
    vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({items:[identityEditModel,multiImageAttachmentModel]}))));
    renderWithIntl(<ImageGenerationForm isAuthenticated/>);
    await screen.findByRole("button",{name:/Krea2 Turbo Identity Edit/});
    const trigger = screen.getByRole("button",{name:"장수 · 1장"});
    expect(screen.getByRole("button",{name:"프리셋"}).compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const prompt = screen.getByRole("textbox");
    await user.type(prompt,"preserve this prompt");
    await user.upload(screen.getByLabelText("image"),new File(["image"],"reference.png",{type:"image/png"}));
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog",{name:"장수"})).getByRole("button",{name:"4장"}));
    await user.click(screen.getByRole("button",{name:"생성"}));
    await waitFor(() => expect(startGeneration).toHaveBeenCalledWith(expect.objectContaining({prompt:"preserve this prompt",dynamicParams:{image:expect.stringMatching(/^data:image/),advanced__batch_size:1}}), 4));
    await user.click(screen.getByRole("button",{name:"장수 · 4장"}));
    await user.click(screen.getByRole("button",{name:"직접입력"}));
    const input = screen.getByRole("spinbutton",{name:"직접입력"});
    fireEvent.change(input,{target:{value:"101"}});
    expect(screen.getByRole("alert")).toHaveTextContent("1~100장");
    expect(screen.getByRole("button",{name:"적용"})).toBeDisabled();
    fireEvent.change(input,{target:{value:"3"}});
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button",{name:"장수 · 3장"})).toBeInTheDocument();
    expect(screen.queryByRole("dialog",{name:"장수"})).not.toBeInTheDocument();
    expect(startGeneration).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button",{name:"상세 옵션"}));
    expect(screen.getByRole("spinbutton",{name:/batch_size/})).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button",{name:/모델 선택.*Krea2 Turbo Identity Edit/}));
    const row = screen.getByRole("button",{name:/Krea2 Turbo Identity Edit.*I2I/});
    expect(row).not.toHaveTextContent("T2I");
    await user.click(screen.getByRole("button",{name:/Multi image reference model/}));
    expect(screen.getByRole("button",{name:"장수 · 3장"})).toBeInTheDocument();
    expect(prompt).toHaveTextContent("preserve this prompt");
    await user.click(screen.getByRole("button",{name:"장수 · 3장"}));
    const fixed = screen.getByRole("dialog",{name:"장수"});
    expect(within(fixed).getByRole("button",{name:"2장"})).toBeEnabled();
    expect(within(fixed).getByRole("button",{name:"4장"})).toBeEnabled();
    expect(within(fixed).getByRole("button",{name:"직접입력"})).toBeEnabled();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button",{name:/모델 선택.*Multi image reference model/}));
    await user.click(screen.getByRole("button",{name:/Krea2 Turbo Identity Edit/}));
    expect(screen.getByRole("button",{name:"장수 · 3장"})).toBeInTheDocument();
  });

  it("legacy 장수 query와 반복 횟수를 per-job imageCount와 분리한다", async () => {
    const model = {...runtimeImageModelsFixture[0],parameters:{...runtimeImageModelsFixture[0].parameters,imageCount:{ui:"input",min:1,max:4,step:1,default:4}}};
    navigationMocks.searchParams = new URLSearchParams({model:model.key,imageCount:"4",prompt:"legacy prompt"});
    vi.stubGlobal("fetch",vi.fn(async () => new Response(JSON.stringify({items:[model]}))));
    const startGeneration = vi.fn(), user = userEvent.setup();
    mockUseImageGeneration.mockReturnValue({state:{status:"idle",progress:0},startGeneration,reset:vi.fn()});
    renderWithIntl(<ImageGenerationForm isAuthenticated/>);
    await screen.findByRole("button",{name:"장수 · 4장"});
    await user.click(screen.getByRole("button",{name:"장수 · 4장"}));
    await user.click(within(screen.getByRole("dialog",{name:"장수"})).getByRole("button",{name:"2장"}));
    await user.click(screen.getByRole("button",{name:"생성"}));
    await waitFor(() => expect(startGeneration).toHaveBeenCalledWith(expect.objectContaining({model:model.key,prompt:"legacy prompt",imageCount:1}), 2));
  });

});

describe("ImageGenerationResult pagination", () => {
  const resultState = (count: number, run = "run-a"): ImageGenerationState => ({
    status: "completed", progress: 100, requestId: run,
    result: { images: Array.from({length: count}, (_, index) => ({
      url: "/result-" + run + "-" + index + ".jpg", requestId: run + "-job-" + Math.floor(index / 2), outputIndex: index % 2,
    })) },
  });

  it("20개 결과를9/9/2개로 탐색하고 원본 job/output index를 보존한다", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ImageGenerationResult embedded state={resultState(20)} />);
    const nav = screen.getByRole("navigation", {name: "이미지 결과 페이지"});
    expect(screen.getAllByRole("img")).toHaveLength(9);
    expect(within(nav).getByRole("button", {name: "이전 페이지"})).toBeDisabled();
    await user.click(within(nav).getByRole("button", {name: "다음 페이지"}));
    expect(nav).toHaveTextContent("2 / 3");
    expect(screen.getAllByRole("img")).toHaveLength(9);
    expect(screen.getByRole("img", {name: "생성된 이미지 10"})).toHaveAttribute("src", "/result-run-a-9.jpg");
    expect(screen.getAllByRole("link", {name: "다운로드"})[0]).toHaveAttribute("href", "/api/image-generation/run-a-job-4/download?index=1");
    await user.click(within(nav).getByRole("button", {name: "다음 페이지"}));
    expect(nav).toHaveTextContent("3 / 3");
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByRole("img", {name: "생성된 이미지 19"})).toHaveAttribute("src", "/result-run-a-18.jpg");
    expect(screen.getAllByRole("link", {name: "다운로드"})[0]).toHaveAttribute("href", "/api/image-generation/run-a-job-9/download?index=0");
    expect(within(nav).getByRole("button", {name: "다음 페이지"})).toBeDisabled();
    await user.click(within(nav).getByRole("button", {name: "이전 페이지"}));
    expect(screen.getByRole("img", {name: "생성된 이미지 10"})).toBeInTheDocument();
  });

  it("append/polling ID는 페이지 유지, 감소는 보정, 새 실행/reset은 첫페이지다", async () => {
    const user = userEvent.setup();
    const {rerender} = renderWithIntl(<ImageGenerationResult embedded state={resultState(10)} />);
    await user.click(screen.getByRole("button", {name: "다음 페이지"}));
    rerender(<ImageGenerationResult embedded state={{...resultState(20), status:"processing", requestId:"next-polling-job"}} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("2 / 3");
    expect(screen.getByRole("img", {name: "생성된 이미지 10"})).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "다음 페이지"}));
    rerender(<ImageGenerationResult embedded state={resultState(10)} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("2 / 2");
    rerender(<ImageGenerationResult embedded state={resultState(20, "run-b")} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("1 / 3");
    await user.click(screen.getByRole("button", {name: "다음 페이지"}));
    rerender(<ImageGenerationResult embedded state={{status:"pending",progress:0}} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    rerender(<ImageGenerationResult embedded state={resultState(10, "run-b")} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("1 / 2");
  });

  it("단일은 pager가 없고 fallback download는 전체순번을 사용한다", async () => {
    const user = userEvent.setup();
    const {rerender} = renderWithIntl(<ImageGenerationResult embedded state={resultState(1)} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    const state: ImageGenerationState = {status:"completed",progress:100,requestId:"native-job",result:{images:Array.from({length:18},(_,i)=>({url:"/native-"+i+".jpg"}))}};
    rerender(<ImageGenerationResult embedded state={state} />);
    await user.click(screen.getByRole("button", {name: "다음 페이지"}));
    expect(screen.getAllByRole("img")).toHaveLength(9);
    expect(screen.getAllByRole("link", {name: "다운로드"})[0]).toHaveAttribute("href","/api/image-generation/native-job/download?index=9");
    expect(screen.getAllByRole("link", {name: "다운로드"})[8]).toHaveAttribute("href","/api/image-generation/native-job/download?index=17");
    rerender(<ImageGenerationResult embedded state={resultState(2)} />);
    expect(screen.getByRole("navigation")).toHaveTextContent("1 / 1");
    expect(screen.getByRole("button", {name: "이전 페이지"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "다음 페이지"})).toBeDisabled();
  });
});
