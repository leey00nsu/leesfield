import { z } from "zod";
import type {
  RuntimeAudioModel,
  RuntimeImageModel,
  RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";
import {
  getRuntimeAudioParamConfig,
  getRuntimeAudioParamRange,
  getRuntimeImageParamConfig,
  getRuntimeImageParamRange,
  getRuntimeVideoParamConfig,
  getRuntimeVideoParamRange,
  resolveRuntimeAudioSupportsInputAudio,
  resolveRuntimeImageMaxInputImages,
  resolveRuntimeVideoSupportsInitImage,
} from "@/shared/model-catalog/runtime-utils";
import { hasRuntimeParameterOption } from "@/shared/model-catalog/parameter-options";

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

const buildInitImageSchema = (t?: TranslationFn) =>
  z
    .string()
    .refine(
      (value) => {
        const trimmed = value.trim();
        if (!trimmed) return true;
        if (trimmed.startsWith("data:")) {
          return /^data:[^;]+;base64,/.test(trimmed);
        }
        if (/^https?:\/\//.test(trimmed)) {
          try {
            const url = new URL(trimmed);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        }
        return false;
      },
      t
        ? t("initImageInvalid")
        : "initImage는 data URL(base64) 또는 http(s) URL이어야 합니다.",
    )
    .describe("data URL(base64) 또는 http(s) 이미지 URL");

export function createRuntimeImageSchema(
  models: RuntimeImageModel[],
  t?: TranslationFn,
) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const labelMap = {
    width: t ? t("labels.width") : "너비",
    height: t ? t("labels.height") : "높이",
    steps: t ? t("labels.steps") : "스텝",
    imageCount: t ? t("labels.imageCount") : "이미지 개수",
    guidanceScale: t ? t("labels.guidanceScale") : "가이던스",
  };
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t
      ? t("step", { label, step })
      : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const initImageUnsupported = t
    ? t("initImageUnsupported")
    : "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  const maxInputImagesMessage = (limit: number) =>
    t
      ? t("maxInputImages", { limit })
      : `이미지는 최대 ${limit}장까지 업로드할 수 있습니다.`;
  const unsupportedMode = t ? t("unsupportedMode") : "지원하지 않는 모드입니다.";

  const schema = z.object({
    prompt: z.string().min(1, promptRequired),
    width: z.number().int(),
    height: z.number().int(),
    initImages: z.array(z.string()).optional(),
    model: z.string().min(1),
    imageCount: z.number().int(),
    steps: z.number().int(),
    modeChoice: z.string().optional(),
    guidanceScale: z.number().optional(),
    promptUpsampling: z.boolean().optional(),
    seed: z.string().optional().or(z.literal("")),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: invalidModelMessage,
      });
      return;
    }

    const widthRange = getRuntimeImageParamRange(model, "width");
    const heightRange = getRuntimeImageParamRange(model, "height");
    const stepsRange = getRuntimeImageParamRange(model, "steps");
    const countRange = getRuntimeImageParamRange(model, "imageCount");

    const validateRange = (
      value: number,
      range: { min: number; max: number; step: number },
      path: (string | number)[],
      label: string,
    ) => {
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: rangeMessage(label, range.min, range.max),
        });
        return;
      }
      if (range.step > 0) {
        const offset = value - range.min;
        const quotient = offset / range.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: stepMessage(label, range.step),
          });
        }
      }
    };

    validateRange(data.width, widthRange, ["width"], labelMap.width);
    validateRange(data.height, heightRange, ["height"], labelMap.height);
    validateRange(data.steps, stepsRange, ["steps"], labelMap.steps);
    validateRange(
      data.imageCount,
      countRange,
      ["imageCount"],
      labelMap.imageCount,
    );

    if (typeof data.guidanceScale === "number") {
      const guidanceRange = getRuntimeImageParamRange(model, "guidanceScale");
      validateRange(
        data.guidanceScale,
        guidanceRange,
        ["guidanceScale"],
        labelMap.guidanceScale,
      );
    }

    const modeConfig = getRuntimeImageParamConfig(model, "modeChoice");
    if (
      typeof data.modeChoice === "string" &&
      data.modeChoice.trim() &&
      modeConfig?.options?.length &&
      !hasRuntimeParameterOption(modeConfig.options, data.modeChoice)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modeChoice"],
        message: unsupportedMode,
      });
    }

    const maxInputImages = resolveRuntimeImageMaxInputImages(model);
    const count = data.initImages?.length ?? 0;
    if (count > 0 && maxInputImages === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImages"],
        message: initImageUnsupported,
      });
      return;
    }
    if (count > maxInputImages) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImages"],
        message: maxInputImagesMessage(maxInputImages),
      });
    }
  });
}

