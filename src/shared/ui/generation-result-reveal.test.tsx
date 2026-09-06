import { screen } from "@testing-library/react";
import { it, expect } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { GenerationResultReveal } from "./generation-result-reveal";
import { GenerationCanvas } from "./generation-canvas";

it("hides idle results, shows a skeleton while running, then retains results or errors", () => {
  const ui = (visible: boolean, running: boolean, status: string) => <GenerationResultReveal visible={visible}><GenerationCanvas isGenerating={running} status={status}><span>result</span></GenerationCanvas></GenerationResultReveal>;
  const view = renderWithIntl(ui(false, false, "idle"));
  expect(screen.queryByTestId("generation-canvas")).not.toBeInTheDocument();
  view.rerender(ui(true, true, "processing"));
  expect(screen.getByTestId("generation-skeleton")).toBeInTheDocument();
  view.rerender(ui(true, false, "completed"));
  expect(screen.queryByTestId("generation-skeleton")).not.toBeInTheDocument();
  expect(screen.getByText("result")).toBeInTheDocument();
  view.rerender(ui(true, false, "failed"));
  expect(screen.getByTestId("generation-canvas")).toBeInTheDocument();
});
