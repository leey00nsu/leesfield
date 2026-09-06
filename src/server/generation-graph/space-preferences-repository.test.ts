import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  model: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() }, transaction: vi.fn(), catalog: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: { spaceEditorPreference: mocks.model, $transaction: mocks.transaction } }));
vi.mock("@/server/model-catalog/catalog-service", () => ({ getModelCatalog: mocks.catalog }));
import { spacePreferencesRepository } from "./space-preferences-repository";
import { emptySpacePreferences } from "@/shared/generation-graph/space-preferences";

const model = { key: "image/model", type: "image", isActive: true, parameters: {
  steps: { ui: "slider", min: 1, max: 20, step: 1, default: 10 },
  shape: { ui: "select", options: [{ value: "square" }, { value: "wide" }] },
  hidden: { ui: "hidden", default: "private" }, apiKey: { ui: "input", default: "" },
} };
describe("Space preferences persistence", () => {
  it("validates combined settings before committing defaults and inline state in one CAS write", async () => {
    const defaults = { image: { modelKey: model.key, parameters: { steps: 5 } } };
    await expect(spacePreferencesRepository.update("alice", { action: "settings", expectedRevision: 0, defaults, inlineParametersEnabled: true })).resolves.toMatchObject({ defaults, inlineParametersEnabled: true, revision: 1 });
    expect(mocks.model.updateMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: expect.objectContaining({ defaults, inlineParametersEnabled: true, revision: 1 }) }));
    mocks.model.updateMany.mockClear();
    await expect(spacePreferencesRepository.update("alice", { action: "settings", expectedRevision: 0, defaults: { image: { modelKey: "unavailable", parameters: {} } }, inlineParametersEnabled: false })).rejects.toMatchObject({ code: "SPACE_DEFAULTS_INVALID" });
    expect(mocks.model.updateMany).not.toHaveBeenCalled();
  });
  it("persists the non-secret inline control preference without changing defaults or recent order", async () => {
    const stored = { ...emptySpacePreferences(), revision: 3, recentModelKeys: [model.key], defaults: { image: { modelKey: model.key, parameters: { steps: 5 } } } };
    mocks.model.upsert.mockResolvedValue(stored);
    const result = await spacePreferencesRepository.update("alice@example.com", { action: "inline", expectedRevision: 3, enabled: true });
    expect(result).toEqual({ ...stored, revision: 4, inlineParametersEnabled: true });
    expect(mocks.model.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ inlineParametersEnabled: true, defaults: stored.defaults, recentModelKeys: stored.recentModelKeys }) }));
  });
  beforeEach(() => {
    vi.resetAllMocks(); mocks.catalog.mockResolvedValue([model]);
    mocks.model.findUnique.mockResolvedValue(null);
    mocks.model.upsert.mockResolvedValue(emptySpacePreferences());
    mocks.model.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback) => callback({ spaceEditorPreference: mocks.model }));
  });
  it("reads the authenticated owner without creating/resetting a record", async () => {
    await expect(spacePreferencesRepository.get("alice@example.com")).resolves.toEqual(emptySpacePreferences());
    expect(mocks.model.findUnique).toHaveBeenCalledWith({ where: { ownerEmail: "alice@example.com" } });
    expect(mocks.model.upsert).not.toHaveBeenCalled();
  });
  it("persists a deduplicated recent model with owner/revision CAS", async () => {
    mocks.model.upsert.mockResolvedValue({ ...emptySpacePreferences(), revision: 2, recentModelKeys: ["other", model.key] });
    const result = await spacePreferencesRepository.update("alice@example.com", { action: "track", modelKey: model.key, expectedRevision: 2 });
    expect(result.recentModelKeys).toEqual([model.key]); // stale catalog keys remain stored, never projected into UI
    expect(mocks.model.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerEmail: "alice@example.com", revision: 2, schemaVersion: 1 } }));
    expect(result.revision).toBe(3);
  });
  it("rejects conflicting revisions and concurrent writes", async () => {
    await expect(spacePreferencesRepository.update("alice", { action: "track", modelKey: model.key, expectedRevision: 7 })).rejects.toMatchObject({ code: "SPACE_PREFERENCES_CONFLICT" });
    expect(mocks.model.updateMany).not.toHaveBeenCalled();
    mocks.model.updateMany.mockResolvedValue({ count: 0 });
    await expect(spacePreferencesRepository.update("alice", { action: "track", modelKey: model.key, expectedRevision: 0 })).rejects.toMatchObject({ code: "SPACE_PREFERENCES_CONFLICT" });
  });
  it("preserves stored defaults when only model usage changes", async () => {
    const defaults = { image: { modelKey: model.key, parameters: { steps: 5 } } };
    mocks.model.upsert.mockResolvedValue({ ...emptySpacePreferences(), defaults });
    const result = await spacePreferencesRepository.update("alice", { action: "track", modelKey: model.key, expectedRevision: 0 });
    expect(result.defaults).toEqual(defaults);
  });
  it("saves valid defaults and explicit resets, never arbitrary prompt/secret/hidden keys", async () => {
    const defaults = { image: { modelKey: model.key, parameters: { steps: 5, shape: "square" } } };
    await expect(spacePreferencesRepository.update("alice", { action: "defaults", defaults, expectedRevision: 0 })).resolves.toMatchObject({ defaults });
    for (const parameters of [{ steps: 100 }, { steps: 1.5 }, { shape: "invalid" }, { prompt: "private" }, { hidden: "value" }, { apiKey: "secret" }, { arbitrary: 1 }]) {
      await expect(spacePreferencesRepository.update("alice", { action: "defaults", defaults: { image: { modelKey: model.key, parameters } }, expectedRevision: 0 })).rejects.toMatchObject({ code: "SPACE_DEFAULTS_INVALID" });
    }
    await expect(spacePreferencesRepository.update("alice", { action: "defaults", defaults: {}, expectedRevision: 0 })).resolves.toMatchObject({ defaults: {} });
  });
  it("does not inject unavailable or schema-stale defaults and never overwrites the stored record on read", async () => {
    const stored = { ...emptySpacePreferences(), revision: 4, recentModelKeys: ["inactive", model.key], defaults: {
      image: { modelKey: model.key, parameters: { steps: 200 } }, video: { modelKey: "inactive", parameters: {} },
    } };
    mocks.model.findUnique.mockResolvedValue(stored);
    await expect(spacePreferencesRepository.get("alice")).resolves.toMatchObject({ revision: 4, defaults: {}, recentModelKeys: [model.key] });
    expect(stored.defaults.image.parameters.steps).toBe(200);
    expect(mocks.model.updateMany).not.toHaveBeenCalled();
    await expect(spacePreferencesRepository.update("alice", { action: "track", modelKey: "inactive", expectedRevision: 0 })).rejects.toMatchObject({ code: "SPACE_MODEL_UNAVAILABLE" });
  });
  it("rejects future schema without replacing it with empty data", async () => {
    mocks.model.findUnique.mockResolvedValue({ ...emptySpacePreferences(), schemaVersion: 9 });
    await expect(spacePreferencesRepository.get("alice")).rejects.toMatchObject({ code: "SPACE_PREFERENCES_UNSUPPORTED" });
    expect(mocks.model.updateMany).not.toHaveBeenCalled();
  });
});
