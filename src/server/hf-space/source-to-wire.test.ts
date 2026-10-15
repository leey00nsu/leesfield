// @vitest-environment node
import {readFileSync} from "node:fs";
import { Client } from "@gradio/client";
import { describe, expect, it, vi } from "vitest";
import sources from "./fixtures/provider-schema-sources.json";
import { buildImportContract } from "./import-contract";
import { uploadGradioInputFiles } from "./input-file-upload";
import { buildGradioRequest } from "./contract-executor";
import { gradioInputValues, assessGradioSupport, normalizeGradioModel } from "@/shared/model-catalog/gradio-contract";
import { gradioSchemaValidator } from "@/shared/model-catalog/gradio-json-schema";
import { contractInputPorts } from "@/shared/model-catalog/file-input-ports";

describe("actual Gradio SDK upload transformation", () => {
  it.each(["image", "video"] as const)("transforms nonempty %s Gallery to source-valid wire without treating Blob as FileData", async media => {
    const gallery = sources[0].parameters[0];
    const contract = buildImportContract("/generate", { parameters:[gallery], returns:[{component:"Image"}] }, {});
    expect(assessGradioSupport(contract).corrections).toContain("FILE_MEDIA_UNRESOLVED:input_images");
    contract.inputs[0].media = media;
    const model = normalizeGradioModel({providerConfig:{gradio_contract:contract},parameters:{}});
    expect(contractInputPorts(model)).toMatchObject([{name:media+"-field-input_images",type:media,multiple:true,maxItems:8}]);
    const mime = media === "image" ? "image/png" : "video/mp4";
    const buffers=media==="image"?[Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64"),readFileSync("public/sample-image.png")]:[Buffer.from("000000186674797069736f6d0000020069736f6d69736f32","hex"),readFileSync("public/sample-video.mp4")];
    const request = await buildGradioRequest(contract,{dynamicParams:{input_images:buffers.map(bytes=>`data:${mime};base64,${bytes.toString("base64")}`)}});
    const entries = request.input_images as Record<string, unknown>[];
    expect(entries[0][media]).toBeInstanceOf(Blob);
    expect(entries[0][media]).not.toHaveProperty("path");
    const sdk = new Client("https://test.hf.space");
    sdk.config = { root:"https://test.hf.space" } as NonNullable<Client["config"]>;
    sdk.api_prefix = "/gradio_api";
    const filenames: string[] = [];
    sdk.fetch = vi.fn(async (_url, init) => {
      const file = (init?.body as FormData).get("files") as File;
      filenames.push(file.name);
      expect(file.type).toBe(mime);
      return new Response(JSON.stringify(["/uploaded/" + file.size + "/" + file.name]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof sdk.fetch;
    // Deliberately wrong ID-derived host: the SDK's resolved root must win.
    const uploaded = await uploadGradioInputFiles(sdk, { entries }, "https://test.2.1.hf.space");
    const wire = await sdk.handle_blob("https://test.hf.space",[uploaded.entries],{parameters:[gallery],returns:[]} as unknown as Parameters<Client["handle_blob"]>[2]);
    expect(sdk.fetch).toHaveBeenCalledTimes(2);
    expect(sdk.fetch).toHaveBeenCalledWith("https://test.hf.space/gradio_api/upload", expect.any(Object));
    expect(filenames).toEqual(["reference." + (media === "image" ? "png" : "mp4"), "reference." + (media === "image" ? "png" : "mp4")]);
    const serialized = JSON.parse(JSON.stringify(wire[0]));
    expect(serialized.map((entry:Record<string,{path:string}>)=>entry[media].path)).toEqual(buffers.map(bytes=>"/uploaded/"+bytes.byteLength+"/reference."+(media === "image" ? "png" : "mp4")));
    expect(gradioSchemaValidator(gallery.type)(serialized)).toBe(true);
    sdk.close();
  });

  it("retains plural File count and item conversion through the real SDK",async()=>{
    const gallery=sources[0].parameters[0].type as Record<string,unknown>;
    const schema={type:"array",items:{$ref:"#/$defs/FileData"},$defs:gallery.$defs,minItems:1,maxItems:2};
    const contract=buildImportContract("/generate",{parameters:[{parameter_name:"files",component:"File",type:schema,parameter_has_default:false}],returns:[{component:"Image"}]},{components:[{id:1,type:"file",props:{file_types:["image"]}}],dependencies:[{api_name:"generate",inputs:[1]}]});
    const data={dynamicParams:{files:["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII="]}};
    expect(gradioInputValues(contract,data)).toEqual(data.dynamicParams);
    expect(()=>gradioInputValues(contract,{dynamicParams:{files:[]}})).toThrow();
    expect(()=>gradioInputValues(contract,{dynamicParams:{files:Array(3).fill(data.dynamicParams.files[0])}})).toThrow();
    const request=await buildGradioRequest(contract,data);
    const sdk=new Client("https://test.hf.space");
    sdk.config={root:"https://test.hf.space"} as NonNullable<Client["config"]>;
    sdk.upload_files=vi.fn(async()=>({files:["/uploaded/a.png"]}));
    const uploaded = await uploadGradioInputFiles(sdk, request);
    const wire=await sdk.handle_blob("https://test.hf.space",[uploaded.files],{parameters:[{component:"File"}],returns:[]} as unknown as Parameters<Client["handle_blob"]>[2]);
    expect(gradioSchemaValidator(schema)(JSON.parse(JSON.stringify(wire[0])))).toBe(true);
    sdk.close();
  });
  it("does not silently erase unsupported wire constraints",()=>{
    for(const schema of [
      {title:"FileData",type:"object",properties:{path:{type:"string",pattern:"^/fixed/"}},required:["path"]},
      {title:"FileData",type:"object",properties:{path:{type:"string"}},const:{path:"/fixed/file.png"}},
      {type:"array",items:false},
    ]) {
      const contract=buildImportContract("/generate",{parameters:[{parameter_name:"source",component:"Image",type:schema}],returns:[{component:"Image"}]},{});
      expect(assessGradioSupport(contract).status).toBe("mapping_limited");
    }
  });
});
