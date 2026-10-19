import { describe, it, expect } from "vitest";
import { getSpaceCapabilities, getSpaceModelInput } from "./spaces-discovery";
import { mappedModel } from "./test-fixtures";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";
import { canonicalNodeRegistry } from "@/shared/generation-graph/node-registry";

describe("Spaces discovery", () => {
  it("separates authoring, browser operations, retired nodes and processor availability", async () => {
    const data = await getSpaceCapabilities(async () => false);
    const byKind = Object.fromEntries(data.nodes.map(n => [n.kind,n]));
    expect(byKind["edit.image.resize"]).toMatchObject({ authorable: true, apiExecutable: false, reason: "BROWSER_ONLY" });
    expect(byKind["edit.image.splitGrid"]).toMatchObject({ authorable: false, apiExecutable: false, reason: "RETIRED" });
    expect(byKind["edit.video.trim"].reason).toBe("PROCESSOR_UNAVAILABLE");
    expect(byKind["generate.assistant"].apiExecutable).toBe(true);
    expect(byKind["input.image"].reason).toBe("NOT_EXECUTABLE");
    for (const node of data.nodes.filter(n => n.authorable)) {
      expect(canonicalNodeRegistry[node.kind as keyof typeof canonicalNodeRegistry].configSchema.safeParse(node.defaultConfig).success, node.kind).toBe(true);
    }
    expect((await getSpaceCapabilities(async () => true)).nodes.find(n=>n.kind==="edit.video.trim")?.apiExecutable).toBe(true);
  });
  it("projects media and LLM contracts without provider credentials or connection settings", () => {
    const media = getSpaceModelInput(mappedModel());
    expect(JSON.stringify(media)).not.toMatch(/do-not-expose|secret-space|private_internal|providerConfig/);
    expect(media.model).toMatchObject({ key: "image-private-key", id: "image-private-id" });
    expect(media.inputSchema.properties).toMatchObject({
      text: { "x-node-config-path": "prompt" },
      seed: { "x-node-config-path": "parameters.dynamicParams.seed" },
      enabled: { "x-node-config-path": "parameters.dynamicParams.enabled" },
    });
    expect((media.inputSchema.properties as Record<string, Record<string, unknown>>).frame).not.toHaveProperty("x-node-config-path");
    const llm = { ...mappedModel(), type: "llm", providerConfig: { supports_images: true, api_key: "secret-value", base_url: "https://secret.example" } } as unknown as ModelCatalogItem;
    const result = getSpaceModelInput(llm);
    expect(result.files.map(f=>f.portId)).toEqual(["images", "videos"]);
    expect(JSON.stringify(result)).not.toMatch(/secret-value|secret.example|base_url|api_key/);
  });
  it("exposes original text inputs and explicit primary roles without internal State",()=>{
    const model=mappedModel("audio");
    model.providerConfig={...model.providerConfig,gradio_contract:{version:1,apiName:"/speak",inputs:[
      {name:"dialogue",label:"Dialogue",kind:"string",schema:{type:"string",minLength:1},required:true,nullable:false},
      {name:"param_11",label:"State",component:"state",hidden:true,kind:"json",schema:{},required:false,nullable:true,default:null},
    ],output:{media:"audio",path:[0],multiple:false},diagnostics:[],reviewed:false}};
    model.parameters={};
    const native=getSpaceModelInput(model);
    expect(native.inputSchema.properties).toMatchObject({dialogue:{"x-node-config-path":"parameters.dynamicParams.dialogue"}});
    expect(JSON.stringify(native)).not.toMatch(/param_11|internalState|gradio_state/);
    const config=model.providerConfig as {gradio_contract:{inputs:Array<{canonical?:string}>}};
    config.gradio_contract.inputs[0].canonical="prompt";
    expect(getSpaceModelInput(model).inputSchema.properties).toMatchObject({dialogue:{"x-node-config-path":"prompt"}});
  });
});
