// @vitest-environment node
import { buildModalModelDraft } from "@/server/modal-comfyui/importer";
import { describe, expect, it, vi } from "vitest";

const assetLookup = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/prisma", () => ({ prisma: { mediaAsset: { findFirst: assetLookup } } }));

import {
  applyUploadedGenerationInputAssets,
  generationInputMediaForPayload,
  uploadGenerationInputAssets,
} from "./input-media-uploader";

describe("generation input media normalization", () => {
  it("accepts declared nine-image and mixed references, enforcing field and provider totals",async()=>{
    const properties=Object.fromEntries(([ ["reference_images","image",9], ["reference_videos","video",3], ["reference_audios","audio",3], ["reference_video_audios","audio",3] ] as const).map(([name,media,maxItems])=>[name,{type:"array",default:[],maxItems,items:name==="reference_video_audios"?{anyOf:[{type:"string",format:"comfy-input-name","x-media":media},{type:"null"}]}:{type:"string",format:"comfy-input-name","x-media":media}}]));
    const raw={id:"deno-limits",name:"Deno limits",category:"video",output_media:["video"],input_schema:{type:"object",additionalProperties:false,required:[],properties},advanced_schema:{type:"object",additionalProperties:false,required:[],properties:{}}};
    const model=buildModalModelDraft(raw);
    const dynamicParams=Object.fromEntries(Object.entries(properties).map(([name,schema])=>[name,Array.from({length:schema.maxItems},(_,i)=>"https://files.example/"+name+"/"+i)]));
    expect(generationInputMediaForPayload("video",{dynamicParams},model).flatMap(input=>input.sources)).toHaveLength(18);
    expect(()=>generationInputMediaForPayload("video",{dynamicParams:{...dynamicParams,reference_images:[...dynamicParams.reference_images,"https://files.example/10"]}},model)).toThrow("INPUT_MEDIA_COUNT_LIMIT");
    const lowered={...model,parameters:{...model.parameters,reference_images:{...model.parameters.reference_images,maxItems:2}}};
    expect(()=>generationInputMediaForPayload("video",{dynamicParams},lowered)).toThrow("INPUT_MEDIA_COUNT_LIMIT");
    const limited=buildModalModelDraft({...raw,limits:{max_input_files:2}});
    expect(()=>generationInputMediaForPayload("video",{dynamicParams:{reference_images:dynamicParams.reference_images.slice(0,2),reference_videos:dynamicParams.reference_videos.slice(0,1)}},limited)).toThrow("INPUT_MEDIA_COUNT_LIMIT");
    const slots=generationInputMediaForPayload("video",{dynamicParams:{reference_video_audios:[null,"https://files.example/a.wav",null]}},limited);
    expect(slots[0]).toMatchObject({sources:[null,"https://files.example/a.wav",null],maxTotalFiles:2});
    await expect(uploadGenerationInputAssets("request","owner",[{field:"refs",mediaType:"image",generationType:"image",multiple:true,sources:Array(65).fill("https://files.example/a.png")}])).rejects.toThrow("INPUT_MEDIA_COUNT_LIMIT");
  });
  it("retains nullable file source indices across durable storage URL replacement",()=>{
    const model=buildModalModelDraft({id:"slots",name:"Slots",category:"video",output_media:["video"],
      input_schema:{type:"object",additionalProperties:false,required:[],properties:{tracks:{type:"array",maxItems:3,default:[],items:{anyOf:[{type:"string",format:"comfy-input-name","x-media":"audio"},{type:"null"}]}}}},
      advanced_schema:{type:"object",additionalProperties:false,required:[],properties:{}}});
    const payload={dynamicParams:{tracks:[null,"https://old/second.wav",null],other:"keep"}};
    // The unrelated option below is not a media field.
    const inputs=generationInputMediaForPayload("video",payload,model);
    expect(inputs[0].sources).toEqual(payload.dynamicParams.tracks);
    const result=applyUploadedGenerationInputAssets(payload,[{ref:{assetId:"second",field:"dynamicParams.tracks",sortOrder:1,multiple:true,generationType:"video"},url:"https://new/second.wav",mediaType:"audio"}]);
    expect(result.dynamicParams).toEqual({tracks:[null,"https://new/second.wav",null],other:"keep"});
    expect(payload.dynamicParams.tracks).toEqual([null,"https://old/second.wav",null]);
  });

  it("rejects more than eight remote inputs before downloading them", () => {
    expect(() =>
      generationInputMediaForPayload(
        "image",
        {
          initImages: Array.from(
            { length: 9 },
            (_, index) => `https://example.com/${index}.png`,
          ),
        },
        { type: "image" },
      ),
    ).toThrow("INPUT_MEDIA_COUNT_LIMIT");
  });

  it("maps core and catalog upload fields to stable durable reference fields", () => {
    const inputs = generationInputMediaForPayload(
      "image",
      {
        initImages: ["data:image/png;base64,a", "https://example.com/b.png"],
        dynamicParams: { reference: ["https://example.com/reference.png"] },
      },
      {
        type: "image",
        parameters: {
          reference: { ui: "upload", media: "image" },
        },
      },
    );
    expect(inputs).toEqual([
      {
        field: "initImages",
        mediaType: "image",
        generationType: "image",
        sources: ["data:image/png;base64,a", "https://example.com/b.png"],
        multiple: true,
      },
      {
        field: "dynamicParams.reference",
        mediaType: "image",
        generationType: "image",
        sources: ["https://example.com/reference.png"],
        multiple: false,
      },
    ]);
  });

  it("maps a generic core image to the mapped contract only once", () => {
    const inputs = generationInputMediaForPayload(
      "image",
      { initImages: ["https://example.com/input.png"] },
      {
        type: "image",
        providerConfig: { api_name: "/generate", output: { media: "image", path: [0] } },
        parameters: {
          input_image: {
            ui: "upload",
            binding: {
              source: "hf_space",
              parameterName: "input_image",
              valueType: "file",
              kind: "file",
              media: "image",
            },
          },
        },
      },
    );

    expect(inputs).toEqual([
      {
        field: "dynamicParams.input_image",
        mediaType: "image",
        generationType: "image",
        sources: ["https://example.com/input.png"],
        multiple: false,
      },
    ]);
  });

  it("clears the duplicate generic field after a mapped contract upload", () => {
    const payload = {
      initImages: ["data:image/png;base64,raw"],
      dynamicParams: { input_image: "data:image/png;base64,raw" },
    };
    const result = applyUploadedGenerationInputAssets(payload, [
      {
        ref: {
          assetId: "asset-contract",
          field: "dynamicParams.input_image",
          sortOrder: 0,
          generationType: "image",
        },
        url: "https://cdn/input.png",
        mediaType: "image",
      },
    ]);

    expect(result).toEqual({
      initImages: [],
      dynamicParams: { input_image: "https://cdn/input.png" },
    });
  });

  it("applies durable URLs without mutating the submitted payload", () => {
    const payload = {
      initImages: ["old"],
      dynamicParams: { reference: "old-reference", prompt: "keep" },
    };
    const result = applyUploadedGenerationInputAssets(payload, [
      { ref: { assetId: "asset-b", field: "initImages", sortOrder: 1, multiple: true, generationType: "image" }, url: "https://cdn/b", mediaType: "image" },
      { ref: { assetId: "asset-a", field: "initImages", sortOrder: 0, multiple: true, generationType: "image" }, url: "https://cdn/a", mediaType: "image" },
      { ref: { assetId: "asset-r", field: "dynamicParams.reference", sortOrder: 0, generationType: "image" }, url: "https://cdn/reference", mediaType: "image" },
    ]);
    expect(result).toEqual({
      initImages: ["https://cdn/a", "https://cdn/b"],
      dynamicParams: { reference: "https://cdn/reference", prompt: "keep" },
    });
    expect(payload).toEqual({
      initImages: ["old"],
      dynamicParams: { reference: "old-reference", prompt: "keep" },
    });
  });
});

