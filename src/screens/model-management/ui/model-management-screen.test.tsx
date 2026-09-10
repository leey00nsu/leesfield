import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  modelCatalog,
  type ModelCatalogItem,
} from "@/features/model-management/model/model-catalog";
import { ModelManagementScreen } from "@/screens/model-management/ui/model-management-screen";
import { renderWithIntl } from "@/test-utils/intl";

type AdminModelRecord = {
  id: string;
  type: "image" | "video" | "audio";
  key: string;
  label: string;
  vendor: string;
  provider: string;
  providerConfig: Record<string, unknown>;
  parameters: Record<string, unknown>;
  meta: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

function toRecord(item: ModelCatalogItem): AdminModelRecord {
  const base = {
    id: `id-${item.key}`,
    type: item.type,
    key: item.key,
    label: item.label,
    vendor: item.vendor,
    provider: item.provider,
    providerConfig: {},
    parameters: {},
    isActive: item.isActive,
    isDefault: item.isDefault,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (item.type === "image") {
    return {
      ...base,
      meta: {
        pipeline: item.meta.pipeline,
        model_id: item.meta.modelId,
        default_width: item.meta.defaultWidth,
        default_height: item.meta.defaultHeight,
        default_steps: item.meta.defaultSteps,
        max_input_images: item.meta.maxInputImages,
      },
    };
  }

  if (item.type === "video") {
    return {
      ...base,
      meta: {
        supports_init_image: item.meta.supportsInitImage,
        t2v_model_id: item.meta.t2vModelId,
        i2v_model_id: item.meta.i2vModelId,
        default_width: item.meta.defaultWidth,
        default_height: item.meta.defaultHeight,
        default_duration_sec: item.meta.defaultDurationSec,
        default_fps: item.meta.defaultFps,
        default_steps: item.meta.defaultSteps,
        default_guidance_scale: item.meta.defaultGuidanceScale,
      },
    };
  }

  return {
    ...base,
    meta: {
      model_id: item.meta.modelId,
      default_speed: item.meta.defaultSpeed,
      supports_input_audio: item.meta.supportsInputAudio,
    },
  };
}

const audioModelFixture: ModelCatalogItem = {
  type: "audio",
  key: "qwen-tts-faster",
  label: "Qwen TTS Faster",
  vendor: "HUGGINGFACE",
  provider: "hf_space",
  isActive: true,
  isDefault: false,
  meta: {
    modelId: "leey00nsu/qwen-3.5-tts-faster-gradio",
    defaultSpeed: 1,
    supportsInputAudio: false,
  },
};

const records = [
  ...modelCatalog.map((item) => toRecord(item)),
  toRecord(audioModelFixture),
];
const imageModel = records.find((item) => item.type === "image");
const videoModel = records.find((item) => item.type === "video");
const audioModel = records.find((item) => item.type === "audio");

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: records }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModelManagementScreen", () => {
  it.each([false,true])("Modal 가져오기 결과를 그대로 저장한다 (structured=%s)", async (structured) => {
    const { buildModalModelDraft } = await import("@/server/modal-comfyui/importer");
    const { modelCatalogInputSchema } = await import("@/server/model-catalog/catalog-schema");
    const { default: workflows } = await import("@/server/modal-comfyui/fixtures/workflows.json");
    const raw=structuredClone(workflows.find(w => w.id === "krea2-t2i")!);
    if(structured){raw.id="new-workflow";Object.assign(raw.input_schema.properties,{optional_value:{type:["string","null"],default:null},options:{type:"object",properties:{count:{type:"integer"}},default:{count:2}}});}
    const draft = buildModalModelDraft(raw);
    const save = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      if (url === "/api/admin/models/modal-comfyui") return {
        ok: true,
        json: async () => init?.method === "POST" ? { draft } : {
          items: [{ id: raw.id, name: draft.label, type: "image", supported: true, message: null }],
        },
      };
      if (init?.method === "POST") {
        const payload = JSON.parse(init.body);
        save(modelCatalogInputSchema.parse(payload));
        return { ok: true, json: async () => payload };
      }
      return { ok: true, json: async () => ({ items: records }) };
    }));
    const user = userEvent.setup();
    renderWithIntl(<ModelManagementScreen />);
    await screen.findByText(imageModel!.label);
    await user.click(screen.getByRole("button", { name: "모델 추가" }));
    await user.click(screen.getByRole("button", { name: "Modal ComfyUI" }));
    await user.click(screen.getByRole("button", { name: "워크플로우 조회" }));
    await user.click(await screen.findByRole("button", { name: "선택한 워크플로우 가져오기" }));
    await screen.findByDisplayValue(draft.key);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ provider: "modal_comfyui", key: draft.key })));
    expect(screen.queryByText("JSON 형식이 올바르지 않습니다.")).not.toBeInTheDocument();
  });

  it("reuses the cached catalog on return navigation", async () => {
    mockFetch();
    const view = renderWithIntl(<ModelManagementScreen />);
    await screen.findByText(imageModel!.label);
    expect(fetch).toHaveBeenCalledTimes(1);
    view.rerender(<div />);
    view.rerender(<ModelManagementScreen />);
    expect(screen.getByText(imageModel!.label)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("모델 타입 필터가 동작한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    mockFetch();

    const user = userEvent.setup();
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => undefined;
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => undefined;
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => undefined;
    }

    renderWithIntl(<ModelManagementScreen />);

    const imageLabels = await screen.findAllByText(imageModel!.label);
    expect(imageLabels.length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("검색…")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "모델 정렬" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "모델 관리" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^총\s/)).not.toBeInTheDocument();
    const toolbar = document.querySelector("[data-app-filter-toolbar]");
    expect(toolbar).toBeInTheDocument();
    expect(toolbar).toHaveClass("lg:flex-wrap");
    expect(screen.getByRole("button", { name: "전체" })).not.toHaveClass(
      "rounded-none",
    );

    await user.click(screen.getByRole("button", { name: "이미지" }));

    await waitFor(() => {
      expect(screen.queryAllByText(videoModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(imageModel!.label).length).toBeGreaterThan(
        0,
      );
    });
  });

  it("기본 정렬은 최신 업데이트 순서로 모델 row를 보여준다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    const olderImage = {
      ...imageModel!,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const newerVideo = {
      ...videoModel!,
      createdAt: "2026-02-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [olderImage, newerVideo] }),
      }),
    );

    renderWithIntl(<ModelManagementScreen />);

    await screen.findByText(newerVideo.label);
    const labels = Array.from(
      document.querySelectorAll("[data-model-row] h3"),
    ).map((node) => node.textContent);

    expect(labels[0]).toBe(newerVideo.label);
    expect(labels[1]).toBe(olderImage.label);
  });

  it("검색어로 모델 목록을 필터링한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    mockFetch();

    const user = userEvent.setup();

    renderWithIntl(<ModelManagementScreen />);

    const videoLabels = await screen.findAllByText(videoModel!.label);
    expect(videoLabels.length).toBeGreaterThan(0);

    const input = screen.getByPlaceholderText("검색…");

    await user.clear(input);
    await user.type(input, videoModel!.key);

    await waitFor(() => {
      expect(screen.queryAllByText(imageModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(videoModel!.label).length).toBeGreaterThan(
        0,
      );
    });
  });

  it("모달리티 배지를 표시한다", async () => {
    expect(imageModel).toBeDefined();
    expect(audioModel).toBeDefined();
    const imageModelLabel = imageModel?.label;
    expect(imageModelLabel).toBeDefined();

    mockFetch();

    renderWithIntl(<ModelManagementScreen />);

    expect(
      (await screen.findAllByText(imageModelLabel ?? "")).length,
    ).toBeGreaterThan(0);

    expect(screen.getAllByText(/T2I/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/I2I/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/T2V/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/I2V/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/T2A/).length).toBeGreaterThan(0);
  });

  it("오디오 타입 필터와 생성 폼 기본값을 지원한다", async () => {
    expect(audioModel).toBeDefined();

    mockFetch();

    const user = userEvent.setup();

    renderWithIntl(<ModelManagementScreen />);

    await screen.findAllByText(audioModel!.label);

    await user.click(screen.getByRole("button", { name: "오디오" }));

    await waitFor(() => {
      expect(screen.queryAllByText(audioModel!.label).length).toBeGreaterThan(
        0,
      );
      expect(screen.queryAllByText(imageModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(videoModel!.label)).toHaveLength(0);
    });

    await user.click(screen.getByRole("button", { name: "모델 추가" }));
    const typeSelect = screen.getByRole("combobox", { name: "유형" });
    expect(typeSelect).toHaveAttribute("data-app-select");
    expect(
      document.querySelector("[data-app-select-native]"),
    ).not.toBeInTheDocument();
    await user.click(typeSelect);
    await user.click(screen.getByRole("option", { name: "오디오" }));

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "유형" })).toHaveTextContent(
        "오디오",
      );
      expect(screen.getByDisplayValue(/run_generation/)).toBeTruthy();
      expect(screen.getByDisplayValue(/default_speed/)).toBeTruthy();
      expect(screen.getByDisplayValue(/referenceText/)).toBeTruthy();
      expect(screen.getByDisplayValue(/inputAudio/)).toBeTruthy();
    });
  });

  it("HF Space import로 qwen clone draft를 반영한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: records }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          apiNames: ["/toggle_mode", "/run_generation"],
          resolvedApiName: "/run_generation",
          warnings: ["OPTIONAL_LABEL_REVIEW:in_1"],
          draft: {
            type: "audio",
            key: "leey00nsu-qwen-3-5-tts-faster-gradio",
            label: "Faster Qwen3 TTS",
            vendor: "HUGGINGFACE",
            provider: "hf_space",
            isActive: true,
            isDefault: false,
            providerConfig: {
              space_id: "leey00nsu/qwen-3.5-tts-faster-gradio",
              api_name: "/run_generation",
              timeout_ms: 300000,
              output: { media: "audio", path: [0], multiple: false },
            },
            parameters: {
              prompt: { ui: "textarea", required: true },
              inputAudio: { ui: "upload", required: true },
              referenceText: { ui: "textarea", required: true },
            },
            meta: {
              model_id: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
              default_speed: 1,
              concurrent_limit: 1,
              supports_input_audio: true,
            },
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    renderWithIntl(<ModelManagementScreen />);

    await screen.findAllByText(audioModel!.label);

    await user.click(screen.getByRole("button", { name: "모델 추가" }));
    fireEvent.change(
      screen.getByPlaceholderText("https://huggingface.co/spaces/owner/space"),
      {
        target: {
          value:
            "https://huggingface.co/spaces/leey00nsu/qwen-3.5-tts-faster-gradio",
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "가져오기" }));

    await waitFor(() => {
      expect(
        screen.getAllByDisplayValue(/run_generation/).length,
      ).toBeGreaterThan(0);
      expect(screen.getByDisplayValue(/supports_input_audio/)).toBeTruthy();
      expect(screen.getByText(/API에는 생략 또는 null 허용이 명시되지 않았습니다/)).toBeVisible();
      expect(screen.getByRole("alert")).toHaveClass("text-destructive");
      expect(screen.getByRole("alert")).toHaveTextContent("공개 API의 입력 조건");
      expect(screen.queryByText("이 스페이스는 공개 Gradio API를 제공하지 않습니다.")).not.toBeInTheDocument();
      expect(screen.queryByText(/OPTIONAL_LABEL_REVIEW/)).not.toBeInTheDocument();
      expect(screen.queryByText("Gradio 계약 보정")).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/계약 검토 완료/)).not.toBeInTheDocument();
      const providerJson = screen.getByDisplayValue(/timeout_ms/);
      expect(providerJson).not.toBeDisabled();
      fireEvent.change(providerJson, { target: { value: JSON.stringify({ space_id: "example/tts", api_name: "/speak", output: { media: "audio", path: [1], multiple: false } }) } });
      expect(providerJson).toHaveValue(JSON.stringify({ space_id: "example/tts", api_name: "/speak", output: { media: "audio", path: [1], multiple: false } }));
      expect(screen.getByDisplayValue(/referenceText/)).toBeTruthy();
      expect(screen.getByDisplayValue(/inputAudio/)).toBeTruthy();
    });
  }, 15_000);
  it("공개 API가 없는 경우 빨간 안내를 표시한다",async()=>{
    vi.stubGlobal("fetch",vi.fn()
      .mockResolvedValueOnce({ok:true,json:async()=>({items:records})})
      .mockResolvedValueOnce({ok:false,json:async()=>({message:"SPACE_API_NOT_FOUND"})}));
    const user=userEvent.setup();renderWithIntl(<ModelManagementScreen />);
    await screen.findAllByText(audioModel!.label);
    await user.click(screen.getByRole("button",{name:"모델 추가"}));
    fireEvent.change(screen.getByPlaceholderText("https://huggingface.co/spaces/owner/space"),{target:{value:"https://huggingface.co/spaces/example/app"}});
    await user.click(screen.getByRole("button",{name:"가져오기"}));
    expect(await screen.findByText("이 스페이스는 공개 Gradio API를 제공하지 않습니다.")).toHaveClass("text-destructive");
  });

});
