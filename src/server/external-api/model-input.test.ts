import { describe, it, expect } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { getExternalModelInput } from "./model-input";
import { mappedModel } from "./test-fixtures";
import type { ModelCatalogItem } from "@/server/model-catalog/catalog-schema";

describe("authenticated model input contract", () => {
  it("publishes the same typed choices, file limits and default-aware conditions as its parser",()=>{
    const model=mappedModel();
    const parameters=model.parameters as Record<string,unknown>;
    for(const [name,kind,schema,extra,defaultValue] of [
      ["resolution","number",{type:"string",enum:[1024,2048]},{choiceMode:"single"},1024],
      ["tags","json",{type:"array",items:{type:"string",enum:[1,"a"]}},{choiceMode:"multiple",maxChoices:1},[1]],
      ["custom","json",{type:"string",enum:["a"]},{choiceMode:"single",allowCustomValue:true},"new"],
      ["mode","string",{type:"string",enum:["plain","edit"]},{choiceMode:"single"},"plain"],
    ] as const) parameters[name]={ui:"select",default:defaultValue,options:name==="resolution"?[1024,2048]:name==="tags"?[1,"a"]:name==="custom"?["a"]:["plain","edit"],binding:{source:"hf_space",parameterName:name,kind,valueType:kind==="json"?"string":kind,order:10,schema,...extra}};
    const rules={type:"object",if:{properties:{mode:{const:"edit"}},required:["mode"]},then:{properties:{frame:{type:"string",minLength:1}},required:["frame"]}};
    model.providerConfig={...model.providerConfig,input_rules:rules};
    const external=getExternalModelInput(model),validate=new Ajv2020({strict:false}).compile(external.inputSchema);
    for(const [input,valid] of [
      [{text:"test"},true],
      [{text:"test",resolution:2048,tags:["a"],custom:7},true],
      [{text:"test",resolution:"1024"},false],
      [{text:"test",tags:[1,"a"]},false],
      [{text:"test",mode:"edit"},false],
      [{text:"test",mode:"edit",frame:"https://files/source.png"},true],
    ] as const) {
      expect(validate(input),JSON.stringify(input)).toBe(valid);
      if(valid) expect(()=>external.parse(input)).not.toThrow(); else expect(()=>external.parse(input)).toThrow();
    }
    expect(JSON.stringify(external.inputSchema)).not.toContain("do-not-expose");
    expect(JSON.stringify(external.inputSchema)).not.toContain("private/secret-space");
  });
  it.each(["image", "video", "audio"] as const)(
    "validates %s using provider names including prompt",
    (type) => {
      const contract = getExternalModelInput(mappedModel(type));
      expect(contract.inputSchema.required).toEqual(["text"]);
      expect(contract.inputSchema.properties).not.toHaveProperty("model");
      expect(contract.inputSchema.properties).not.toHaveProperty(
        "dynamicParams",
      );
      const validate = new Ajv2020({ strict: false }).compile(
        contract.inputSchema,
      );
      const input = { text: "test", options: { count: 2 } };
      expect(validate(input)).toBe(true);
      const payload = contract.parse(input);
      expect(payload.prompt).toBe("test");
      expect(payload.dynamicParams).toMatchObject({
        text: "test",
        seed: 0,
        enabled: false,
        options: { count: 2 },
      });
      for (const invalid of [
        {},
        { text: "" },
        { text: "test", options: { count: "bad" } },
        { text: "test", notDeclared: 1 },
      ]) {
        expect(validate(invalid)).toBe(false);
        expect(() => contract.parse(invalid)).toThrow();
      }
      expect(contract.files).toEqual([
        {
          name: "frame",
          multiple: false,
          multipartField: "file:frame",
          maxBytes: 10485760,
          maxItems: 1,
        },
        {
          name: "frames",
          multiple: true,
          multipartField: "file:frames",
          maxBytes: 10485760,
          maxItems: 8,
        },
      ]);
    },
  );
  it("adapts legacy model inputs and defaults without exposing internal configuration", () => {
    const model = {
      ...mappedModel(),
      provider: "codex_cli",
      providerConfig: { command: "codex" },
      parameters: {
        prompt: { required: true },
        seed: { ui: "input", default: 42, min: 0, step: 1 },
        width: { default: 1024, min: 512, max: 1024, step: 512 },
        height: { default: 1024, min: 512, max: 1024, step: 512 },
        steps: { default: 1, min: 1, max: 10, step: 1 },
        imageCount: { default: 1, min: 1, max: 1, step: 1 },
      },
      meta: { max_input_images: 0 },
    } as unknown as ModelCatalogItem;
    const contract = getExternalModelInput(model);
    expect(contract.parse({ prompt: "test" })).toMatchObject({
      model: model.key,
      seed: "42",
      width: 1024,
      height: 1024,
      steps: 1,
      imageCount: 1,
    });
    expect(contract.inputSchema.properties?.seed).toMatchObject({
      type: "number",
      default: 42,
    });
    expect(contract.parse({ prompt: "test", seed: 0 })).toMatchObject({
      seed: "0",
    });
    for (const seed of ["abc", "42", null, -1, 1.5])
      expect(() => contract.parse({ prompt: "test", seed })).toThrow();
    expect(contract.inputSchema.required).toEqual(["prompt"]);
    expect(() => contract.parse({ prompt: "test", width: 20 })).toThrow();
    expect(() =>
      contract.parse({
        prompt: "test",
        initImages: ["https://example.com/a.png"],
      }),
    ).toThrow();
  });
  it("updates schema and execution when model inputs are changed", () => {
    const model = mappedModel();
    const parameters = model.parameters as Record<string, unknown>;
    parameters.quality = {
      label: "Quality",
      required: true,
      options: ["fast", "best"],
      binding: {
        source: "hf_space",
        parameterName: "quality",
        kind: "string",
        valueType: "string",
        schema: { type: "string" },
        order: 6,
      },
    };
    const first = getExternalModelInput(model);
    expect(first.inputSchema.required).toContain("quality");
    expect(() => first.parse({ text: "test" })).toThrow();
    (parameters.quality as Record<string, unknown>).default = "best";
    const changed = getExternalModelInput(model);
    expect(changed.inputSchema.required).not.toContain("quality");
    expect(changed.parse({ text: "test" }).dynamicParams).toMatchObject({
      quality: "best",
    });
  });
});
