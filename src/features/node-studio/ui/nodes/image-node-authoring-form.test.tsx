import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runtimeImageModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";

const state = vi.hoisted(() => ({
  imageModels: [] as typeof runtimeImageModelsFixture,
  isLoading: false,
  error: null as string | null,
  retry: vi.fn(),
  update: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    imageModels: state.imageModels,
    isLoading: state.isLoading,
    error: state.error,
    retry: state.retry,
    updateImageNodeConfig: state.update,
  }),
}));

import { ImageNodeAuthoringForm } from "./image-node-authoring-form";

const config = {
  prompt: "draft prompt",
  modelKey: null,
  parameters: {},
};

describe("ImageNodeAuthoringForm", () => {
  beforeEach(() => {
    state.imageModels = runtimeImageModelsFixture;
    state.isLoading = false;
    state.error = null;
    state.retry.mockReset();
    state.update.mockReset();
  });

  it("publishes prompt edits and waits for IME composition to finish", () => {
    render(<ImageNodeAuthoringForm nodeId="node_a" config={config} />);
    const prompt = screen.getByRole("textbox", { name: "node.promptLabel" });

    fireEvent.compositionStart(prompt);
    fireEvent.change(prompt, { target: { value: "작성 중" } });
    expect(state.update).not.toHaveBeenCalled();

    fireEvent.compositionEnd(prompt);
    expect(state.update).toHaveBeenLastCalledWith(
      "node_a",
      expect.objectContaining({ prompt: "작성 중" }),
    );
  });

  it("applies selected model defaults while preserving the prompt", async () => {
    const user = userEvent.setup();
    render(<ImageNodeAuthoringForm nodeId="node_a" config={config} />);

    await user.click(screen.getByRole("button", { name: /node.chooseModel/i }));
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(runtimeImageModelsFixture[0]!.label, "i"),
      }),
    );

    expect(state.update).toHaveBeenCalledWith(
      "node_a",
      expect.objectContaining({
        prompt: "draft prompt",
        modelKey: runtimeImageModelsFixture[0]!.key,
        parameters: expect.objectContaining({ width: expect.any(Number) }),
      }),
    );
  });

  it("keeps an unavailable saved model visible until the user selects another", () => {
    render(
      <ImageNodeAuthoringForm
        nodeId="node_a"
        config={{ ...config, modelKey: "retired/model", parameters: { width: 777 } }}
      />,
    );

    expect(screen.getByRole("button", { name: /node.modelUnavailable/i })).toBeInTheDocument();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("distinguishes catalog loading, error with retry, and empty states", () => {
    state.imageModels = [];
    state.isLoading = true;
    const { rerender } = render(<ImageNodeAuthoringForm nodeId="node_a" config={config} />);
    expect(screen.getByText("node.modelLoading")).toBeInTheDocument();

    state.isLoading = false;
    state.error = "failed";
    rerender(<ImageNodeAuthoringForm nodeId="node_a" config={config} />);
    fireEvent.click(screen.getByRole("button", { name: "actions.retry" }));
    expect(state.retry).toHaveBeenCalledOnce();

    state.error = null;
    rerender(<ImageNodeAuthoringForm nodeId="node_a" config={config} />);
    expect(screen.getByText("node.modelEmpty")).toBeInTheDocument();
  });
});
