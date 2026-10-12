// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildModalModelDraft } from "./importer";
import workflows from "./fixtures/workflows.json";
import type { ModalClient } from "./client";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), jobFind: vi.fn(), acquire: vi.fn(), release: vi.fn(),
  execute: vi.fn(), save: vi.fn(), upload: vi.fn(), metadata: vi.fn(),
  frozen: vi.fn(), monitor: vi.fn(), stop: vi.fn(), assertOwned: vi.fn(), cleanup: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: { videoGeneration: { findUnique: mocks.find, updateMany: mocks.update } } }));
vi.mock("@/server/generation-request/request-snapshot", () => ({
  frozenExecutionModel: mocks.frozen, restoreRequest: (value: unknown) => value,
}));
vi.mock("@/server/model-catalog/generation-validation", () => ({
  validateVideoGenerationPayload: async (value: unknown) => ({ success: true, data: value }),
}));
vi.mock("@/server/generation-worker/execution-lease", () => ({ startGenerationLeaseMonitor: mocks.monitor }));
vi.mock("@/server/media-assets/media-cleanup-repository", () => ({ releaseStorageCleanupsForRequest: mocks.cleanup }));
vi.mock("@/server/video-generation/video-generation-repository", () => ({ saveVideoGenerationResult: mocks.save }));
vi.mock("@/server/video-generation/storage/adapters/leemage-storage-adapter", () => ({
  leemageVideoStorageAdapter: { uploadVideos: mocks.upload },
}));
vi.mock("./job-repository", () => ({ modalJobRepository: {
  find: mocks.jobFind, acquire: mocks.acquire, release: mocks.release, save: vi.fn(),
} }));
vi.mock("./executor", () => ({ executeModalWorkflow: mocks.execute }));
vi.mock("./output-metadata", () => ({ modalOutputMetadata: mocks.metadata }));
import { recoverModalVideoResult } from "./recover-video-result";

const expected = { requestId: "original-request", jobId: "completed-job", ownerEmail: "owner@example.test" };
const payload = { model: "original-model", prompt: "original prompt", aspectRatio: "16:9",
  resolution: 720, durationSec: 6, fps: 24, steps: 6, guidanceScale: 1 };
const config = buildModalModelDraft(workflows.find(w => w.id === "minimax-h3-pdd-fl2va")).providerConfig;
const artifact = { type: "video", mimeType: "video/mp4", bytes: 100, width: 1280, height: 720,
  durationMs: 6000, storageProvider: "leemage", storageObjectId: "stored", storageUrl: "https://storage.test/video" };
const client: ModalClient = { origin: "https://test.modal.run",
  json: vi.fn(), download: vi.fn(), upload: vi.fn() };
const job = { requestId: expected.requestId, jobId: expected.jobId, fingerprint: "fingerprint",
  submission: { execution: { origin: client.origin } }, createdAt: new Date(0) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue({ id: "generation", requestId: expected.requestId, ownerEmail: expected.ownerEmail,
    graphNodeId: null, status: "failed", errorMessage: "Modal 생성 실패: MODAL_ASSETS_RESPONSE_INVALID",
    cancelRequestedAt: null, videos: [], executionLeaseToken: null, executionLeaseUntil: null,
    executionLeaseVersion: 2, updatedAt: new Date(0), progress: 0, modelKey: payload.model, requestParams: payload });
  mocks.frozen.mockReturnValue({ providerConfig: config });
  mocks.jobFind.mockResolvedValue(job);
  mocks.acquire.mockResolvedValue({ ...job, lease: "job-lease" });
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.monitor.mockReturnValue({ stop: mocks.stop, assertOwned: mocks.assertOwned });
  vi.mocked(client.json).mockResolvedValue({ id: expected.jobId, status: "completed" });
  mocks.execute.mockResolvedValue({ jobId: expected.jobId, outputs: [{buffer:Buffer.from("video"),contentType:"video/mp4"}] });
  mocks.metadata.mockResolvedValue({ width: 1280, height: 720, duration_sec: 6 });
  mocks.upload.mockResolvedValue({ status: "completed", artifacts: [artifact], result: { videos: [{ url: artifact.storageUrl }] } });
  mocks.save.mockResolvedValue(undefined);
  mocks.cleanup.mockResolvedValue(undefined);
});

