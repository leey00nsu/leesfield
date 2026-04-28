import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationModelSection", () => {
  it("shows outcome metadata before technical key/vendor details", () => {
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
        ]}
        activeId="flux2-klein-9b"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("에디토리얼·레퍼런스 이미지")).toBeInTheDocument();
    expect(screen.getByText("정교한 인물/제품 컷")).toBeInTheDocument();
    expect(screen.getByText("기술 정보")).toBeInTheDocument();
    expect(screen.getByText("flux2-klein-9b")).toBeInTheDocument();
  });
});
