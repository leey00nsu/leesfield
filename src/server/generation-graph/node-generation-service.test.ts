import {
  imageNodeConfigToGenerationPayload,
  createNodeGenerationService,
} from "./node-generation-service";
import {
  NodeGenerationConfigError,
  NodeGenerationInputError,
  NodeGenerationNotFoundError,
  NodeGenerationVersionConflictError,
  NodeInputLimitExceededError,
  NodeInputUnsupportedError,
} from "./node-generation-errors";
import type { NodeGenerationRepository } from "./node-generation-repository";

const config = {
  prompt: "stored prompt",
  modelKey: "model-a",
  parameters: {
    width: 1024,
    height: 768,
    imageCount: 2,
    steps: 12,
    modeChoice: "base",
    guidanceScale: 1.5,
    promptUpsampling: true,
    seed: "42",
    ignored: "value",
  },
};

function setup() {
  const repository = {
    getOwnedNode: vi.fn().mockResolvedValue({
      id: "node-1",
      type: "imageGeneration",
      configVersion: 1,
      config,
      graph: { version: 4 },
      incomingEdges: [],
    }),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as NodeGenerationRepository;
  const validate = vi.fn().mockImplementation(async (candidate) => ({
    success: true,
    data: candidate,
  }));
  const submit = vi.fn().mockResolvedValue({
    record: { id: "request-1", status: "pending", progress: 0 },
  });
  const service = createNodeGenerationService(
    repository,
    validate as never,
    submit as never,
  );
  return { repository, validate, submit, service };
}

describe("nodeGenerationService", () => {
  it("stored config를 canonical payload 후보로 변환하고 기본 Edge input은 비운다", () => {
    expect(imageNodeConfigToGenerationPayload(config)).toEqual({
      prompt: "stored prompt",
      model: "model-a",
      width: 1024,
      height: 768,
      imageCount: 2,
      steps: 12,
      modeChoice: "base",
      guidanceScale: 1.5,
      promptUpsampling: true,
      seed: "42",
      initImages: [],
    });
    expect(
      imageNodeConfigToGenerationPayload(config, ["https://assets.example.com/input.png"]),
    ).toEqual(expect.objectContaining({
      initImages: ["https://assets.example.com/input.png"],
    }));
  });

  it("owner-scoped 저장 Node를 검증해 graphNodeId와 함께 제출한다", async () => {
    const { repository, validate, submit, service } = setup();

    const result = await service.execute(
      "owner@example.com",
      "graph-1",
      "node-1",
      { expectedGraphVersion: 4 },
    );

    expect(repository.getOwnedNode).toHaveBeenCalledWith(
      "owner@example.com",
      "graph-1",
      "node-1",
    );
    expect(validate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "stored prompt", initImages: [] }),
    );
    expect(submit).toHaveBeenCalledWith({
      payload: expect.objectContaining({ prompt: "stored prompt" }),
      ownerEmail: "owner@example.com",
      graphNodeId: "node-1",
    });
    expect(result.record.id).toBe("request-1");
  });

  it("resolved Edge inputs를 canonical payload와 submission snapshot에 전달한다", async () => {
    const { repository, validate, submit, service } = setup();
    vi.mocked(repository.getOwnedNode).mockResolvedValue({
      id: "node-1",
      type: "imageGeneration",
      configVersion: 1,
      config,
      graph: { version: 4 },
      incomingEdges: [
        {
          id: "edge-primary",
          kind: "primary",
          createdAt: new Date("2026-08-24T10:00:00.000Z"),
          sourceNodeId: "node-source",
          sourceNode: {
            id: "node-source",
            selectedOutputImageId: "image-source",
            selectedOutputImage: {
              id: "image-source",
              url: "https://assets.example.com/source.png",
              generation: {
                ownerEmail: "owner@example.com",
                graphNodeId: "node-source",
                status: "completed",
              },
            },
          },
        },
      ],
    } as never);

    await service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });

    expect(validate).toHaveBeenCalledWith(expect.objectContaining({
      initImages: ["https://assets.example.com/source.png"],
    }));
    expect(submit).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        initImages: ["https://assets.example.com/source.png"],
      }),
      ownerEmail: "owner@example.com",
      graphNodeId: "node-1",
    });
  });

  it("output 선택 변경 전후 실행 payload snapshot을 서로 독립적으로 유지한다", async () => {
    const { repository, submit, service } = setup();
    const ownedNode = (imageId: string, url: string) => ({
      id: "node-1",
      type: "imageGeneration",
      configVersion: 1,
      config,
      graph: { version: 4 },
      incomingEdges: [
        {
          id: "edge-primary",
          kind: "primary",
          createdAt: new Date("2026-08-24T10:00:00.000Z"),
          sourceNodeId: "node-source",
          sourceNode: {
            id: "node-source",
            selectedOutputImageId: imageId,
            selectedOutputImage: {
              id: imageId,
              url,
              generation: {
                ownerEmail: "owner@example.com",
                graphNodeId: "node-source",
                status: "completed",
              },
            },
          },
        },
      ],
    });
    vi.mocked(repository.getOwnedNode)
      .mockResolvedValueOnce(
        ownedNode("image-before", "https://assets.example.com/before.png") as never,
      )
      .mockResolvedValueOnce(
        ownedNode("image-after", "https://assets.example.com/after.png") as never,
      );
    const submittedSnapshots: string[][] = [];
    submit.mockImplementation(async ({ payload }) => {
      submittedSnapshots.push([...(payload.initImages ?? [])]);
      return {
        record: {
          id: `request-${submittedSnapshots.length}`,
          status: "pending",
          progress: 0,
        },
      };
    });

    await service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });
    await service.execute("owner@example.com", "graph-1", "node-1", {
      expectedGraphVersion: 4,
    });

    expect(submittedSnapshots).toEqual([
      ["https://assets.example.com/before.png"],
      ["https://assets.example.com/after.png"],
    ]);
  });

  it.each([
    [
      "unsupported",
      { nodeInputReason: "unsupported", limit: 0, count: 1 },
      NodeInputUnsupportedError,
    ],
    [
      "limit exceeded",
      { nodeInputReason: "limit_exceeded", limit: 1, count: 2 },
      NodeInputLimitExceededError,
    ],
  ])("maps %s capability metadata to a typed Node input error", async (
    _label,
    params,
    ErrorType,
  ) => {
    const { repository, validate, submit, service } = setup();
    vi.mocked(repository.getOwnedNode).mockResolvedValue({
      id: "node-1",
      type: "imageGeneration",
      configVersion: 1,
      config,
      graph: { version: 4 },
      incomingEdges: [
        {
          id: "edge-reference",
          kind: "reference",
          createdAt: new Date("2026-08-24T10:00:00.000Z"),
          sourceNodeId: "node-source",
          sourceNode: {
            id: "node-source",
            selectedOutputImageId: "image-source",
            selectedOutputImage: {
              id: "image-source",
              url: "https://assets.example.com/source.png",
              generation: {
                ownerEmail: "owner@example.com",
                graphNodeId: "node-source",
                status: "completed",
              },
            },
          },
        },
      ],
    } as never);
    validate.mockResolvedValue({
      success: false,
      error: {
        issues: [{ code: "custom", path: ["initImages"], message: "invalid", params }],
        flatten: () => ({ fieldErrors: { initImages: ["invalid"] } }),
      },
    });

    await expect(
      service.execute("owner@example.com", "graph-1", "node-1", {
        expectedGraphVersion: 4,
      }),
    ).rejects.toBeInstanceOf(ErrorType);
    expect(submit).not.toHaveBeenCalled();
  });

  it("stale Graph version을 제출 전에 거부한다", async () => {
    const { submit, service } = setup();
    await expect(
      service.execute("owner@example.com", "graph-1", "node-1", {
        expectedGraphVersion: 3,
      }),
    ).rejects.toBeInstanceOf(NodeGenerationVersionConflictError);
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects client supplied Edge sources, outputs and resolved URLs", async () => {
    const { repository, submit, service } = setup();
    await expect(
      service.execute("owner@example.com", "graph-1", "node-1", {
        expectedGraphVersion: 4,
        sourceNodeId: "node-other",
        selectedOutputImageId: "image-other",
        initImages: ["https://attacker.example/input.png"],
      }),
    ).rejects.toBeInstanceOf(NodeGenerationInputError);
    expect(repository.getOwnedNode).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("runtime validation 실패를 Node config 오류로 변환한다", async () => {
    const { validate, submit, service } = setup();
    validate.mockResolvedValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { model: ["inactive"] } }) },
    });
    await expect(
      service.execute("owner@example.com", "graph-1", "node-1", {
        expectedGraphVersion: 4,
      }),
    ).rejects.toBeInstanceOf(NodeGenerationConfigError);
    expect(submit).not.toHaveBeenCalled();
  });

  it("repository ownership/not-found 오류를 숨기지 않는다", async () => {
    const { repository, service } = setup();
    vi.mocked(repository.getOwnedNode).mockRejectedValue(
      new NodeGenerationNotFoundError(),
    );
    await expect(
      service.execute("other@example.com", "graph-1", "node-1", {
        expectedGraphVersion: 4,
      }),
    ).rejects.toBeInstanceOf(NodeGenerationNotFoundError);
  });

  it("Generation 목록을 ISO DTO로 변환하고 최근 20개로 제한한다", async () => {
    const { repository, service } = setup();
    vi.mocked(repository.list).mockResolvedValue([
      {
        requestId: "request-1",
        status: "completed",
        progress: 100,
        errorMessage: null,
        createdAt: new Date("2026-08-24T10:00:00.000Z"),
        modelKey: "model-a",
        images: [
          { id: "image-1", url: "https://example.com/1.png", width: 1024, height: 768 },
        ],
      },
    ] as never);

    await expect(
      service.list("owner@example.com", "graph-1", "node-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        requestId: "request-1",
        createdAt: "2026-08-24T10:00:00.000Z",
        images: [expect.objectContaining({ id: "image-1" })],
      }),
    ]);
    expect(repository.list).toHaveBeenCalledWith(
      "owner@example.com",
      "graph-1",
      "node-1",
      20,
    );
  });
});
