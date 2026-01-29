import { screen, waitFor } from "@testing-library/react";
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
  type: "image" | "video";
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

const records = modelCatalog.map((item) => toRecord(item));
const imageModel = records.find((item) => item.type === "image");
const videoModel = records.find((item) => item.type === "video");

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
  it("모델 타입 필터가 동작한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    mockFetch();

    const user = userEvent.setup();

    renderWithIntl(<ModelManagementScreen />);

    const imageLabels = await screen.findAllByText(imageModel!.label);
    expect(imageLabels.length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "이미지" }));

    await waitFor(() => {
      expect(screen.queryAllByText(videoModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(imageModel!.label).length).toBeGreaterThan(0);
    });
  });

  it("검색어로 모델 목록을 필터링한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    mockFetch();

    const user = userEvent.setup();

    renderWithIntl(<ModelManagementScreen />);

    const videoLabels = await screen.findAllByText(videoModel!.label);
    expect(videoLabels.length).toBeGreaterThan(0);

    const input = screen.getByPlaceholderText("검색...");

    await user.clear(input);
    await user.type(input, videoModel!.key);

    await waitFor(() => {
      expect(screen.queryAllByText(imageModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(videoModel!.label).length).toBeGreaterThan(0);
    });
  });

  it("모달리티 배지를 표시한다", async () => {
    expect(imageModel).toBeDefined();
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
  });
});
