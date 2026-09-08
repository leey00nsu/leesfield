import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetModelCatalog = vi.hoisted(() => vi.fn());
vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

describe("validateVideoGenerationPayload catalog option parity", () => {
  it.each([
    { aspect: ["16:9"], resolution: [480] },
    { aspect: [{ label: "Landscape", value: "16:9" }], resolution: [{ label: "480p", value: 480 }] },
    { aspect: [["Landscape", "16:9"]], resolution: [["480p", 480]] },
  ])("accepts catalog values, not labels, for $aspect", async ({ aspect, resolution }) => {
    mockGetModelCatalog.mockResolvedValue([{
      type: "video", key: "wan-options", meta: { supports_init_image: false },
      parameters: { aspectRatio: { options: aspect }, resolution: { options: resolution } },
    }]);
    const { validateVideoGenerationPayload } = await import("@/server/model-catalog/generation-validation");
    const values = {
      model: "wan-options", prompt: "moving kite", aspectRatio: "16:9", resolution: 480,
      durationSec: 3, fps: 16, steps: 6, guidanceScale: 1,
    };
    expect((await validateVideoGenerationPayload(values)).success).toBe(true);
    const invalid = await validateVideoGenerationPayload({ ...values, aspectRatio: "Landscape", resolution: 999 });
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.error.issues.map((issue) => issue.path[0])).toEqual(["aspectRatio", "resolution"]);
  });
});

describe("validateAudioGenerationPayload dynamicParams", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "audio-1",
        type: "audio",
        key: "qwen-dynamic",
        label: "Qwen Dynamic",
        vendor: "HUGGINGFACE",
        provider: "hf_space",
        providerConfig: { space_id: "Qwen/Qwen3-TTS", api_name: "/generate_voice_clone" },
        parameters: {
          prompt: { ui: "textarea", required: true },
          speed: {
            ui: "range",
            label: "Playback Rate",
            min: 0.25,
            max: 4,
            step: 0.05,
            binding: {
              source: "hf_space",
              parameterName: "speed",
              valueType: "number",
              canonicalKey: "speed",
              order: 4,
            },
          },
          "hf:model_size": {
            ui: "select",
            required: true,
            options: [
              { label: "0.6B", value: "0.6B" },
              { label: "1.7B", value: "1.7B" },
            ],
            binding: {
              source: "hf_space",
              parameterName: "model_size",
              valueType: "string",
              order: 5,
            },
          },
          "hf:temperature": {
            ui: "range",
            min: 0.1,
            max: 1,
            step: 0.1,
            binding: {
              source: "hf_space",
              parameterName: "temperature",
              valueType: "number",
              order: 6,
            },
          },
          "hf:reference_audio": {
            ui: "upload",
            binding: {
              source: "hf_space",
              parameterName: "reference_audio",
              valueType: "file",
              order: 7,
            },
          },
          "hf:use_xvector_only": {
            ui: "toggle",
            binding: {
              source: "hf_space",
              parameterName: "use_xvector_only",
              valueType: "boolean",
              order: 8,
            },
          },
        },
        meta: { model_id: "Qwen/Qwen3-TTS", default_speed: 1 },
        isActive: true,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  it("allowlisted dynamic value를 허용한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const result = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: { "hf:model_size": "1.7B" },
    });
    expect(result.success).toBe(true);
  });

  it("HF-bound canonical step 오류에 provider label을 사용한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const result = await validateAudioGenerationPayload(
      {
        prompt: "hello",
        model: "qwen-dynamic",
        speed: 1.025,
      },
      (key, values) =>
        key === "step" ? `${values?.label} step ${values?.step}` : key,
    );

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected HF-bound speed step validation to fail");
    }
    expect(result.error.issues[0]?.message).toBe("Playback Rate step 0.05");
  });

  it("unknown key와 지원하지 않는 option을 거부한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const unknown = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: { "hf:unknown": "value", "hf:model_size": "1.7B" },
    });
    const invalidOption = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: { "hf:model_size": "9B" },
    });
    expect(unknown.success).toBe(false);
    expect(invalidOption.success).toBe(false);
  });

  it("동적 number의 range와 step을 검증한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const outOfRange = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:temperature": 1.1,
      },
    });
    const invalidStep = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:temperature": 0.15,
      },
    });

    expect(outOfRange.success).toBe(false);
    expect(invalidStep.success).toBe(false);
  });

  it("동적 file과 boolean 타입을 검증한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const valid = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:reference_audio": "data:audio/wav;base64,UklGRg==",
        "hf:use_xvector_only": true,
      },
    });
    const invalid = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {
        "hf:model_size": "1.7B",
        "hf:reference_audio": true,
        "hf:use_xvector_only": "true",
      },
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it("required 동적 파라미터 누락을 거부한다", async () => {
    const { validateAudioGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const result = await validateAudioGenerationPayload({
      prompt: "hello",
      model: "qwen-dynamic",
      dynamicParams: {},
    });

    expect(result.success).toBe(false);
  });
});

