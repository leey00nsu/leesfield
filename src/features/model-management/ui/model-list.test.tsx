import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelList } from "@/features/model-management/ui/model-list";
import type { ModelCatalogItem } from "@/features/model-management/model/model-catalog";
import { renderWithIntl } from "@/test-utils/intl";

const modelItemFixture: ModelCatalogItem = {
  type: "image",
  key: "test-model",
  label: "Test Model",
  vendor: "HUGGINGFACE",
  provider: "hf_space",
  isActive: true,
  isDefault: false,
  meta: {
    pipeline: "diffusion",
    modelId: "owner/model",
    defaultWidth: 1024,
    defaultHeight: 1024,
    defaultSteps: 10,
    maxInputImages: 0,
  },
};

describe("ModelList", () => {
  it("uses grid layout for model cards", () => {
    const { container } = renderWithIntl(<ModelList items={[modelItemFixture]} />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    const className = wrapper?.getAttribute("class") ?? "";
    expect(className).toContain("grid");
    expect(className).toContain("grid-cols-1");
    expect(className).toContain("sm:grid-cols-2");
    expect(className).toContain("xl:grid-cols-3");
    expect(className).not.toContain("columns-1");
  });

  it("shows outcome metadata while keeping provider/key as supporting meta", () => {
    renderWithIntl(<ModelList items={[modelItemFixture]} />);

    expect(screen.getByText("추천 용도")).toBeInTheDocument();
    expect(screen.getByText("빠른 이미지 초안")).toBeInTheDocument();
    expect(screen.getByText("결과 톤")).toBeInTheDocument();
    expect(screen.getByText("선명한 프롬프트 기반 컷")).toBeInTheDocument();
    expect(screen.getByText("기술 정보")).toBeInTheDocument();
    expect(screen.getByText(/hf_space/)).toBeInTheDocument();
    expect(screen.getByText(/test-model/)).toBeInTheDocument();
  });
});
