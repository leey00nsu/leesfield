// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { collectCompletedModalJob } from "./collect-completed-job";
import { buildModalModelDraft } from "./importer";
import workflows from "./fixtures/workflows.json";
import type { ModalClient } from "./client";
import type { ModalJobRepository } from "./job-repository";

describe("read-only Modal result collection", () => {
  function setup() {
    const config = buildModalModelDraft(workflows.find(w => w.id === "minimax-h3-pdd-fl2va")).providerConfig;
    const row = { requestId: "original", jobId: "known-job", fingerprint: "known-input", createdAt: new Date(),
      submission: { inputs: {}, advanced: {}, execution: { config, values: {}, origin: "https://test.modal.run" } } };
    const repository: ModalJobRepository = {
      find: vi.fn(async () => row), acquire: vi.fn(), save: vi.fn(), release: vi.fn(),
    };
    const json = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") throw new Error("UNEXPECTED_WRITE");
      if (path.endsWith("/assets")) return { job_id: "known-job", assets: [{ id: "output", output_key: "video", media_type: "video" }], pagination: { has_more: false } };
      return { id: "known-job", status: "completed" };
    });
    const client: ModalClient = { origin: row.submission.execution.origin, json,
      upload: vi.fn(), download: vi.fn(async () => ({ buffer: Buffer.from("video"), contentType: "video/mp4", bytes: 5 })) };
    return { row, repository, client, json };
  }
  it("collects the same known completed job without any ledger write or remote submission", async () => {
    const { repository, client, json } = setup();
    const result = await collectCompletedModalJob("original", "known-job", { repository, client });
    expect(result.jobId).toBe("known-job");
    expect(result.outputs).toHaveLength(1);
    expect(json.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
    expect(client.upload).not.toHaveBeenCalled();
    expect(repository.acquire).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.release).not.toHaveBeenCalled();
  });
  it("rejects an unconfirmed remote result, changed origin or replaced durable identity", async () => {
    const { repository, client, json, row } = setup();
    json.mockResolvedValueOnce({ id: "known-job", status: "in_progress" } as never);
    await expect(collectCompletedModalJob("original", "known-job", { repository, client })).rejects.toThrow("MODAL_RECOVERY_JOB_NOT_COMPLETED");
    await expect(collectCompletedModalJob("original", "known-job", { repository, client: { ...client, origin: "https://other.modal.run" } })).rejects.toThrow("MODAL_REQUEST_ORIGIN_CHANGED");
    vi.mocked(repository.find!).mockResolvedValueOnce(row).mockResolvedValue({ ...row, jobId: "replacement" });
    await expect(collectCompletedModalJob("original", "known-job", { repository, client })).rejects.toThrow("MODAL_RECOVERY_JOB_MISMATCH");
    expect(client.upload).not.toHaveBeenCalled();
  });
});
