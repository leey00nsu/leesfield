// @vitest-environment node

import { randomBytes, randomUUID } from "node:crypto";
import { vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { invalidateModelCatalogCache } from "@/server/model-catalog/catalog-service";
import { encryptModelApiKey } from "@/server/model-catalog/model-credential";
import { nodeExecutionService } from "@/server/node-executions/node-execution-service";
import { postgresIntegrationEnabled } from "@/test-utils/postgres-integration";
import { createAssistantExecution, claimAssistantExecution, latestAssistantText, settleAssistantExecution, selectAssistantItem } from "./assistant-execution-repository";
import { processAssistantJobs, stopAssistantWorker } from "./assistant-worker";

const remote = vi.hoisted(() => ({ requestRemote: vi.fn() }));
vi.mock("@/server/http/safe-remote", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/http/safe-remote")>(),
  requestRemote: remote.requestRemote,
}));

describe.skipIf(!postgresIntegrationEnabled)("Assistant execution persistence", () => {
  const suffix = randomUUID();
  const ownerEmail = `assistant-${suffix}@example.com`;
  const graphId = `assistant-graph-${suffix}`;
  const firstId = `assistant-a-${suffix}`;
  const secondId = `assistant-b-${suffix}`;
  const constructorId = `constructor-${suffix}`;
  const promptId = `prompt-${suffix}`;
  const thirdId = `assistant-c-${suffix}`;
  const modelKey = `assistant-model-${suffix}`;
  const oldKey = process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
  const calls: string[] = [];

  beforeAll(async () => {
    process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    await prisma.modelCatalog.create({ data: {
      type: "llm", key: modelKey, label: "Assistant test", vendor: "OPENAI", provider: "openai_compatible",
      providerConfig: { base_url: "https://api.openai.com/v1", model_id: "test-model", supports_images: true },
      parameters: {}, meta: {}, isActive: true, isDefault: false,
      credential: { create: encryptModelApiKey("sk-test-secret") },
    } });
    invalidateModelCatalogCache();
    await prisma.generationGraph.create({ data: {
      id: graphId, ownerEmail, title: "Assistant integration", schemaVersion: 3, minimumWriterVersion: 3,
      nodes: { create: [
        { id: firstId, kind: "generate.assistant", x: 0, y: 0, configVersion: 1, config: { prompt: "first", modelKey } },
        { id: secondId, kind: "generate.assistant", x: 300, y: 0, configVersion: 1, config: { prompt: "refine", modelKey } },
        { id: promptId, kind: "input.prompt", x: 450, y: 0, configVersion: 1, config: { text: "", variableName: "idea" } },
        { id: constructorId, kind: "process.promptConstructor", x: 600, y: 0, configVersion: 1, config: { template: "@idea" } },
        { id: thirdId, kind: "generate.assistant", x: 900, y: 0, configVersion: 1, config: { prompt: "third", modelKey } },
      ] },
      edges: { create: [
        { id: `edge-a-${suffix}`, sourceNodeId: firstId, targetNodeId: secondId, sourcePortId: "text", targetPortId: "text", sortOrder: 0 },
        { id: `edge-b-${suffix}`, sourceNodeId: secondId, targetNodeId: promptId, sourcePortId: "text", targetPortId: "text", sortOrder: 0 },
        { id: `edge-p-${suffix}`, sourceNodeId: promptId, targetNodeId: constructorId, sourcePortId: "text", targetPortId: "text", sortOrder: 0 },
        { id: `edge-c-${suffix}`, sourceNodeId: constructorId, targetNodeId: thirdId, sourcePortId: "text", targetPortId: "text", sortOrder: 0 },
      ] },
    } });
    remote.requestRemote.mockImplementation(async (_url: string, options: { body: string; headers: Record<string, string> }) => {
      expect(options.headers.authorization).toBe("Bearer sk-test-secret");
      const body = JSON.parse(options.body) as { messages: Array<{ role: string; content: string }> };
      const content = body.messages.find(message => message.role === "user")!.content;
      calls.push(content);
      const answer = content.includes("list-invalid") ? "Here are your ideas: coat, scarf"
        : content.includes("make-list") ? '{"items":["coat","coat","scarf"]}' : `answer ${calls.length}`;
      return { status: content.includes("fail") ? 500 : 200,
        body: Buffer.from(JSON.stringify({ choices: [{ message: { content: answer } }] })) };
    });
  });

  afterAll(async () => {
    await stopAssistantWorker();
    await prisma.generationGraph.deleteMany({ where: { id: graphId } });
    await prisma.modelCatalog.deleteMany({ where: { key: modelKey } });
    invalidateModelCatalogCache();
    if (oldKey === undefined) delete process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.MODEL_CREDENTIAL_ENCRYPTION_KEY = oldKey;
  });

  async function run(nodeId: string) {
    const started = await nodeExecutionService.execute(ownerEmail, graphId, nodeId, { expectedGraphVersion: 1 });
    expect(started.mediaType).toBe("text");
    for (let attempt = 0; attempt < 30; attempt++) {
      await processAssistantJobs();
      const execution = await nodeExecutionService.get(ownerEmail, graphId, nodeId, started.record.id);
      if (["completed", "failed", "cancelled"].includes(execution.status)) return execution;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Assistant execution did not settle");
  }

  it("stores success, resolves text edges through Prompt Constructor, and keeps the last success after failure", async () => {
    expect((await run(firstId)).outputText).toBe("answer 1");
    expect((await run(secondId)).outputText).toBe("answer 2");
    expect(calls[1]).toContain("answer 1");
    expect((await run(thirdId)).outputText).toBe("answer 3");
    expect(calls[2]).toContain("answer 2");
    expect((await nodeExecutionService.list(ownerEmail, graphId, thirdId))[0].outputText).toBe("answer 3");

    await prisma.generationGraphNode.update({ where: { id: firstId }, data: { config: { prompt: "fail", modelKey } } });
    expect((await run(firstId)).errorCode).toBe("ASSISTANT_PROVIDER_REJECTED");
    expect(await latestAssistantText(ownerEmail, graphId, firstId)).toBe("answer 1");
    expect((await nodeExecutionService.list(ownerEmail, graphId, firstId)).map((item) => item.status)).toEqual(["failed", "completed"]);
  });

  it("persists list selection, guards ownership/version/latest, and freezes downstream input despite later selections", async () => {
    await prisma.generationGraphNode.update({ where: { id: firstId }, data: { config: { prompt: "make-list", modelKey, outputMode: "list" } } });
    const list = await run(firstId);
    expect(list).toMatchObject({ status: "completed", outputMode: "list", outputText: "1. coat\n\n2. coat\n\n3. scarf", selectionVersion: 0 });
    expect(list.outputItems?.map(item => item.id)).toEqual([`${list.executionId}:1`, `${list.executionId}:2`, `${list.executionId}:3`]);
    const scarf = list.outputItems![2].id;
    expect(list.selectedItemId).toBe(list.outputItems![0].id);
    const update = { action: "select-item", itemId: scarf, expectedSelectionVersion: 0 };
    expect(await nodeExecutionService.update(ownerEmail, graphId, firstId, list.executionId, update)).toMatchObject({ selectedItemId: scarf, selectionVersion: 1 });
    await expect(selectAssistantItem("other@example.com", graphId, firstId, list.executionId, update)).rejects.toThrow("NODE_EXECUTION_NOT_FOUND");
    await expect(selectAssistantItem(ownerEmail, graphId, secondId, list.executionId, update)).rejects.toThrow("NODE_EXECUTION_NOT_FOUND");
    await expect(selectAssistantItem(ownerEmail, graphId, firstId, list.executionId, update)).rejects.toThrow("ASSISTANT_SELECTION_CONFLICT");
    await expect(selectAssistantItem(ownerEmail, graphId, firstId, list.executionId, { ...update, expectedSelectionVersion: 1, itemId: "absent" })).rejects.toThrow("NODE_EXECUTION_INPUT_INVALID");
    expect(await latestAssistantText(ownerEmail, graphId, firstId, "item")).toBe("scarf");
    expect(await latestAssistantText(ownerEmail, graphId, firstId, "text")).toBe("1. coat\n\n2. coat\n\n3. scarf");
    await prisma.generationGraphNode.update({ where: { id: firstId }, data: { x: 30, config: { prompt: "updated draft", modelKey, outputMode: "text" } } });
    expect((await nodeExecutionService.list(ownerEmail, graphId, firstId)).find(row => row.executionId === list.executionId)).toMatchObject({ selectedItemId: scarf, selectionVersion: 1, outputMode: "list" });
    await prisma.generationGraphEdge.update({ where: { id: `edge-a-${suffix}` }, data: { sourcePortId: "item" } });
    const next = await nodeExecutionService.execute(ownerEmail, graphId, secondId, { expectedGraphVersion: 1 });
    await selectAssistantItem(ownerEmail, graphId, firstId, list.executionId, { ...update, itemId: list.outputItems![0].id, expectedSelectionVersion: 1 });
    expect((await prisma.assistantExecution.findUniqueOrThrow({ where: { id: next.record.id } })).inputSnapshot).toMatchObject({ text: "scarf" });
    await processAssistantJobs();
    expect(calls.some(content => content === "refine\n\nscarf")).toBe(true);
    await prisma.generationGraphEdge.update({ where: { id: `edge-b-${suffix}` }, data: { sourceNodeId: firstId, sourcePortId: "item" } });
    expect((await run(thirdId)).status).toBe("completed");
    expect(calls.some(content => content === "third\n\ncoat")).toBe(true);
    await prisma.generationGraphNode.update({ where: { id: firstId }, data: { config: { prompt: "list-invalid", modelKey, outputMode: "list" } } });
    const before = calls.length;
    expect(await run(firstId)).toMatchObject({ status: "failed", errorCode: "ASSISTANT_LIST_INVALID" });
    expect(calls).toHaveLength(before + 1);
    expect(await latestAssistantText(ownerEmail, graphId, firstId, "item")).toBe("coat");
    expect((await nodeExecutionService.get(ownerEmail, graphId, firstId, list.executionId)).selectionVersion).toBe(2);
    await prisma.generationGraphNode.update({ where: { id: firstId }, data: { config: { prompt: "ordinary", modelKey } } });
    expect((await run(firstId)).status).toBe("completed");
    expect(await latestAssistantText(ownerEmail, graphId, firstId, "item")).toBeNull();
    await expect(selectAssistantItem(ownerEmail, graphId, firstId, list.executionId, { ...update, expectedSelectionVersion: 2 })).rejects.toThrow("ASSISTANT_SELECTION_CONFLICT");
    await expect(nodeExecutionService.execute(ownerEmail, graphId, secondId, { expectedGraphVersion: 1 })).rejects.toThrow("NODE_INPUT_INVALID");
  });

  it("cancels pending runs and fences stale completions", async () => {
    const pending = await createAssistantExecution({ ownerEmail, graphId, graphNodeId: firstId, modelKey,
      snapshot: { instruction: "cancel", text: null, assets: [] } });
    expect((await nodeExecutionService.cancel(ownerEmail, graphId, firstId, pending.id)).status).toBe("cancelled");
    expect(await claimAssistantExecution(pending.id)).toBeNull();
    const next = await createAssistantExecution({ ownerEmail, graphId, graphNodeId: firstId, modelKey,
      snapshot: { instruction: "claim", text: null, assets: [] } });
    const claimed = await claimAssistantExecution(next.id);
    expect(claimed).not.toBeNull();
    if (!claimed) return;
    await prisma.assistantExecution.update({ where: { id: next.id }, data: { cancelRequestedAt: new Date() } });
    await expect(settleAssistantExecution(next.id, claimed.lease, { text: "late" })).rejects.toThrow("ASSISTANT_LEASE_LOST");
  });
});
