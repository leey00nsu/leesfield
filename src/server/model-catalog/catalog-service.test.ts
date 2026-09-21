import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getModelCatalog,
  invalidateModelCatalogCache,
} from "@/server/model-catalog/catalog-service";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { listModelCatalogRecords } from "@/server/model-catalog/catalog-repository";

vi.mock("@/server/model-catalog/catalog-repository", () => ({
  listModelCatalogRecords: vi.fn(),
}));

const now = new Date("2026-01-26T00:00:00Z");

const imageModel: ModelCatalogItem = {
  id: "model-1",
  type: "image",
  key: "z-image-turbo",
  label: "Z-Image Turbo",
  vendor: "Zhipu",
  provider: "hf_space",
  providerConfig: {
    space_id: "zhipu/space",
    api_name: "/generate",
  },
  parameters: {
    prompt: { ui: "textarea" },
    width: { ui: "range", min: 256, max: 1024, step: 64 },
    height: { ui: "range", min: 256, max: 1024, step: 64 },
    steps: { ui: "range", min: 1, max: 50, step: 1 },
    imageCount: { ui: "range", min: 1, max: 1, step: 1 },
  },
  meta: {
    pipeline: "diffusion",
    model_id: "z-image-turbo",
    default_width: 512,
    default_height: 512,
    default_steps: 5,
    concurrent_limit: 1,
    max_input_images: 0,
  },
  isActive: true,
  isDefault: true,
  createdAt: now,
  updatedAt: now,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("model-catalog service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateModelCatalogCache();
  });

  it("캐시를 사용해 동일 요청을 재사용한다", async () => {
    (listModelCatalogRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      imageModel,
    ]);

    const first = await getModelCatalog();
    const second = await getModelCatalog();

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(listModelCatalogRecords).toHaveBeenCalledTimes(1);
    expect(listModelCatalogRecords).toHaveBeenCalledWith({ includeInactive: false });
  });

  it("bypassCache 옵션이면 매번 새로 조회한다", async () => {
    (listModelCatalogRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      imageModel,
    ]);

    await getModelCatalog({ bypassCache: true });
    await getModelCatalog({ bypassCache: true });

    expect(listModelCatalogRecords).toHaveBeenCalledTimes(2);
  });

  it("스키마 검증 실패 시 오류를 던진다", async () => {
    (listModelCatalogRecords as ReturnType<typeof vi.fn>).mockResolvedValue([
      { key: "broken" },
    ]);

    await expect(getModelCatalog()).rejects.toThrow("MODEL_CATALOG_INVALID");
  });

  it("동시 cache miss를 하나의 DB 조회로 합친다", async () => {
    const load = deferred<ModelCatalogItem[]>();
    (listModelCatalogRecords as ReturnType<typeof vi.fn>).mockReturnValue(
      load.promise,
    );

    const first = getModelCatalog();
    const second = getModelCatalog();

    expect(listModelCatalogRecords).toHaveBeenCalledTimes(1);
    load.resolve([imageModel]);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  it("실패한 load는 다음 요청이 다시 시도할 수 있다", async () => {
    (listModelCatalogRecords as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("temporary database failure"))
      .mockResolvedValueOnce([imageModel]);

    await expect(getModelCatalog()).rejects.toThrow("temporary database failure");
    await expect(getModelCatalog()).resolves.toEqual([imageModel]);
    expect(listModelCatalogRecords).toHaveBeenCalledTimes(2);
  });

  it("무효화 중 완료된 이전 load가 새 cache를 덮어쓰지 않는다", async () => {
    const stale = deferred<ModelCatalogItem[]>();
    (listModelCatalogRecords as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce([imageModel]);

    const staleRequest = getModelCatalog();
    invalidateModelCatalogCache();
    const freshRequest = getModelCatalog();

    await expect(freshRequest).resolves.toEqual([imageModel]);
    stale.resolve([{ ...imageModel, key: "stale-model" }]);
    await staleRequest;

    await expect(getModelCatalog()).resolves.toEqual([imageModel]);
    expect(listModelCatalogRecords).toHaveBeenCalledTimes(2);
  });
});
