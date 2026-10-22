import { describe, expect, it } from "vitest";
import { graphDocumentV3Schema, validateCanonicalGraph } from "@/shared/generation-graph/canonical-graph";
import { validateNodeConfig } from "@/shared/generation-graph/node-registry";
import { unavailableEditNodeKinds } from "@/shared/generation-graph/node-availability";
import { createQuickstartSpaceDraft } from "./quickstart-space-template";
import { getSpaceQuickstartWorkflow, spaceQuickstartTemplates } from "./space-quickstart-templates";

describe("canonical Space quickstarts", () => {
  it("keeps all six available quickstarts free of hidden and retired operations", () => {
    expect(spaceQuickstartTemplates).toHaveLength(6);
    for (const template of spaceQuickstartTemplates) {
      const workflow = getSpaceQuickstartWorkflow(template.id);
      expect(workflow.nodes.some(node => unavailableEditNodeKinds.some(kind => kind === node.kind))).toBe(false);
    }
  });
  it.each(spaceQuickstartTemplates.map(template => template.id))("creates independent empty/minimal %s drafts without results or selected models", id => {
    for (const content of ["empty", "minimal"] as const) {
      const template = getSpaceQuickstartWorkflow(id, content), before = structuredClone(template);
      const draft = createQuickstartSpaceDraft(template), other = createQuickstartSpaceDraft(template);
      const document = graphDocumentV3Schema.parse({ ...draft, id: "space", title: template.title, version: 1, schemaVersion: 3, minimumWriterVersion: 3 });
      expect(validateCanonicalGraph(document)).toEqual([]);
      expect(draft.nodes.every(node => validateNodeConfig(node.kind, node.configVersion, node.config).supported)).toBe(true);
      expect(draft.nodes.map(node => node.id)).not.toEqual(other.nodes.map(node => node.id));
      expect(draft.edges.every(edge => draft.nodes.some(node => node.id === edge.sourceNodeId) && draft.nodes.some(node => node.id === edge.targetNodeId))).toBe(true);
      expect(draft.nodes.filter(node => node.kind === "generate.image").map(node => node.config)).toEqual([{ prompt: "", modelKey: null, parameters: {} }]);
      expect(draft.nodes.every(node => node.selectedOutputAssetId === null)).toBe(true);
      expect(draft.nodes.find(node => node.kind === "input.prompt")?.config).toMatchObject({ text: content === "empty" ? "" : expect.any(String) });
      expect(template).toEqual(before);
    }
  });
  it.each(unavailableEditNodeKinds)("rejects a supplied %s quickstart without mutating its reusable graph", kind => {
    const template = getSpaceQuickstartWorkflow("product-shot");
    const workflow = { ...template, nodes: [{ ...template.nodes[0], kind, config: { parameters: {} } }] };
    const before = structuredClone(workflow);
    expect(() => createQuickstartSpaceDraft(workflow)).toThrow("Unsupported Space template.");
    expect(workflow).toEqual(before);
  });
  it("rejects unavailable operations and duplicate new IDs instead of creating a partial graph", () => {
    const template = getSpaceQuickstartWorkflow("product-shot");
    expect(() => createQuickstartSpaceDraft({ ...template, nodes: [{ ...template.nodes[0], kind: "edit.image.splitGrid" }] })).toThrow();
    expect(() => createQuickstartSpaceDraft(template, () => "duplicate")).toThrow("Invalid template IDs");
    expect(() => getSpaceQuickstartWorkflow("missing")).toThrow();
  });
});