describe("validateImageGenerationPayload input capability metadata", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetModelCatalog.mockResolvedValue([
      {
        id: "image-1",
        type: "image",
        key: "image-model",
        label: "Image Model",
        vendor: "OPENAI",
        provider: "codex_cli",
        providerConfig: { command: "codex" },
        parameters: {
          width: { min: 512, max: 1024, step: 512, default: 1024 },
          height: { min: 512, max: 1024, step: 512, default: 1024 },
          steps: { min: 1, max: 10, step: 1, default: 1 },
          imageCount: { min: 1, max: 1, step: 1, default: 1 },
        },
        meta: {
          default_width: 1024,
          default_height: 1024,
          default_steps: 1,
          concurrent_limit: 1,
          max_input_images: 0,
        },
        isActive: true,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  });

  const payload = {
    prompt: "hello",
    model: "image-model",
    width: 1024,
    height: 1024,
    steps: 1,
    imageCount: 1,
    initImages: ["https://assets.example.com/input.png"],
  };

  it("marks unsupported image input without parsing its message", async () => {
    const { validateImageGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const result = await validateImageGenerationPayload(payload);

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected validation to fail");
    expect(result.error.issues[0]).toMatchObject({
      path: ["initImages"],
      params: { nodeInputReason: "unsupported", limit: 0, count: 1 },
    });
  });

  it("marks a distinct input limit overflow with count and limit", async () => {
    const catalog = await mockGetModelCatalog();
    mockGetModelCatalog.mockResolvedValue([
      { ...catalog[0], meta: { ...catalog[0].meta, max_input_images: 1 } },
    ]);
    const { validateImageGenerationPayload } = await import(
      "@/server/model-catalog/generation-validation"
    );
    const result = await validateImageGenerationPayload({
      ...payload,
      initImages: [
        "https://assets.example.com/one.png",
        "https://assets.example.com/two.png",
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected validation to fail");
    expect(result.error.issues[0]).toMatchObject({
      path: ["initImages"],
      params: { nodeInputReason: "limit_exceeded", limit: 1, count: 2 },
    });
  });
});

describe("Gradio 계약 입력",()=>{
 it.each(["image","video","audio"])("%s의 nullable와 JSON을 보존하고 알 수 없는 값을 거절한다",async(type)=>{
 const contract={version:1,mappingConfirmed:true,apiName:"/generate",inputs:[
 {name:"first_frame",label:"Frame",kind:"file",schema:{},confirmed:true,required:true,nullable:true},
 {name:"options",label:"Options",kind:"json",schema:{type:"object",properties:{count:{type:"integer"}},required:["count"],additionalProperties:false},required:true,nullable:false}],
 output:{media:type,path:[0],multiple:false},diagnostics:[],reviewed:true};
 mockGetModelCatalog.mockResolvedValue([{type,key:"contract",providerConfig:{gradio_contract:contract}}]);
 const validators=await import("@/server/model-catalog/generation-validation");
 const validate=type==="image"?validators.validateImageGenerationPayload:type==="video"?validators.validateVideoGenerationPayload:validators.validateAudioGenerationPayload;
 const dynamicParams={first_frame:null,options:{count:2}};
 const result=await validate({model:"contract",prompt:"demo",dynamicParams});
 expect(result.success).toBe(true);
 if(result.success) expect(result.data.dynamicParams).toEqual(dynamicParams);
 expect((await validate({model:"contract",dynamicParams:{...dynamicParams,extra:true}})).success).toBe(false);
 expect((await validate({model:"contract",dynamicParams:{first_frame:null,options:{count:"bad"}}})).success).toBe(false);
 });
});
