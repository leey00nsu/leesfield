import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationModelSection", () => {
  it("opens a searchable model picker with simplified model rows", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <GenerationModelSection
        modality="image"
        items={[
          {
            id: "flux2-klein-9b",
            name: "FLUX.2 Klein 9B",
            vendor: "HUGGINGFACE",
            modalities: ["T2I", "I2I"],
          },
          {
            id: "gpt-image-2-codex",
            name: "GPT Image 2",
            vendor: "OPENAI",
            modalities: ["T2I"],
          },
        ]}
        activeId="flux2-klein-9b"
        onSelect={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /FLUX\.2 Klein 9B/i,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveClass("border-primary");

    await user.click(trigger);

    const picker = screen.getByRole("dialog", { name: "모델 선택" });
    expect(picker).toHaveClass("z-[90]");
    expect(screen.getByPlaceholderText("모델 검색...")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "추천 모델" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "전체 모델" }),
    ).toBeInTheDocument();
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.queryByText("에디토리얼·레퍼런스 이미지")).not.toBeInTheDocument();
    expect(screen.queryByText("정교한 인물/제품 컷")).not.toBeInTheDocument();
    expect(screen.queryByText("기술 정보")).not.toBeInTheDocument();
    expect(screen.queryByText("flux2-klein-9b")).not.toBeInTheDocument();
    expect(screen.getByLabelText("선택됨")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("모델 검색..."), "GPT");

    expect(screen.getByText("GPT Image 2")).toBeInTheDocument();
    expect(picker).not.toHaveTextContent("FLUX.2 Klein 9B");
  });

  it("selects a model from the picker and closes the overlay", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <GenerationModelSection
        modality="image"
        items={[
          {
            id: "z-image-turbo",
            name: "Z-Image Turbo",
            vendor: "HUGGINGFACE",
            modalities: ["T2I"],
          },
          {
            id: "flux2-klein-9b",
            name: "FLUX.2 Klein 9B",
            vendor: "HUGGINGFACE",
            modalities: ["T2I", "I2I"],
          },
        ]}
        activeId="z-image-turbo"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Z-Image Turbo/i }));
    await user.click(
      screen.getByRole("button", { name: /FLUX\.2 Klein 9B/i }),
    );

    expect(onSelect).toHaveBeenCalledWith("flux2-klein-9b");
    expect(
      screen.queryByRole("dialog", { name: "모델 선택" }),
    ).not.toBeInTheDocument();
  });
});
