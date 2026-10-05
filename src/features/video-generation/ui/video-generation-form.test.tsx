import { fireEvent, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { videoGenerationDefaults } from "@/features/video-generation/model/video-generation-schema";
import { renderWithIntl } from "@/test-utils/intl";
import {
  runtimeImageModelsFixture,
  runtimeVideoModelsFixture,
} from "@/test-utils/fixtures/runtime-model-catalog";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: "/video",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ push: navigationMocks.push }),
  useSearchParams: () => navigationMocks.searchParams,
}));

const startGenerationMock = vi.fn();
const resetMock = vi.fn();

vi.mock("@/features/video-generation/hook/use-video-generation", () => ({
  useVideoGeneration: () => ({
    state: {
      status: "idle",
      progress: 0,
      requestId: undefined,
      errorMessage: undefined,
      result: undefined,
    },
    startGeneration: startGenerationMock,
    reset: resetMock,
  }),
}));

async function waitForModels() {
  await screen.findByText("Wan 2.2 (HF Space)");
}

async function openModelPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /Wan 2\.2/i }));
}

describe("VideoGenerationForm", () => {
  beforeEach(() => {
    navigationMocks.push.mockReset();
    navigationMocks.pathname = "/video";
    navigationMocks.searchParams = new URLSearchParams();
    startGenerationMock.mockClear();
    resetMock.mockClear();
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
    class MockFileReader {
      result: string | null = null;
      onload: null | (() => void) = null;

      readAsDataURL(file: File) {
        this.result = "data:" + file.type + ";base64,AAAA";
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("계약 비디오 모델에서 선택적 프레임 없이 원본 설정으로 제출한다", async()=>{
    const user=userEvent.setup();
    const model={...runtimeVideoModelsFixture[0],providerConfig:{...runtimeVideoModelsFixture[0].providerConfig,gradio_contract:{
      version:1,apiName:"/generate",inputs:[{name:"prompt",label:"Prompt",schema:{type:"string"},kind:"string",canonical:"prompt",required:true,nullable:false},{name:"duration",label:"Seconds",schema:{type:"number"},kind:"number",required:false,nullable:false,default:5}],
      output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:true}}};
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({items:[model]}),{status:200,headers:{"Content-Type":"application/json"}})));
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();
    await user.type(screen.getByRole("textbox"),"moving lights");
    await user.click(screen.getByRole("button",{name:/상세 옵션/}));
    fireEvent.change(screen.getByLabelText("Seconds"),{target:{value:"7"}});
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button",{name:"생성"}));
    expect(startGenerationMock).toHaveBeenCalledWith(expect.objectContaining({prompt:"moving lights",dynamicParams:{duration:7}}));
  });


  it("필수 프레임을 넣어야 생성할 수 있고 제거하면 다시 비활성화한다", async()=>{
    const user=userEvent.setup();
    const model={...runtimeVideoModelsFixture[0],providerConfig:{...runtimeVideoModelsFixture[0].providerConfig,gradio_contract:{
      version:1,apiName:"/generate",inputs:[
       {name:"prompt",label:"Prompt",schema:{type:"string"},kind:"string",canonical:"prompt",required:true,nullable:false},
       {name:"in_1",label:"First Frame (optional)",schema:{},kind:"file",required:true,nullable:false}
      ],output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:false}}};
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({items:[model]}),{status:200})));
    const {container}=renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();
    const submit=screen.getByRole("button",{name:"생성"});
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole("textbox"),"moving lights");
    expect(submit).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(startGenerationMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:/상세 옵션/}));
    expect(screen.getByRole("button",{name:/상세 옵션/})).toBeDisabled();
    expect(within(screen.getByRole("region", {name:"작업 입력"})).getByRole("alert")).not.toHaveTextContent("HF_CONTRACT");
    await user.upload(screen.getByLabelText("First Frame"),new File(["test"],"frame.png",{type:"image/png"}));
    await user.keyboard("{Escape}");
    expect(submit).toBeEnabled();
    await user.click(screen.getByRole("button",{name:"제거"}));
    await user.keyboard("{Escape}");
    expect(submit).toBeDisabled();
  });


  it("API에서 선택 프롬프트여도 생성 화면은 빈 입력과 공백 제출을 차단한다",async()=>{
    const user=userEvent.setup();
    const model={...runtimeVideoModelsFixture[0],providerConfig:{...runtimeVideoModelsFixture[0].providerConfig,gradio_contract:{
      version:1,apiName:"/generate",inputs:[{name:"prompt",label:"Prompt",schema:{type:"string"},kind:"string",canonical:"prompt",required:false,nullable:false,default:""}],
      output:{media:"video",path:[0],multiple:false},diagnostics:[],reviewed:false}}};
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({items:[model]}),{status:200})));
    const {container}=renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();
    const submit=screen.getByRole("button",{name:"생성"});
    const prompt=screen.getByRole("textbox");
    expect(submit).toBeDisabled();
    await user.type(prompt,"   ");
    expect(submit).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(startGenerationMock).not.toHaveBeenCalled();
    await user.type(prompt,"moving lights");
    expect(submit).toBeEnabled();
    await user.clear(prompt);
    expect(submit).toBeDisabled();
  });

  it("쿼리 파라미터로 prompt/model/initImage를 초기화한다", async () => {
    navigationMocks.searchParams = new URLSearchParams();
    navigationMocks.searchParams.set("prompt", "query prompt");
    navigationMocks.searchParams.set("model", "wan2-2-hf");
    navigationMocks.searchParams.set(
      "initImage",
      "https://example.com/init.png",
    );

    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByRole("textbox", { name: /프롬프트|장면|비디오/ })).toBeInTheDocument();
    expect(
      await screen.findByAltText("입력 이미지 미리보기"),
    ).toBeInTheDocument();

    const modelButton = screen.getByRole("button", {
      name: /Wan 2\.2/i,
    });
    expect(modelButton).toHaveClass("border-primary");
  });

  it("renders model selection cards", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);

    expect(await screen.findByText("Wan 2.2 (HF Space)")).toBeInTheDocument();
  });

  it("renders the shared creation input with video-specific control chips", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
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
    expect(dock).toHaveTextContent("상세 옵션");
    expect(dock).not.toHaveTextContent("이미지 필요");
    expect(dock).not.toHaveTextContent("3.5s");
    expect(within(dock).queryByRole("slider")).toBeNull();
    expect(screen.getByRole("button", { name: /Wan 2\.2/i })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(screen.getByRole("button", { name: "생성" })).toBeInTheDocument();
  });

  it("renders a text-first video studio preview without mock media cards", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.getByText("비디오 생성")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "원하는 움직임을 만들어 보세요." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "장면과 움직임을 설명하고 비디오를 생성하세요.",
      ),
    ).toBeInTheDocument();
    const resultFrame = screen.getByTestId("generation-canvas");
    expect(resultFrame).toHaveClass("rounded-[1.75rem]");
    expect(resultFrame).toHaveClass("max-w-6xl");
    expect(resultFrame).not.toHaveClass("bg-[#07090a]");
    expect(
      screen
        .getByRole("heading", { name: "원하는 움직임을 만들어 보세요." })
        .closest("[data-testid='generation-canvas']"),
    ).toBeNull();
    expect(screen.queryByAltText("촬영 현장 사진")).not.toBeInTheDocument();
    expect(screen.queryByText("MOTION TAKE")).not.toBeInTheDocument();
  });

  it("does not render the old preset strip and still submits through the dock", async () => {
    const { container } = renderWithIntl(
      <VideoGenerationForm isAuthenticated />,
    );
    const user = userEvent.setup();

    await waitForModels();
    expect(
      screen.queryByRole("button", { name: /제품 오빗/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wan 2\.2/i })).toHaveClass(
      "border-primary",
    );

    const submit = screen.getByRole("button", { name: "생성" });
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;

    expect(submit).toBeDisabled();
    expect(fileInput).not.toBeNull();

    const prompt = within(
      screen.getByRole("region", { name: "작업 입력" }),
    ).getByRole("textbox");
    await user.type(prompt, "slow orbit camera move around a premium product");
    if (fileInput) {
      const file = new File(["test"], "sample.png", { type: "image/png" });
      await user.upload(fileInput, file);
    }

    await screen.findByAltText("입력 이미지 미리보기");
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    expect(startGenerationMock).toHaveBeenCalledTimes(1);
    expect(startGenerationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "slow orbit camera move around a premium product",
        model: "wan2-2-hf",
        initImage: "data:image/png;base64,AAAA",
      }),
    );
  });

  it("빈 prompt 오류를 공통 입력 dock 내부에 표시한다", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    expect(screen.queryByTestId("shared-prompt-feedback")).toBeNull();

    const dock = screen.getByRole("region", { name: "작업 입력" });
    const form = dock.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    const message = await screen.findByText("프롬프트를 입력해주세요.");
    const feedback = screen.getByTestId("shared-prompt-feedback");
    expect(screen.getByTestId("shared-prompt-form-surface")).toContainElement(
      feedback,
    );
    expect(feedback).toContainElement(message);
    expect(startGenerationMock).not.toHaveBeenCalled();
  });

  it("모델 카드에서 입력 유형과 기본 배지를 표시하고 기술 설명을 생략한다", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    await openModelPicker(userEvent.setup());
    expect(await screen.findByText("기본")).toBeInTheDocument();
    expect(screen.getAllByText("T2V").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I2V").length).toBeGreaterThan(0);
    expect(screen.queryByText("기술 정보")).not.toBeInTheDocument();
  });

  it("submits prompt and default settings", async () => {
    const { container } = renderWithIntl(
      <VideoGenerationForm isAuthenticated />,
    );
    const user = userEvent.setup();
    await waitForModels();

    const prompt = within(
      screen.getByRole("region", { name: "작업 입력" }),
    ).getByRole("textbox");
    const submit = screen.getByRole("button", { name: "생성" });
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;

    expect(submit).toBeDisabled();
    expect(prompt).toBeInTheDocument();
    expect(fileInput).not.toBeNull();

    await user.type(prompt, "cinematic sunrise");
    if (fileInput) {
      const file = new File(["test"], "sample.png", { type: "image/png" });
      await user.upload(fileInput, file);
    }

    await screen.findByAltText("입력 이미지 미리보기");
    expect(submit).not.toBeDisabled();
    await user.click(submit);

    expect(startGenerationMock).toHaveBeenCalledTimes(1);
    expect(startGenerationMock).toHaveBeenCalledWith({
      ...videoGenerationDefaults,
      initImage: "data:image/png;base64,AAAA",
      prompt: "cinematic sunrise",
    });
  });

  it("exposes upload trigger", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated />);
    await waitForModels();

    const uploadButton = screen.getByRole("button", {name:"레퍼런스 이미지 업로드"});

    expect(uploadButton).toBeInTheDocument();
  });

  it("비로그인 상태에서 로그인 페이지로 이동한다", async () => {
    renderWithIntl(<VideoGenerationForm isAuthenticated={false} />);

    expect(
      await screen.findByText("로그인하면 바로 만들 수 있습니다."),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "생성" }));

    expect(navigationMocks.push).toHaveBeenCalledWith(
      "/login?returnTo=%2Fvideo",
    );
    expect(startGenerationMock).not.toHaveBeenCalled();
  });

  it("비디오 프리셋 선택을 실제 매체 요청과 별도 출처로 제출한다", async () => {
    const preset = { key: "video-demo", revision: 2, name: "비디오 프리셋", description: "", modality: "video", prompt: "saved video direction", requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {}, builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify({ items: url.startsWith("/api/prompt-presets") ? [preset] : runtimeVideoModelsFixture.map(m => ({
      ...m, meta: { ...m.meta, supports_init_image: false },
      parameters: { ...m.parameters, initImage: { ...m.parameters.initImage, required: false } },
    })) }))));
    const user = userEvent.setup(); renderWithIntl(<VideoGenerationForm isAuthenticated />); await waitForModels();
    await user.click(screen.getByRole("button", { name: "프리셋" }));
    await user.click(await screen.findByRole("button", { name: /비디오 프리셋.*내 프리셋/ }));
    const prompt = within(screen.getByRole("region", { name: "작업 입력" })).getByRole("textbox");
    expect(prompt.querySelector("[data-prompt-token]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "비디오 프리셋 프리셋 설정" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "생성" }));
    expect(startGenerationMock).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: "saved video direction", promptPreset: expect.objectContaining({ key: "video-demo", revision: 2 }) }));
    prompt.focus();
    const cursor = document.createRange(); cursor.setStartAfter(prompt.querySelector("[data-prompt-token]")!); cursor.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(cursor);
    await user.keyboard("slow camera");
    await user.click(screen.getByRole("button", { name: "생성" }));
    expect(startGenerationMock).toHaveBeenLastCalledWith(expect.objectContaining({ prompt: "saved video direction\n\nslow camera" }));
  });

  it.each(["video","image"] as const)("비디오 출력 모델의 %s 입력은 첨부에서 원본 필드로 전달한다", async media => {
    const {videoAttachmentModel,imageToVideoAttachmentModel}=await import("@/test-utils/fixtures/media-attachment-models");
    const model=media==="video"?videoAttachmentModel:imageToVideoAttachmentModel, user=userEvent.setup();
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({items:[model]}))));
    renderWithIntl(<VideoGenerationForm isAuthenticated/>);
    await screen.findByRole("button",{name:new RegExp(model.label)});
    const dock=screen.getByRole("region",{name:"작업 입력"});
    const label=media==="video"?"Source video":"First frame";
    const input=within(dock).getByLabelText(label);
    expect(input).toHaveAttribute("accept",media+"/*");
    await user.type(screen.getByRole("textbox"),"transform reference");
    expect(screen.getByRole("button",{name:"생성"})).toBeDisabled();
    await user.upload(input,new File(["source"],"source."+media,{type:media+"/test"}));
    await user.click(screen.getByRole("button",{name:"상세 옵션"}));
    const options=document.querySelector('[data-contract-fields="options"]') as HTMLElement;
    expect(within(options).queryByLabelText(label)).toBeNull();
    fireEvent.change(within(options).getByLabelText("Strength"),{target:{value:"0.7"}});
    expect(within(options).queryByRole("alert")).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button",{name:"생성"}));
    await waitFor(()=>expect(startGenerationMock).toHaveBeenCalledWith(expect.objectContaining({
      model:model.key,prompt:"transform reference",dynamicParams:{source:"data:"+media+"/test;base64,AAAA",strength:0.7},
    })));
    await user.click(within(dock).getByRole("button",{name:"제거"}));
    expect(screen.getByRole("button",{name:"생성"})).toBeDisabled();
  });

});
