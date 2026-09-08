import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";

import type { CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import messages from "@/shared/i18n/messages/en.json";

const mocks = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    prepareNodeExecution: vi.fn().mockResolvedValue(1),
    writable: true,
    updateCanonicalNodeConfig: mocks.updateConfig,
  }),
}));

vi.mock("../../hook/use-node-executions", () => ({
  useNodeExecutions: () => ({ data: [], isError: false, refetch: mocks.refetch }),
  useStartNodeExecution: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useCancelNodeExecution: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
}));

import { VideoOperationNodeControls } from "./video-operation-node-controls";

function renderControls(
  kind: Parameters<typeof VideoOperationNodeControls>[0]["kind"],
  parameters: Record<string, CanonicalJsonValue>,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <VideoOperationNodeControls
          id="video-operation-1"
          kind={kind}
          data={{
            canonicalKind: kind,
            configVersion: 1,
            config: { parameters },
            selectedOutputAssetId: null,
            ports: [],
            supported: true,
            supportReason: null,
          }}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("VideoOperationNodeControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists stripAudio only after an explicit Stitch checkbox change", () => {
    renderControls("edit.video.stitch", { repeat: 2, stripAudio: false });

    expect(screen.getByRole("spinbutton", { name: "Sequence repeat" })).toHaveValue(2);
    const stripAudio = screen.getByRole("switch", {
      name: "Remove all source and soundtrack audio",
    });
    expect(stripAudio).not.toBeChecked();

    fireEvent.click(stripAudio);
    expect(mocks.updateConfig).toHaveBeenCalledWith("video-operation-1", {
      parameters: { repeat: 2, stripAudio: true },
    });
  });

  it("restores and updates an explicit custom Ease Curve config", () => {
    renderControls("edit.video.easeCurve", {
      outputDurationMs: 2_500,
      easingPreset: null,
      bezier: [0.1, 0.2, 0.8, 0.9],
    });

    expect(screen.getByRole("combobox", { name: "Curve" })).toHaveTextContent("Custom bezier");
    expect(screen.getByRole("spinbutton", { name: "Output (s)" })).toHaveValue(2.5);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Bezier 2" }), {
      target: { value: "0.3" },
    });
    expect(mocks.updateConfig).toHaveBeenCalledWith("video-operation-1", {
      parameters: {
        outputDurationMs: 2_500,
        easingPreset: null,
        bezier: [0.1, 0.3, 0.8, 0.9],
      },
    });
  });
});