describe("operator collection of an existing completed Modal video", () => {
  it("claims only the original owner/version/state and saves durable artifacts under that lease", async () => {
    const result = await recoverModalVideoResult(expected, { client });
    expect(result).toMatchObject({ status: "completed", jobId: expected.jobId,
      outputs: [{ mimeType: "video/mp4", width: 1280, durationMs: 6000 }] });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      ownerEmail: expected.ownerEmail, updatedAt: new Date(0), status: "failed", cancelRequestedAt: null,
      videos: { none: {} }, executionLeaseToken: null, executionLeaseVersion: 2,
    }) }));
    expect(mocks.save).toHaveBeenCalledWith("generation", "completed", 100, expect.anything(),
      undefined, { token: expect.any(String), version: 3 }, [artifact]);
    expect(client.upload).not.toHaveBeenCalled();
    expect(mocks.stop).toHaveBeenCalled();
  });

  it.each([
    { ownerEmail: "other@example.test" }, { cancelRequestedAt: new Date() },
    { status: "completed" }, { videos: [{ id: "existing-output" }] },
    { executionLeaseToken: "another-worker" }, { graphNodeId: "node" },
    { errorMessage: "unrelated failure" },
  ])("rejects unsafe original state %j before any remote request", async patch => {
    mocks.find.mockResolvedValue({ ...await mocks.find(), ...patch });
    await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_RECOVERY_NOT_ELIGIBLE");
    expect(client.json).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not claim if the remote job is still running or has a different identity", async () => {
    for (const remote of [{ id: expected.jobId, status: "in_progress" }, { id: "other-job", status: "completed" }]) {
      vi.mocked(client.json).mockResolvedValue(remote);
      await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_RECOVERY_JOB_NOT_COMPLETED");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not collect when another actor changed the row before its claim", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_RECOVERY_STATE_CONFLICT");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses missing or replaced durable jobs and mismatched origins", async () => {
    for (const value of [null, { ...job, jobId: "replacement" }, { ...job, submission: null }]) {
      mocks.jobFind.mockResolvedValue(value);
      await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_RECOVERY_JOB_MISMATCH");
    }
    mocks.jobFind.mockResolvedValue({ ...job, submission: { execution: { origin: "https://changed.modal.run" } } });
    await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_REQUEST_ORIGIN_CHANGED");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("blocks generation POST, cancellation DELETE and uploads even if executor tries to write", async () => {
    mocks.execute.mockImplementation(async (_config, _payload, _request, _repository, dependencies) => {
      for (const method of ["POST", "DELETE"]) {
        await expect(dependencies.client.json("/api/jobs/completed-job", { method }))
          .rejects.toThrow("MODAL_RECOVERY_WRITE_FORBIDDEN");
      }
      await expect(dependencies.client.upload("data:image/png;base64,x"))
        .rejects.toThrow("MODAL_RECOVERY_WRITE_FORBIDDEN");
      return { jobId: expected.jobId, outputs: [{buffer:Buffer.from("video"),contentType:"video/mp4"}] };
    });
    await recoverModalVideoResult(expected, { client });
    expect(client.json).toHaveBeenCalledTimes(1);
    expect(client.upload).not.toHaveBeenCalled();
  });

  it("refuses a durable job changed between lookup and acquire and releases its job lease", async () => {
    mocks.acquire.mockResolvedValue({ ...job, jobId: "replacement", lease: "job-lease" });
    mocks.execute.mockImplementation(async (_config, _payload, request, repository) => {
      return repository.acquire(request, job.fingerprint, 1000);
    });
    await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_RECOVERY_JOB_MISMATCH");
    expect(mocks.release).toHaveBeenCalledWith(expected.requestId, "job-lease");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("never saves success on upload or lease failure; rollback remains conditional on ownership and cancellation", async () => {
    mocks.upload.mockResolvedValue({ status: "completed", errorMessage: "upload failed" });
    await expect(recoverModalVideoResult(expected, { client })).rejects.toThrow("MODAL_STORAGE_FAILED");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      cancelRequestedAt: null, executionLeaseToken: expect.any(String), executionLeaseVersion: 3,
      executionLeaseUntil: { gt: expect.any(Date) }, videos: { none: {} },
    }), data: expect.objectContaining({ status: "failed", errorMessage: "Modal 생성 실패: MODAL_ASSETS_RESPONSE_INVALID" }) }));
  });
});
