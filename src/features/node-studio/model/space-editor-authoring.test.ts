import { describe, expect, it } from "vitest";
import type { SpaceEditorDocument } from "./space-editor-types";
import { createSpaceAuthoringNode, updateSpaceNodeAuthoringConfig } from "./space-editor-authoring";
import { createSpaceEditorSession } from "./space-editor-store";
import { runtimeImageModelsFixture, runtimeVideoModelsFixture } from "@/test-utils/fixtures/runtime-model-catalog";
import { defaultCinemaSettings, parseCinemaSettings } from "@/shared/cinema/cinema-contract";
import { validateCanonicalGraph, type CanonicalJsonValue } from "@/shared/generation-graph/canonical-graph";
import { updateGenerationGraphSchema } from "@/server/generation-graph/generation-graph-contract";
import { canonicalGraphToEditorDocument } from "./space-editor-document";

const document = (): SpaceEditorDocument => ({ schemaVersion: 3, title: "Authoring", groups: [], edges: [], nodes: [
  { id: "generation", kind: "generate.image", configVersion: 1, position: { x: 10, y: 20 }, config: { modelKey: "first", prompt: "keep", parameters: { steps: 20, seed: 123 }, presentation: { comment: "old" } }, selectedOutputAssetId: "output" },
] });
const catalog = { imageModels: runtimeImageModelsFixture, videoModels: runtimeVideoModelsFixture };
describe("native node authoring against concurrent edits", () => {
  it.each(["generate.image", "generate.video"] as const)("saves and reloads %s Cinema edits without changing prompts or model parameters", kind => {
    const draft = document();
    const base = { modelKey: "first", prompt: "keep", parameters: { seed: 0, enabled: false, dynamicParams: { nullable: null, references: [null, null] } } };
    draft.nodes[0] = { ...draft.nodes[0], kind, config: base };
    const session = createSpaceEditorSession({ id: "cinema-space", version: 1, document: draft });
    const cinema = { ...defaultCinemaSettings(), camera: "16mm-film", lens: "modern-prime", composition: "full", aperture: "f4", lighting: "window" };
    const result = session.transact(current => updateSpaceNodeAuthoringConfig(current, "generation", base, { ...base, cinema }, catalog), { origin: "user" });
    expect(result).toMatchObject({ ok: true, changed: true });
    const saved = updateGenerationGraphSchema.parse({ ...session.getDocument(), expectedVersion: 1 });
    expect(validateCanonicalGraph(saved)).toEqual([]);
    const reloaded = canonicalGraphToEditorDocument({ ...saved, minimumWriterVersion: 3, id: "cinema-space", version: 2 });
    expect(reloaded.nodes[0].config).toEqual({ ...base, cinema });
    expect(parseCinemaSettings((reloaded.nodes[0].config as typeof base & { cinema: unknown }).cinema, kind === "generate.image" ? "image" : "video")).toEqual(cinema);
    session.dispose();
  });
  it.each(["generate.image", "generate.video"] as const)("keeps %s Cinema edits canonical when a saved legacy namespace arrives after rendering", kind => {
    const draft = document(), base = draft.nodes[0].config as Record<string, CanonicalJsonValue>;
    const legacy = { schemaVersion: 1, shootingEnabled: true, focalLength: "35", camera: "auto", lens: "modern-prime" };
    draft.nodes[0] = { ...draft.nodes[0], kind, config: { ...base, cinema: legacy } };
    const session = createSpaceEditorSession({ id: "cinema-space", version: 1, document: draft });
    expect(session.getSnapshot().writable).toBe(true);
    const cinema = { ...defaultCinemaSettings(), camera: "16mm-film" };
    const result = session.transact(current => updateSpaceNodeAuthoringConfig(current, "generation", base, { ...base, cinema }, catalog), { origin: "user" });
    expect(result).toMatchObject({ ok: true, changed: true });
    const saved = updateGenerationGraphSchema.parse({ ...session.getDocument(), expectedVersion: 1 });
    expect(validateCanonicalGraph(saved)).toEqual([]);
    expect(saved.nodes[0].config).toEqual({ ...base, cinema: { ...cinema, lens: "modern-prime" } });
    session.dispose();
  });
  it("compares implicit Cinema defaults before merging a stale control snapshot", () => {
    const draft = document();
    const base = { modelKey: "first", prompt: "keep", parameters: { seed: 0 }, cinema: { schemaVersion: 2 } };
    draft.nodes[0].config = { ...base, prompt: "new prompt", parameters: { seed: 77, enabled: false },
      cinema: { ...defaultCinemaSettings(), lens: "modern-prime", lighting: "window" } };
    const next = updateSpaceNodeAuthoringConfig(draft, "generation", base,
      { ...base, cinema: { ...defaultCinemaSettings(), camera: "16mm-film" } }, catalog);
    expect(validateCanonicalGraph(next)).toEqual([]);
    expect(next.nodes[0].config).toEqual({ ...base, prompt: "new prompt", parameters: { seed: 77, enabled: false },
      cinema: { ...defaultCinemaSettings(), camera: "16mm-film", lens: "modern-prime", lighting: "window" } });
  });
  it("preserves legacy Cinema JSON during unrelated edits and upgrades only an explicit Cinema change", () => {
    const draft = document();
    const base = { modelKey: "first", prompt: "keep", parameters: { seed: 0 },
      cinema: { schemaVersion: 1, focalLength: "35", shootingEnabled: false, camera: "16mm-film", lighting: "window" } };
    draft.nodes[0].config = base;
    const unrelated = updateSpaceNodeAuthoringConfig(draft, "generation", base, { ...base, prompt: "new prompt" }, catalog);
    expect(unrelated.nodes[0].config).toMatchObject({ prompt: "new prompt", cinema: base.cinema });
    const next = updateSpaceNodeAuthoringConfig(unrelated, "generation", base,
      { ...base, cinema: { ...parseCinemaSettings(base.cinema, "image"), lens: "modern-prime" } }, catalog);
    expect(next.nodes[0].config).toEqual({ ...base, prompt: "new prompt", cinema: {
      ...defaultCinemaSettings(), lens: "modern-prime", lighting: "window",
    } });
    expect(validateCanonicalGraph(next)).toEqual([]);
  });
  it.each([
    { ...defaultCinemaSettings(), camera: "unknown" },
    { ...defaultCinemaSettings(), schemaVersion: 99 },
    { ...defaultCinemaSettings(), movement: "snorricam" },
    { ...defaultCinemaSettings(), unexpected: true },
  ])("rejects unsupported or video-only Cinema edits atomically", cinema => {
    const draft = document(), base = draft.nodes[0].config as Record<string, CanonicalJsonValue>;
    const session = createSpaceEditorSession({ id: "cinema-space", version: 1, document: draft });
    const result = session.transact(current => updateSpaceNodeAuthoringConfig(current, "generation", base, { ...base, cinema }, catalog), { origin: "user" });
    expect(result.ok).toBe(false);
    expect(session.getDocument()).toBe(draft);
    expect(session.getSnapshot().history.undo).toHaveLength(0);
    session.dispose();
  });
  it("accepts Assistant model changes through the canonical writer and retains its instruction/list format", () => {
    const draft = document();
    draft.nodes = [{ ...draft.nodes[0], id: "assistant", kind: "generate.assistant", selectedOutputAssetId: null,
      config: { modelKey: null, prompt: "Describe the references", outputMode: "list" } }];
    const session = createSpaceEditorSession({ id: "space", version: 1, document: draft });
    const base = draft.nodes[0].config;
    const result = session.transact(current => updateSpaceNodeAuthoringConfig(current, "assistant", base,
      { modelKey: "vision-llm", prompt: "Describe the references", outputMode: "list" }, catalog), { origin: "user" });
    expect(result.ok).toBe(true);
    expect(session.getDocument().nodes[0].config).toEqual({ modelKey: "vision-llm", prompt: "Describe the references", outputMode: "list" });
    session.dispose();
  });
  it("applies changed fields while preserving newer movement, output, comments and independent parameters", () => {
    const draft = document(), base = draft.nodes[0].config;
    draft.nodes[0] = { ...draft.nodes[0], position: { x: 900, y: 800 }, selectedOutputAssetId: "new-result", config: {
      modelKey: "first", prompt: "keep", parameters: { steps: 20, seed: 999, backendField: "late" }, presentation: { comment: "new" },
    } };
    const next = updateSpaceNodeAuthoringConfig(draft, "generation", base,
      { modelKey: "first", prompt: "keep", parameters: { steps: 0, seed: 123, dynamicParams: { enabled: false, empty: "", nullable: null } }, presentation: { comment: "old" } }, catalog);
    expect(next.nodes[0]).toMatchObject({ position: { x: 900, y: 800 }, selectedOutputAssetId: "new-result", config: {
      parameters: { steps: 0, seed: 999, backendField: "late", dynamicParams: { enabled: false, empty: "", nullable: null } }, presentation: { comment: "new" },
    } });
    expect(draft.nodes[0].config).toMatchObject({ parameters: { steps: 20 } });
  });
  it("treats model changes as a parameter reset and rejects a delayed edit from another model", () => {
    const draft = document(), base = draft.nodes[0].config;
    draft.nodes[0] = { ...draft.nodes[0], config: { modelKey: "first", prompt: "new prompt", parameters: { backendField: "late" }, presentation: { comment: "new" } } };
    const next = updateSpaceNodeAuthoringConfig(draft, "generation", base, { modelKey: "second", prompt: "keep", parameters: { seed: 0 }, presentation: { comment: "old" } }, catalog);
    expect(next.nodes[0].config).toEqual({ modelKey: "second", prompt: "new prompt", parameters: { seed: 0 }, presentation: { comment: "new" } });
    expect(() => updateSpaceNodeAuthoringConfig(next, "generation", base, { modelKey: "first", prompt: "stale" }, catalog)).toThrow("INPUT_TARGET_CHANGED");
  });
  it("merges independently created nested namespaces without erasing late options or nullable reference markers", () => {
    const draft = document(), base = structuredClone(draft.nodes[0].config);
    draft.nodes[0].config = { modelKey: "first", prompt: "keep", parameters: { steps: 20, seed: 123, dynamicParams: { duration: 7, references: [null, null] } }, presentation: { comment: "old" } };
    const next = updateSpaceNodeAuthoringConfig(draft, "generation", base, { modelKey: "first", prompt: "keep", parameters: { steps: 20, seed: 123, dynamicParams: { seed: 0 } }, presentation: { comment: "old" } }, catalog);
    expect(next.nodes[0].config).toMatchObject({ parameters: { dynamicParams: { duration: 7, references: [null, null], seed: 0 } } });
  });
  it("removes explicit fields but leaves unchanged optional keys and returns a stable document for a no-op", () => {
    const draft = document(), base = draft.nodes[0].config;
    expect(updateSpaceNodeAuthoringConfig(draft, "generation", base, structuredClone(base), catalog)).toBe(draft);
    const next = updateSpaceNodeAuthoringConfig(draft, "generation", base, { modelKey: "first", prompt: "keep", parameters: { seed: 123 } }, catalog);
    expect(next.nodes[0].config).toEqual({ modelKey: "first", prompt: "keep", parameters: { seed: 123 } });
    expect(() => updateSpaceNodeAuthoringConfig(draft, "deleted", base, base, catalog)).toThrow("NODE_NOT_FOUND");
  });
  it("uses only valid active owner defaults and keeps zero/false without selecting an unavailable model", () => {
    const model = { ...runtimeImageModelsFixture[0], key: "owner-default", providerConfig: undefined, parameters: {
      seed: { ui: "number", min: 0, max: 100, default: 3 }, enabled: { ui: "toggle", default: true },
    } };
    const defaults = { image: { modelKey: model.key, parameters: { seed: 0, enabled: false } } };
    const node = createSpaceAuthoringNode("generate.image", { x: 10, y: 20 }, { imageModels: [model] }, defaults);
    expect(node).toMatchObject({ position: { x: 10, y: 20 }, config: { modelKey: model.key, parameters: { seed: 0, enabled: false } } });
    expect(createSpaceAuthoringNode("generate.image", { x: 0, y: 0 }, { imageModels: [{ ...model, isActive: false }] }, defaults).config).toEqual({ prompt: "", modelKey: null, parameters: {} });
    expect(createSpaceAuthoringNode("generate.image", { x: 0, y: 0 }, { imageModels: [model] }, { image: { modelKey: model.key, parameters: { prompt: "forbidden" } } }).config).toEqual({ prompt: "", modelKey: null, parameters: {} });
  });
});
