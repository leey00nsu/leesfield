import type { NodeBananaRuntimeGraph } from "@node-banana-runtime/runtime-entry";

import { resolveNodeInputAssetSlots, resolveNodeInputAssetId, resolveNodeInputAssetIds, resolveNodePromptInput } from "./node-graph-inputs";
import { attachmentSlotAssetIds, replaceGenerationAttachments, replaceRelatedGenerationAttachments, generationAttachmentSlots, type GenerationAttachmentSlot } from "./generation-prompt-attachments";
import { runtimeImageModelsFixture, mappedReferenceImageModelFixture } from "@/test-utils/fixtures/runtime-model-catalog";

const graph: NodeBananaRuntimeGraph = {
  nodes: [
    { id: "prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.prompt", config: { text: "connected prompt" } } },
    { id: "image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "asset-input" } } },
    { id: "generated", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", config: {}, selectedOutputAssetId: "asset-output" } },
    { id: "target", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", config: {} } },
    { id: "annotation", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "edit.image.annotation", config: {} } },
  ],
  edges: [
    { id: "prompt-edge", source: "prompt", target: "target", sourceHandle: "text", targetHandle: "text", data: { targetPortId: "prompt" } },
    { id: "image-edge", source: "generated", target: "annotation", sourceHandle: "image", targetHandle: "image", data: { targetPortId: "image" } },
  ],
};

describe("Node graph input resolution", () => {
  it("moves/removes paired edges together, retains explicit trailing null and rejects malformed reorders",()=>{
    const video:GenerationAttachmentSlot={field:{name:"clips",label:"Clips",media:"video",kind:"files",schema:{type:"array",items:{type:"string"}},required:false,nullable:false},ports:["video-field-clips"],limit:3};
    const audio:GenerationAttachmentSlot={field:{name:"tracks",label:"Tracks",media:"audio",kind:"files",schema:{type:"array",items:{type:["string","null"]}},required:false,nullable:false,
      attachment:{role:"paired_audio",pairedWith:"clips",pairing:"index"}},ports:["audio-field-tracks"],limit:3};
    const create=()=>crypto.randomUUID(),slots=[video,audio];
    const attached=replaceRelatedGenerationAttachments(replaceGenerationAttachments(graph,"target",video,["v1","v2","v3"],create),"target",slots,audio,[null,"a2",null],create);
    expect(resolveNodeInputAssetSlots(attached,"target",audio.ports[0])).toEqual([null,"a2",null]);
    const moved=replaceRelatedGenerationAttachments(attached,"target",slots,video,["v2","v3","v1"],create,[1,2,0]);
    expect(resolveNodeInputAssetSlots(moved,"target",audio.ports[0])).toEqual(["a2",null,null]);
    const removed=replaceRelatedGenerationAttachments(moved,"target",slots,video,["v3","v1"],create,[1,2]);
    expect(resolveNodeInputAssetSlots(removed,"target",audio.ports[0])).toEqual([null,null]);
    expect(removed.edges).toEqual(expect.arrayContaining(graph.edges));
    expect(()=>replaceRelatedGenerationAttachments(attached,"target",slots,video,["v1","v1"],create,[0,0])).toThrow("ATTACHMENT_ORDER");
    const short=replaceRelatedGenerationAttachments(attached,"target",slots,audio,["a1"],create);
    expect(()=>replaceRelatedGenerationAttachments(short,"target",slots,video,["v2","v1","v3"],create,[1,0,2])).toThrow("ATTACHMENT_SLOT_FALLBACK");
    expect(resolveNodeInputAssetSlots(short,"target",audio.ports[0])).toEqual(["a1"]);
    expect(JSON.stringify(short)).not.toMatch(/https:|data:|blob:/);
    expect(()=>replaceRelatedGenerationAttachments(graph,"target",slots,audio,["a1"],create)).toThrow("HF_CONTRACT_ATTACHMENT_ORPHAN");
  });
  it("attaches durable input nodes in order and removes only the chosen edge", () => {
    const slot: GenerationAttachmentSlot = { field: { name: "images", label: "Images", media: "image", kind: "files", schema: {}, required: true, nullable: false },
      ports: ["primary", "references"], limit: 3 };
    let counter = 0;
    const attached = replaceGenerationAttachments(graph, "target", slot, ["a", "b", "c"], () => "new-" + ++counter);
    expect(resolveNodeInputAssetIds(attached, "target", "primary")).toEqual(["a"]);
    expect(resolveNodeInputAssetIds(attached, "target", "references")).toEqual(["b", "c"]);
    expect(attached.edges).toEqual(expect.arrayContaining(graph.edges));
    const sources = attached.nodes.filter(node => ["a","b","c"].includes(String((node.data.config as {assetId?:string})?.assetId)));
    expect(sources).toHaveLength(3);
    const removed = replaceGenerationAttachments(attached, "target", slot, ["b", "c"], () => "new-" + ++counter);
    expect(removed.nodes).toEqual(attached.nodes);
    expect(resolveNodeInputAssetIds(removed, "target", "primary")).toEqual(["b"]);
    expect(resolveNodeInputAssetIds(removed, "target", "references")).toEqual(["c"]);
    expect(removed.edges).toEqual(expect.arrayContaining(graph.edges));
    expect(removed.edges).toHaveLength(attached.edges.length - 1);
    const changedLimit = { ...slot, limit: 1, field: { ...slot.field, kind: "file" as const } };
    const reduced = replaceGenerationAttachments(attached, "target", changedLimit, ["b","c"], () => "unused");
    expect(reduced.nodes).toEqual(attached.nodes);
    expect(resolveNodeInputAssetIds(reduced,"target","references")).toEqual(["c"]);
    expect(() => replaceGenerationAttachments(graph, "target", slot, ["a","b","c","d"], () => "unused")).toThrow("ATTACHMENT_LIMIT");
    expect(JSON.stringify(removed)).not.toMatch(/data:image|blob:/);
  });
  it("preserves empty Graph audio indices when replacing positional file slots",()=>{
    const slot:GenerationAttachmentSlot={field:{name:"tracks",label:"Tracks",media:"audio",kind:"files",nullable:false,required:false,
      schema:{type:"array",maxItems:3,items:{anyOf:[{type:"string"},{type:"null"}]}}},ports:["audio-field-tracks"],limit:3};
    const attached=replaceGenerationAttachments(graph,"target",slot,["a",null,"c"],()=>crypto.randomUUID());
    expect(resolveNodeInputAssetSlots(attached,"target",slot.ports[0])).toEqual(["a",null,"c"]);
    const cleared=replaceGenerationAttachments(attached,"target",slot,[null,null,"c"],()=>crypto.randomUUID());
    expect(resolveNodeInputAssetSlots(cleared,"target",slot.ports[0])).toEqual([null,null,"c"]);
    expect(cleared.edges.filter(edge=>edge.targetHandle===slot.ports[0]).map(edge=>edge.data?.sortOrder)).toEqual([2]);
  });
  it.each(["image","video","audio"] as const)("preserves a mapped %s field's canonical port, type and limit", media => {
    const slot: GenerationAttachmentSlot = { field: { name: "reference", label: "Reference", media, kind: "file", schema: {}, required: true, nullable: true },
      ports: [media + "-field-reference"], limit: 1 };
    const attached = replaceGenerationAttachments(graph, "target", slot, ["durable-id"], () => crypto.randomUUID());
    expect(attached.nodes.at(-1)?.data).toMatchObject({canonicalKind:"input." + media, config:{assetId:"durable-id"}});
    expect(resolveNodeInputAssetIds(attached,"target",slot.ports[0])).toEqual(["durable-id"]);
    expect(attached.edges.at(-1)?.data).toMatchObject({targetPortId:slot.ports[0],sourcePortId:media});
  });
  it("uses the legacy model image limit rather than the output modality as attachment capability", () => {
    const slot = generationAttachmentSlots({...runtimeImageModelsFixture[0],meta:{max_input_images:4}})[0];
    expect(slot).toMatchObject({limit:4, ports:["primary","references"],field:{media:"image",kind:"files"}});
    expect(generationAttachmentSlots({...runtimeImageModelsFixture[0],meta:{max_input_images:0}})).toEqual([]);
  });
  it("uses the frame source port through an image input and leaves a missing slot unresolved", () => {
    const frames = { id: "frames", type: "canonicalNode", position: { x: 0, y: 0 },
      data: { canonicalKind: "edit.video.extractFrames", config: {}, selectedOutputAssetId: "start",
        outputBindings: [{ portId: "startFrame", sortOrder: 0, assetId: "start" },
          { portId: "endFrame", sortOrder: 0, assetId: "end" }] } };
    const chain: NodeBananaRuntimeGraph = { nodes: [frames, graph.nodes[1], graph.nodes[3]],
      edges: [{ id: "frames-image", source: "frames", sourceHandle: "endFrame", target: "image", targetHandle: "reference" },
        { id: "image-target", source: "image", sourceHandle: "image", target: "target", targetHandle: "primary" }] };
    expect(resolveNodeInputAssetId(chain, "target", "primary")).toBe("end");
    frames.data.outputBindings = frames.data.outputBindings.filter(binding => binding.portId !== "endFrame");
    expect(resolveNodeInputAssetId(chain, "target", "primary")).toBeNull();
  });
  it("uses selected Assistant item through Prompt and Constructor while whole text remains distinct", () => {
    const makeNode = (id: string, kind: string, config: Record<string, unknown>) => ({ id, type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: kind, config } });
    const chain: NodeBananaRuntimeGraph = { nodes: [makeNode("a", "generate.assistant", {}), makeNode("p", "input.prompt", { variableName: "idea" }),
      makeNode("c", "process.promptConstructor", { template: "Use @idea" }), makeNode("g", "generate.image", {})], edges: [
      { id: "a-p", source: "a", sourceHandle: "item", target: "p", targetHandle: "text" },
      { id: "p-c", source: "p", sourceHandle: "text", target: "c", targetHandle: "text" },
      { id: "c-g", source: "c", sourceHandle: "text", target: "g", targetHandle: "prompt" },
    ] };
    expect(resolveNodePromptInput(chain, "g", { a: { text: "1. coat\n\n2. scarf", item: "scarf" } }).text).toBe("Use scarf");
    chain.edges[0].sourceHandle = "text";
    expect(resolveNodePromptInput(chain, "g", { a: { text: "1. coat\n\n2. scarf", item: "scarf" } }).text).toBe("Use 1. coat\n\n2. scarf");
    chain.edges[0].sourceHandle = "item";
    expect(resolveNodePromptInput(chain, "p", { a: "legacy" }).text).toBe("");
  });
  it("resolves Constructor named and inline variables once, including pause, disconnect and cycle", () => {
    const makeNode = (id: string, kind: string, config: Record<string, unknown>) => ({ id, type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: kind, config } });
    const connect = (source: string, target: string) => ({ id: `${source}-${target}`, source, target, sourceHandle: "text", targetHandle: "text", data: { targetPortId: "text", hasPause: false } });
    const composed = {
      nodes: [makeNode("named", "input.prompt", { variableName: "cat", text: "@other" }),
        makeNode("inline", "input.prompt", { text: '<var="cat">ignored</var><var="cat_long">fox</var>' }),
        makeNode("constructor", "process.promptConstructor", { template: "@cat / @cat_long / @missing" }),
        makeNode("consumer", "generate.image", {})],
      edges: [connect("named", "constructor"), connect("inline", "constructor"), connect("constructor", "consumer")],
    };
    expect(resolveNodePromptInput(composed, "consumer").text).toBe("@other / fox / @missing");
    composed.edges[0].data.hasPause = true;
    expect(resolveNodePromptInput(composed, "consumer").text).toBe("ignored / fox / @missing");
    expect(resolveNodePromptInput({ ...composed, edges: [composed.edges[2]] }, "consumer").text).toBe("@cat / @cat_long / @missing");
    composed.edges.push(connect("constructor", "inline"));
    expect(resolveNodePromptInput(composed, "consumer").text).toBeNull();
  });
  it("resolves only a connected Prompt node as the effective generation prompt", () => {
    expect(resolveNodePromptInput(graph, "target")).toEqual({ connected: true, text: "connected prompt" });
    expect(resolveNodePromptInput({ ...graph, edges: [] }, "target")).toEqual({ connected: false, text: null });
  });

  it("uses a producer's selected durable output asset for visual operation editors", () => {
    expect(resolveNodeInputAssetId(graph, "annotation", "image")).toBe("asset-output");
    const inputGraph = { ...graph, edges: [{ id: "input-edge", source: "image", target: "annotation", targetHandle: "image" }] };
    expect(resolveNodeInputAssetId(inputGraph, "annotation", "image")).toBe("asset-input");
  });

  it.each(["input.image", "edit.image.splitGrid"])("resolves references from %s with Split cells retaining their slice", (sourceKind) => {
    const chained: NodeBananaRuntimeGraph = {
      nodes: [
        { id: "root-image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: sourceKind, config: { assetId: "asset-root" }, selectedOutputAssetId: "asset-root" } },
        { id: "relay-image", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.image", config: { assetId: "asset-local-preserved" } } },
        { id: "target", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "edit.image.resize", config: {} } },
        { id: "root-prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.prompt", config: { text: "root text" } } },
        { id: "relay-prompt", type: "canonicalNode", position: { x: 0, y: 0 }, data: { canonicalKind: "input.prompt", config: { text: "local text" } } },
        { id: "generation", type: "generationNode", position: { x: 0, y: 0 }, data: { canonicalKind: "generate.image", config: {} } },
      ],
      edges: [
        { id: "image-pass", source: "root-image", target: "relay-image", sourceHandle: "image", targetHandle: "reference", data: { targetPortId: "reference" } },
        { id: "image-use", source: "relay-image", target: "target", sourceHandle: "image", targetHandle: "image", data: { targetPortId: "image" } },
        { id: "prompt-pass", source: "root-prompt", target: "relay-prompt", sourceHandle: "text", targetHandle: "text", data: { targetPortId: "text" } },
        { id: "prompt-use", source: "relay-prompt", target: "generation", sourceHandle: "text", targetHandle: "prompt", data: { targetPortId: "prompt" } },
      ],
    };

    expect(resolveNodeInputAssetId(chained, "target", "image")).toBe(sourceKind === "input.image" ? "asset-root" : "asset-local-preserved");
    expect(resolveNodePromptInput(chained, "generation")).toEqual({ connected: true, text: "root text" });
  });
});

 it("shows and edits chained legacy references without duplicating the relay or original assets",()=>{
   const slot=generationAttachmentSlots(mappedReferenceImageModelFixture)[0];
   const relay={...graph.nodes[1],id:"relay",data:{canonicalKind:"input.image",config:{assetId:null}}};
   const chain={...graph,nodes:[...graph.nodes,relay],edges:[...graph.edges,
     {id:"pass",source:"image",target:"relay",sourceHandle:"image",targetHandle:"reference"},
     {id:"use",source:"relay",target:"target",sourceHandle:"image",targetHandle:"image",data:{targetPortId:"primary",sortOrder:0}}]};
   expect(attachmentSlotAssetIds(chain,"target",slot)).toEqual(["asset-input"]);
   const same=replaceGenerationAttachments(chain,"target",slot,["asset-input"],()=>"unused");
   expect(same.nodes).toEqual(chain.nodes);
   expect(same.edges.find(e=>e.id==="use")).toMatchObject({source:"relay",targetHandle:"image-field-refs",data:{targetPortId:"image-field-refs"}});
   expect(attachmentSlotAssetIds(same,"target",slot)).toEqual(["asset-input"]);
   const paused={...chain,edges:chain.edges.map(e=>e.id==="pass"?{...e,data:{hasPause:true}}:e)};
   expect(attachmentSlotAssetIds(paused,"target",slot)).toEqual([]);
   expect(attachmentSlotAssetIds({...chain,edges:chain.edges.map(e=>e.id==="use"?{...e,data:{...e.data,hasPause:true}}:e)},"target",slot)).toEqual([]);
   const cleared=replaceGenerationAttachments(chain,"target",slot,[],()=>"unused");
   expect(cleared.nodes).toEqual(chain.nodes);expect(cleared.edges.some(e=>e.id==="use")).toBe(false);
   expect(cleared.edges.some(e=>e.id==="pass")).toBe(true);
 });
