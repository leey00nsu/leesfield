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
  it("uses an app-styled compact row list", () => {
    const { container } = renderWithIntl(<ModelList items={[modelItemFixture]} />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    const className = wrapper?.getAttribute("class") ?? "";
    expect(wrapper).toHaveAttribute("data-app-card");
    expect(wrapper).toHaveAttribute("role", "list");
    expect(className).toContain("rounded-[1.1rem]");
    expect(className).not.toContain("grid-cols-1");
    expect(container.querySelector("[data-model-row]")).toBeTruthy();
    expect(container.querySelector("[data-model-row] img")).toBeNull();
    expect(container.querySelector("[data-model-type-icon]")).toBeTruthy();
  });

  it("shows compact model metadata and status", () => {
    renderWithIntl(<ModelList items={[modelItemFixture]} />);

    expect(screen.getByText("Test Model")).toBeInTheDocument();
    expect(screen.getByText("HUGGINGFACE")).toBeInTheDocument();
    expect(screen.getByText("이미지")).toBeInTheDocument();
    expect(screen.getByText("T2I")).toBeInTheDocument();
    expect(screen.getByText("활성")).toBeInTheDocument();
    expect(screen.queryByText("업데이트")).not.toBeInTheDocument();
    expect(screen.queryByText("기본값")).not.toBeInTheDocument();
    expect(screen.queryByText("1024:1024")).not.toBeInTheDocument();
    expect(screen.queryByText("10 steps")).not.toBeInTheDocument();
  });

  it("uses an even selected border for the default model row", () => {
    const { container } = renderWithIntl(
      <ModelList items={[{ ...modelItemFixture, isDefault: true }]} />,
    );

    const row = container.querySelector("[data-model-row]");
    expect(row).toHaveClass("!border-primary/70");
    expect(row).toHaveClass("ring-1");
    expect(row).toHaveClass("ring-primary/35");
  });
});
