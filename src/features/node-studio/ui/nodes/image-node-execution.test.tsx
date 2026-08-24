import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  selectOutput: vi.fn(),
  mutate: vi.fn(),
  query: {
    data: [] as Array<Record<string, unknown>>,
    isError: false,
  },
  mutation: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock("next/image", () => ({
  default: ({
    fill,
    unoptimized,
    alt,
    src,
  }: {
    fill?: boolean;
    unoptimized?: boolean;
    alt: string;
    src: string;
  }) => {
    void fill;
    void unoptimized;
    return <span role="img" aria-label={alt} data-src={src} />;
  },
}));
vi.mock("../../model/node-authoring-context", () => ({
  useNodeAuthoring: () => ({
    graphId: "graph-1",
    prepareImageNodeExecution: mocks.prepare,
    selectImageNodeOutput: mocks.selectOutput,
  }),
}));
vi.mock("../../hook/use-node-generations", () => ({
  useNodeGenerations: () => mocks.query,
  useExecuteNodeGeneration: () => mocks.mutation,
}));

import { ImageNodeExecution } from "./image-node-execution";

const config = {
  prompt: "a quiet lake",
  modelKey: "model-a",
  parameters: {},
};

function record(
  status: "pending" | "processing" | "completed" | "failed",
  images: Array<Record<string, unknown>> = [],
) {
  return {
    requestId: `request-${status}`,
    status,
    progress: status === "processing" ? 45 : status === "completed" ? 100 : 0,
    errorMessage: status === "failed" ? "provider failed" : null,
    createdAt: "2026-08-24T00:00:00.000Z",
    modelKey: "model-a",
    images,
  };
}

describe("ImageNodeExecution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.data = [];
    mocks.query.isError = false;
    mocks.mutation.isPending = false;
    mocks.mutation.mutateAsync = mocks.mutate;
    mocks.prepare.mockResolvedValue(4);
    mocks.mutate.mockResolvedValue({ requestId: "request-1" });
  });

  it("saves the Graph before running the Node", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ImageNodeExecution nodeId="node-1" config={config} selectedOutputImageId={null} expanded />,
    );

    await user.click(screen.getByRole("button", { name: "실행" }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({
      graphId: "graph-1",
      nodeId: "node-1",
      expectedGraphVersion: 4,
    });
  });

  it("shows progress and prevents an active Node rerun", () => {
    mocks.query.data = [record("processing")];
    renderWithIntl(
      <ImageNodeExecution nodeId="node-1" config={config} selectedOutputImageId={null} expanded />,
    );

    expect(screen.getByText(/생성 중/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "45");
    expect(screen.getByRole("button", { name: "다시 실행" })).toBeDisabled();
  });

  it("shows the latest successful result and bounded history", () => {
    mocks.query.data = [
      record("completed", [
        {
          id: "image-1",
          url: "https://example.com/result.png",
          width: 1024,
          height: 1024,
        },
      ]),
      record("failed"),
    ];
    renderWithIntl(
      <ImageNodeExecution nodeId="node-1" config={config} selectedOutputImageId="image-1" expanded />,
    );

    expect(screen.getByRole("img", { name: "최신 생성 결과" })).toHaveAttribute(
      "data-src",
      "https://example.com/result.png",
    );
    expect(screen.getByText("Generation 이력 2개")).toBeInTheDocument();
  });

  it("shows a failure and lets the user retry", async () => {
    const user = userEvent.setup();
    mocks.query.data = [record("failed")];
    renderWithIntl(
      <ImageNodeExecution nodeId="node-1" config={config} selectedOutputImageId={null} expanded />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("provider failed");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.prepare).toHaveBeenCalledOnce();
  });

  it("keeps compact status and result accessible on a collapsed Node", () => {
    mocks.query.data = [
      record("completed", [
        {
          id: "image-1",
          url: "https://example.com/result.png",
          width: 1024,
          height: 1024,
        },
      ]),
    ];
    renderWithIntl(
      <ImageNodeExecution
        nodeId="node-1"
        config={config}
        selectedOutputImageId="image-1"
      />,
    );
    expect(screen.getByText("생성 완료")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "최신 생성 결과" })).toBeInTheDocument();
  });

  it("selects the first successful output once when no selection exists", async () => {
    mocks.query.data = [
      record("completed", [
        {
          id: "image-1",
          url: "https://example.com/1.png",
          width: 1024,
          height: 1024,
        },
      ]),
    ];
    renderWithIntl(
      <ImageNodeExecution
        nodeId="node-1"
        config={config}
        selectedOutputImageId={null}
        expanded
      />,
    );
    expect(mocks.selectOutput).toHaveBeenCalledWith("node-1", "image-1");
  });

  it("allows manual output selection without overwriting an existing selection", async () => {
    const user = userEvent.setup();
    mocks.query.data = [
      record("completed", [
        {
          id: "image-new",
          url: "https://example.com/new.png",
          width: 1024,
          height: 1024,
        },
        {
          id: "image-old",
          url: "https://example.com/old.png",
          width: 1024,
          height: 1024,
        },
      ]),
    ];
    renderWithIntl(
      <ImageNodeExecution
        nodeId="node-1"
        config={config}
        selectedOutputImageId="image-old"
        expanded
      />,
    );

    expect(mocks.selectOutput).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "결과 2 선택" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "결과 1 선택" }));
    expect(mocks.selectOutput).toHaveBeenCalledWith("node-1", "image-new");
  });
});