it("reuses only an owned completed asset with the requested media type and original field position", async () => {
  assetLookup.mockResolvedValueOnce({ id: "existing", storageUrl: "https://storage.example/original.webp", legacyUrl: null, bytes: BigInt(100), mimeType: "image/webp" });
  const result = await uploadGenerationInputAssets("new-request", "owner@example.com", [{
    generationType: "video", field: "dynamicParams.references", mediaType: "image", multiple: true,
    sources: [null, "https://storage.example/original.webp"],
  }]);
  expect(result).toEqual([{ ref: { assetId: "existing", field: "dynamicParams.references", generationType: "video", sortOrder: 1, multiple: true }, url: "https://storage.example/original.webp", mediaType: "image", sourceBytes: 100 }]);
  expect(assetLookup).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
    ownerEmail: "owner@example.com", type: "image", status: "completed",
    OR: [{ storageUrl: "https://storage.example/original.webp" }, { legacyUrl: "https://storage.example/original.webp" }],
  }}));
  // No storage credentials are configured; a reused reference needs no upload.
  assetLookup.mockResolvedValueOnce({ id: "large", bytes: BigInt(50 * 1024 * 1024 + 1), mimeType: "image/png" });
  await expect(uploadGenerationInputAssets("request", "owner", [{ generationType: "image", field: "initImages", mediaType: "image", sources: ["https://storage.example/large.png"] }])).rejects.toThrow("INPUT_MEDIA_TOO_LARGE");
});