export function createRuntimeVideoSchema(
  models: RuntimeVideoModel[],
  t?: TranslationFn,
) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const initImageSchema = buildInitImageSchema(t);
  const labels = {
    durationSec: t ? t("labels.durationSec") : "재생시간",
    steps: t ? t("labels.steps") : "스텝",
    guidanceScale: t ? t("labels.guidanceScale") : "가이던스",
    fps: t ? t("labels.fps") : "FPS",
  };
  const intOnlyMessage = (label: string) =>
    t ? t("intOnly", { label }) : `${label}는 정수만 허용됩니다.`;
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t ? t("step", { label, step }) : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const initImageNeeded = t
    ? t("initImageNeeded")
    : "선택한 모델은 이미지 입력이 필요합니다.";
  const initImageUnsupported = t
    ? t("initImageUnsupported")
    : "선택한 모델은 이미지 입력을 지원하지 않습니다.";
  const unsupportedAspectRatio = t
    ? t("unsupportedAspectRatio")
    : "지원하지 않는 비율입니다.";
  const unsupportedResolution = t
    ? t("unsupportedResolution")
    : "지원하지 않는 해상도입니다.";

  const schema = z.object({
    prompt: z.string().min(1, promptRequired),
    initImage: initImageSchema.optional().or(z.literal("")),
    model: z.string().min(1),
    aspectRatio: z.string().min(1),
    resolution: z.number().int(),
    durationSec: z.number(),
    fps: z.number().int(),
    steps: z.number().int(),
    guidanceScale: z.number(),
    seed: z.string().optional().or(z.literal("")),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: invalidModelMessage,
      });
      return;
    }

    const supportsInitImage = resolveRuntimeVideoSupportsInitImage(model);
    const hasInitImage = Boolean(data.initImage?.trim());
    if (supportsInitImage && !hasInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: initImageNeeded,
      });
    }
    if (hasInitImage && !supportsInitImage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initImage"],
        message: initImageUnsupported,
      });
    }

    const durationRange = getRuntimeVideoParamRange(model, "durationSec");
    const stepsRange = getRuntimeVideoParamRange(model, "steps");
    const guidanceRange = getRuntimeVideoParamRange(model, "guidanceScale");
    const fpsRange = getRuntimeVideoParamRange(model, "fps");

    const validateRange = (
      value: number,
      range: { min: number; max: number; step: number },
      path: (string | number)[],
      label: string,
      allowFloat = false,
    ) => {
      if (!allowFloat && !Number.isInteger(value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: intOnlyMessage(label),
        });
        return;
      }
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: rangeMessage(label, range.min, range.max),
        });
        return;
      }
      if (range.step > 0) {
        const offset = value - range.min;
        const quotient = offset / range.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: stepMessage(label, range.step),
          });
        }
      }
    };

    validateRange(
      data.durationSec,
      durationRange,
      ["durationSec"],
      labels.durationSec,
      true,
    );
    validateRange(data.steps, stepsRange, ["steps"], labels.steps);
    validateRange(
      data.guidanceScale,
      guidanceRange,
      ["guidanceScale"],
      labels.guidanceScale,
      true,
    );
    validateRange(data.fps, fpsRange, ["fps"], labels.fps);

    const aspectOptions = getRuntimeVideoParamConfig(model, "aspectRatio")?.options;
    if (aspectOptions?.length) {
      if (!hasRuntimeParameterOption(aspectOptions, data.aspectRatio)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aspectRatio"],
          message: unsupportedAspectRatio,
        });
      }
    }

    const resolutionOptions = getRuntimeVideoParamConfig(model, "resolution")?.options;
    if (resolutionOptions?.length) {
      if (!hasRuntimeParameterOption(resolutionOptions, data.resolution)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resolution"],
          message: unsupportedResolution,
        });
      }
    }
  });
}

