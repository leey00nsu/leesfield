import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationCanvas", () => {
  it("renders empty state separately when there is no generated content", () => {
    renderWithIntl(
      <GenerationCanvas
        hasContent={false}
        emptyState={<button type="button">프리셋으로 시작</button>}
        isGenerating={false}
        status="idle"
      >
        <div>result content</div>
      </GenerationCanvas>,
    );

    expect(
      screen.getByRole("button", { name: "프리셋으로 시작" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("result content")).not.toBeInTheDocument();
  });
});
