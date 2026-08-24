import { imageGenerationDefaults } from "@/features/image-generation/model/image-generation-schema";

import {
  imageNodeConfigToGenerationPayload,
  createNodeGenerationService,
} from "./node-generation-service";
import {
  NodeGenerationConfigError,
  NodeGenerationNotFoundError,
  NodeGenerationVersionConflictError,
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
    }),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as NodeGenerationRepository;
  const validate = vi.fn().mockResolvedValue({
    success: true,
    data: { ...imageGenerationDefaults, prompt: "stored prompt", model: "model-a" },
  });
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
  it("stored config를 canonical payload 후보로 변환하고 Edge input을 넣지 않는다", () => {
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

  it("stale Graph version을 제출 전에 거부한다", async () => {
    const { submit, service } = setup();
    await expect(
      service.execute("owner@example.com", "graph-1", "node-1", {
        expectedGraphVersion: 3,
      }),
    ).rejects.toBeInstanceOf(NodeGenerationVersionConflictError);
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