export function createRuntimeAudioSchema(
  models: RuntimeAudioModel[],
  t?: TranslationFn,
) {
  const modelMap = new Map(models.map((model) => [model.key, model]));
  const invalidModelMessage = t
    ? t("invalidModel")
    : "지원하지 않는 모델입니다.";
  const promptRequired = t ? t("promptRequired") : "프롬프트를 입력해주세요.";
  const labels = {
    speed: t ? t("labels.speed") : "속도",
    chunkSize: "Detail",
    temperature: "Variation",
    topK: "Clarity",
    repetitionPenalty: "Repetition",
  };
  const rangeMessage = (label: string, min: number, max: number) =>
    t
      ? t("range", { label, min, max })
      : `${label}는 ${min}~${max} 범위여야 합니다.`;
  const stepMessage = (label: string, step: number) =>
    t
      ? t("step", { label, step })
      : `${label}는 ${step} 단위로 입력해야 합니다.`;
  const unsupportedVoice = t
    ? t("unsupportedVoice")
    : "지원하지 않는 음성입니다.";
  const inputAudioUnsupported = t
    ? t("inputAudioUnsupported")
    : "선택한 모델은 오디오 입력을 지원하지 않습니다.";
  const referenceTextRequired = t
    ? t("referenceTextRequired")
    : "레퍼런스 텍스트를 입력해주세요.";
  const unsupportedSelection = "지원하지 않는 선택값입니다.";

  const schema = z.object({
    prompt: z.string().min(1, promptRequired),
    model: z.string().min(1),
    voice: z.string().optional().or(z.literal("")),
    speed: z.number().optional(),
    seed: z.string().optional().or(z.literal("")),
    inputAudio: z.string().optional().or(z.literal("")),
    referenceText: z.string().optional().or(z.literal("")),
    modeChoice: z.string().optional().or(z.literal("")),
    language: z.string().optional().or(z.literal("")),
    speaker: z.string().optional().or(z.literal("")),
    streamMode: z.boolean().optional(),
    referencePreset: z.string().optional().or(z.literal("")),
    customInstruction: z.string().optional().or(z.literal("")),
    voiceInstruction: z.string().optional().or(z.literal("")),
    xvecOnly: z.boolean().optional(),
    chunkSize: z.number().optional(),
    temperature: z.number().optional(),
    topK: z.number().optional(),
    repetitionPenalty: z.number().optional(),
  });

  return schema.superRefine((data, ctx) => {
    const model = modelMap.get(data.model);
    if (!model) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["model"],
        message: invalidModelMessage,
      });
      return;
    }

    if (typeof data.speed === "number") {
      const speedRange = getRuntimeAudioParamRange(model, "speed");
      if (data.speed < speedRange.min || data.speed > speedRange.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["speed"],
          message: rangeMessage(labels.speed, speedRange.min, speedRange.max),
        });
      } else if (speedRange.step > 0) {
        const offset = data.speed - speedRange.min;
        const quotient = offset / speedRange.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["speed"],
            message: stepMessage(labels.speed, speedRange.step),
          });
        }
      }
    }

    const validateOption = (
      key: "voice" | "speaker" | "modeChoice" | "language" | "referencePreset",
      value: string | undefined,
      message = unsupportedSelection,
    ) => {
      if (!value?.trim()) return;
      const config = getRuntimeAudioParamConfig(model, key);
      if (
        config?.options?.length &&
        !hasRuntimeParameterOption(config.options, value)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message,
        });
      }
    };

    validateOption("voice", data.voice, unsupportedVoice);
    validateOption("speaker", data.speaker);
    validateOption("modeChoice", data.modeChoice);
    validateOption("language", data.language);
    validateOption("referencePreset", data.referencePreset);

    if (data.inputAudio?.trim() && !resolveRuntimeAudioSupportsInputAudio(model)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputAudio"],
        message: inputAudioUnsupported,
      });
    }

    const referenceTextConfig = getRuntimeAudioParamConfig(model, "referenceText");
    if (
      referenceTextConfig?.required &&
      data.inputAudio?.trim() &&
      !(data.referenceText?.trim())
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["referenceText"],
        message: referenceTextRequired,
      });
    }

    const validateNumeric = (
      key: "chunkSize" | "temperature" | "topK" | "repetitionPenalty",
      value: number | undefined,
      label: string,
    ) => {
      if (typeof value !== "number") return;
      const range = getRuntimeAudioParamRange(model, key);
      if (value < range.min || value > range.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: rangeMessage(label, range.min, range.max),
        });
        return;
      }
      if (range.step > 0) {
        const offset = value - range.min;
        const quotient = offset / range.step;
        if (Math.abs(quotient - Math.round(quotient)) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: stepMessage(label, range.step),
          });
        }
      }
    };

    validateNumeric("chunkSize", data.chunkSize, labels.chunkSize);
    validateNumeric("temperature", data.temperature, labels.temperature);
    validateNumeric("topK", data.topK, labels.topK);
    validateNumeric(
      "repetitionPenalty",
      data.repetitionPenalty,
      labels.repetitionPenalty,
    );
  });
}
