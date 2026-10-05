// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/server/db/prisma";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { promptPresetService } from "./prompt-preset-service";

describe.skipIf(!postgresIntegrationEnabled)("개인 프리셋 persistence", () => {
  const suffix = randomUUID();
  const owner = "preset-" + suffix + "@example.com";
  const other = "other-" + suffix + "@example.com";
  const custom = (key: string) => ({
    key, name: "개인 영상", description: "saved description", modality: "video",
    prompt: "saved custom text", requiredInputs: { referenceImageCount: 0 },
    recommendedParameters: {},
  });

  afterAll(async () => {
    await prisma.promptPreset.deleteMany({ where: { ownerEmail: { in: [owner, other] } } });
  });

  it("제공 원문/개인 수정/복원을 분리하고 revision을 재사용하지 않는다", async () => {
    const original = await promptPresetService.get(owner, "character-sheet-creator");
    expect(original).toMatchObject({ revision: 1, isModified: false, builtinRevision: 1 });
    const edited = await promptPresetService.update(owner, original.key, {
      expectedRevision: 1, prompt: "saved personal character prompt", name: "개인 캐릭터",
    });
    expect(edited).toMatchObject({ revision: 2, isModified: true, prompt: "saved personal character prompt", defaultPrompt: original.prompt });
    expect((await promptPresetService.get(other, original.key)).prompt).toBe(original.prompt);
    await expect(promptPresetService.update(owner, original.key, { expectedRevision: 1, prompt: "stale" })).rejects.toMatchObject({ code: "PRESET_CONFLICT" });
    const restored = await promptPresetService.restore(owner, original.key, { expectedRevision: 2 });
    expect(restored).toMatchObject({ revision: 3, isModified: false, prompt: original.prompt, name: "Character Sheet Creator" });
    expect((await prisma.promptPreset.findUnique({ where: { ownerEmail_key: { ownerEmail: owner, key: original.key } } }))?.prompt).toBeNull();
    await expect(promptPresetService.update(owner, original.key, { expectedRevision: 1, prompt: "old again" })).rejects.toMatchObject({ code: "PRESET_CONFLICT" });
    await expect(promptPresetService.update(owner, original.key, { expectedRevision: 3, requiredInputs: { referenceImageCount: 0 } })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("동시 수정 중 하나만 성공하고 비활성 목록을 분리한다", async () => {
    const key = "custom-concurrent";
    await promptPresetService.create(owner, custom(key));
    const changes = await Promise.allSettled([
      promptPresetService.update(owner, key, { expectedRevision: 1, prompt: "edit A" }),
      promptPresetService.update(owner, key, { expectedRevision: 1, prompt: "edit B" }),
    ]);
    expect(changes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = changes.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toMatchObject({ code: "PRESET_CONFLICT" });
    const inactive = await promptPresetService.update(owner, key, { expectedRevision: 2, isActive: false });
    expect(inactive.revision).toBe(3);
    expect((await promptPresetService.list(owner, { modality: "video" })).some((preset) => preset.key === key)).toBe(false);
    expect((await promptPresetService.list(owner, { modality: "video", includeInactive: true })).find((preset) => preset.key === key)?.isActive).toBe(false);
  });

  it("다른 owner 항목을 노출하지 않고 동일 key도 독립적으로 관리한다", async () => {
    await promptPresetService.create(owner, custom("custom-private"));
    await expect(promptPresetService.get(other, "custom-private")).rejects.toMatchObject({ code: "PRESET_NOT_FOUND" });
    await expect(promptPresetService.update(other, "custom-private", { expectedRevision: 1, prompt: "steal" })).rejects.toMatchObject({ code: "PRESET_NOT_FOUND" });
    await expect(promptPresetService.remove(other, "custom-private", { expectedRevision: 1 })).rejects.toMatchObject({ code: "PRESET_NOT_FOUND" });
    await promptPresetService.create(other, { ...custom("custom-private"), prompt: "other private" });
    expect((await promptPresetService.get(owner, "custom-private")).prompt).toBe("saved custom text");
    expect((await promptPresetService.get(other, "custom-private")).prompt).toBe("other private");
  });

  it("제공 key 충돌과 custom 복원을 거절하고 삭제한 key를 재사용하지 않는다", async () => {
    await expect(promptPresetService.create(owner, { ...custom("character-sheet-creator"), modality: "image" })).rejects.toMatchObject({ code: "PRESET_CONFLICT" });
    const created = await promptPresetService.create(owner, custom("custom-delete"));
    await expect(promptPresetService.restore(owner, created.key, { expectedRevision: 1 })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await promptPresetService.remove(owner, created.key, { expectedRevision: 1 });
    await expect(promptPresetService.get(owner, created.key)).rejects.toMatchObject({ code: "PRESET_NOT_FOUND" });
    expect((await promptPresetService.list(owner, { includeInactive: true })).some((preset) => preset.key === created.key)).toBe(false);
    await expect(promptPresetService.create(owner, custom(created.key))).rejects.toMatchObject({ code: "PRESET_CONFLICT" });
    expect((await prisma.promptPreset.findUnique({ where: { ownerEmail_key: { ownerEmail: owner, key: created.key } } }))?.revision).toBe(2);
  });

  it("매체와 불일치하는 입력/권장 파라미터를 거절한다", async () => {
    await expect(promptPresetService.create(owner, {
      ...custom("custom-audio"), modality: "audio", requiredInputs: { referenceImageCount: 1 },
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(promptPresetService.create(owner, {
      ...custom("custom-video-many"), recommendedParameters: { imageCount: 9 },
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(promptPresetService.create(owner, {
      ...custom("custom-secret"), ownerEmail: other,
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
