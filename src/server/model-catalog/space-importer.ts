import { Client } from "@gradio/client";

type ModelType = "image" | "video";

type ImportRequest = {
  spaceUrl: string;
  apiName?: string;
};

type ParameterConfig = {
  ui: string;
  label?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  default?: string | number | boolean;
  options?: Array<string | number>;
};

type DraftPayload = {
  type: ModelType;
  key: string;
  label: string;
  vendor: string;
  provider: "hf_space";
  providerConfig: Record<string, unknown>;
  parameters: Record<string, ParameterConfig>;
  meta: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
};

type ImportResult = {
  spaceId: string;
  apiNames: string[];
  resolvedApiName: string;
  draft: DraftPayload;
  warnings: string[];
};

const DEFAULT_VENDOR = "HUGGINGFACE";
const DEFAULT_PROVIDER = "hf_space";
const CONNECT_TIMEOUT_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 300000;

const DEFAULT_IMAGE_META = {
  pipeline: "diffusion",
  default_width: 1024,
  default_height: 1024,
  default_steps: 10,
  concurrent_limit: 1,
  max_input_images: 0,
};

const DEFAULT_VIDEO_META = {
  default_width: 832,
  default_height: 480,
  default_duration_sec: 3.5,
  default_fps: 16,
  default_steps: 6,
  default_guidance_scale: 1,
  concurrent_limit: 1,
};

const FALLBACK_IMAGE_PARAMETERS: Record<string, ParameterConfig> = {
  prompt: { ui: "textarea", required: true },
  width: { ui: "input", min: 512, max: 2048, step: 1, default: 1024 },
  height: { ui: "input", min: 512, max: 2048, step: 1, default: 1024 },
  steps: { ui: "range", min: 1, max: 30, step: 1, default: 10 },
  seed: { ui: "input", default: "" },
  imageCount: { ui: "hidden", min: 1, max: 1, default: 1 },
};

const FALLBACK_VIDEO_PARAMETERS: Record<string, ParameterConfig> = {
  prompt: { ui: "textarea", required: true },
  durationSec: { ui: "range", min: 1, max: 6, step: 0.5, default: 3 },
  steps: { ui: "range", min: 4, max: 10, step: 1, default: 6 },
  guidanceScale: { ui: "range", min: 0, max: 10, step: 0.5, default: 1 },
  seed: { ui: "input", default: "" },
  aspectRatio: { ui: "select", options: ["16:9", "9:16", "1:1"], default: "16:9" },
  resolution: { ui: "select", options: [480, 640, 720, 832], default: 720 },
  fps: { ui: "hidden", min: 16, max: 16, step: 1, default: 16 },
};

function normalizeApiName(name: string) {
  return name.startsWith("/") ? name : `/${name}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function resolveParamKey(label?: string, paramName?: string, type?: string) {
  const target = `${label ?? ""} ${paramName ?? ""}`.toLowerCase();
  if (target.includes("prompt")) return "prompt";
  if (target.includes("width")) return "width";
  if (target.includes("height")) return "height";
  if (target.includes("guidance") || target.includes("cfg")) return "guidanceScale";
  if (target.includes("seed")) return "seed";
  if (target.includes("mode")) return "modeChoice";
  if (target.includes("upsample")) return "promptUpsampling";
  if (target.includes("image") && target.includes("count")) return "imageCount";
  if (target.includes("duration")) return "durationSec";
  if (target.includes("fps")) return "fps";
  if (target.includes("resolution")) return "resolution";
  if (target.includes("aspect")) return "aspectRatio";
  if (target.includes("init") && target.includes("image")) return "initImage";
  if (target.includes("image") && (type?.includes("image") || type?.includes("gallery"))) {
    return "initImage";
  }
  return null;
}

function resolveComponentType(component?: { type?: string } | null, fallback?: string) {
  const raw = component?.type ?? fallback ?? "";
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

function resolveString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function resolveNumber(value: unknown, fallback?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveBoolean(value: unknown, fallback?: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function resolveComponentLabel(componentProps: Record<string, unknown>) {
  return resolveString(componentProps.label, "");
}

function parseSpaceIdFromUrl(spaceUrl: string) {
  try {
    const url = new URL(spaceUrl);
    if (url.hostname.includes("huggingface.co")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "spaces" && parts[1] && parts[2]) {
        return `${parts[1]}/${parts[2]}`;
      }
    }
    if (url.hostname.endsWith(".hf.space")) {
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (pathParts[0] && pathParts[1]) {
        return `${pathParts[0]}/${pathParts[1]}`;
      }
      const slug = url.hostname.replace(".hf.space", "");
      const lastDashIndex = slug.lastIndexOf("-");
      if (lastDashIndex > 0 && lastDashIndex < slug.length - 1) {
        const owner = slug.slice(0, lastDashIndex);
        const repo = slug.slice(lastDashIndex + 1);
        if (owner && repo) {
          return `${owner}/${repo}`;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeSpaceReference(spaceUrl: string) {
  const trimmed = spaceUrl.trim();
  if (!trimmed) return null;
  const directMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (directMatch) {
    return `${directMatch[1]}/${directMatch[2]}`;
  }
  return parseSpaceIdFromUrl(trimmed);
}

function buildParamConfig(
  componentType: string,
  componentProps: Record<string, unknown>,
  label: string,
  defaultValue?: unknown,
): ParameterConfig {
  const required = resolveBoolean(componentProps.required, undefined);
  const min = resolveNumber(
    componentProps.minimum ?? componentProps.min,
    undefined,
  );
  const max = resolveNumber(
    componentProps.maximum ?? componentProps.max,
    undefined,
  );
  const step = resolveNumber(componentProps.step, undefined);
  const optionsRaw =
    (componentProps.choices as Array<string | number>) ??
    (componentProps.options as Array<string | number>);

  const options = Array.isArray(optionsRaw) ? optionsRaw : undefined;
  const value =
    componentProps.value ?? componentProps.default ?? defaultValue;

  if (componentType.includes("slider")) {
    return {
      ui: "range",
      label,
      required,
      min,
      max,
      step,
      default: resolveNumber(value, undefined),
    };
  }

  if (componentType.includes("number")) {
    return {
      ui: "input",
      label,
      required,
      min,
      max,
      step,
      default: resolveNumber(value, undefined),
    };
  }

  if (componentType.includes("dropdown") || componentType.includes("radio")) {
    return {
      ui: "select",
      label,
      required,
      options,
      default:
        typeof value === "string" || typeof value === "number" ? value : undefined,
    };
  }

  if (componentType.includes("checkbox")) {
    return {
      ui: "toggle",
      label,
      required,
      default: resolveBoolean(value, undefined),
    };
  }

  if (componentType.includes("image") || componentType.includes("gallery")) {
    return {
      ui: "upload",
      label,
      required,
    };
  }

  const lines = resolveNumber(componentProps.lines, 1) ?? 1;
  return {
    ui: lines > 1 ? "textarea" : "input",
    label,
    required,
    default: typeof value === "string" ? value : undefined,
  };
}

function detectModelType(outputTypes: string[], hasVideoParam: boolean) {
  if (hasVideoParam) return "video";
  if (outputTypes.some((type) => type.includes("video"))) return "video";
  return "image";
}

function getDefaultFromParam(param?: ParameterConfig) {
  return param?.default;
}

export async function importModelDraftFromSpace(
  payload: ImportRequest,
): Promise<ImportResult> {
  const spaceUrl = payload.spaceUrl?.trim();
  if (!spaceUrl) {
    throw new Error("INVALID_SPACE_URL");
  }

  const tokenValue =
    process.env.HF_TOKEN?.trim() ||
    process.env.HUGGINGFACEHUB_API_TOKEN?.trim() ||
    undefined;

  const spaceRef = normalizeSpaceReference(spaceUrl);
  if (!spaceRef) {
    throw new Error("INVALID_SPACE_URL");
  }
  const clientOptions = tokenValue
    ? { token: tokenValue as `hf_${string}` }
    : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const connectPromise = Client.connect(spaceRef, clientOptions);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("SPACE_CONNECT_TIMEOUT"));
    }, CONNECT_TIMEOUT_MS);
  });
  const client = await Promise.race([connectPromise, timeoutPromise]).finally(
    () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  );
  const apiInfo = await client.view_api();
  const config = client.config;
  if (!config) {
    throw new Error("SPACE_CONFIG_NOT_FOUND");
  }

  const named = apiInfo?.named_endpoints ?? {};
  const apiNames = Object.keys(named).map(normalizeApiName);
  if (apiNames.length === 0) {
    throw new Error("SPACE_API_NOT_FOUND");
  }

  const requested = payload.apiName ? normalizeApiName(payload.apiName) : "";
  const resolvedApiName = requested && apiNames.includes(requested)
    ? requested
    : apiNames[0];

  const endpoint = named[resolvedApiName] ?? named[resolvedApiName.replace(/^\//, "")];
  if (!endpoint) {
    throw new Error("SPACE_API_NOT_FOUND");
  }

  const dependency = config.dependencies.find(
    (dep) => normalizeApiName(`/${dep.api_name ?? ""}`) === resolvedApiName,
  );

  const componentsById = new Map(config.components.map((component) => [component.id, component]));
  const inputComponents = (dependency?.inputs ?? []).map((id) => componentsById.get(id));
  const outputComponents = (dependency?.outputs ?? []).map((id) => componentsById.get(id));

  const outputTypes = outputComponents
    .map((component) => (component ? resolveComponentType(component) : null))
    .filter((type): type is string => Boolean(type));

  const parameters: Record<string, ParameterConfig> = {};
  const warnings: string[] = [];
  let hasVideoParam = false;
  let hasImageInput = false;
  let inputImagesFormat: "file_array" | "gallery" = "file_array";

  inputComponents.forEach((component, index) => {
    if (!component) return;
    const componentProps = (component.props ?? {}) as Record<string, unknown>;
    const componentType = resolveComponentType(component);
    const paramInfo = endpoint.parameters?.[index];
    const label = resolveComponentLabel(componentProps) || paramInfo?.label || paramInfo?.parameter_name || "parameter";
    const paramKey = resolveParamKey(label, paramInfo?.parameter_name, componentType);

    if (!paramKey) {
      warnings.push(`UNMAPPED_PARAM:${label}`);
      return;
    }

    if (paramKey === "durationSec" || paramKey === "fps" || paramKey === "resolution" || paramKey === "aspectRatio") {
      hasVideoParam = true;
    }

    if (componentType.includes("image") || componentType.includes("gallery")) {
      hasImageInput = true;
      if (componentType.includes("gallery")) {
        inputImagesFormat = "gallery";
      }
    }

    parameters[paramKey] = buildParamConfig(
      componentType,
      componentProps,
      label,
      paramInfo?.parameter_default,
    );
  });

  outputComponents.forEach((component) => {
    if (!component) return;
    const componentType = resolveComponentType(component);
    if (componentType && componentType.includes("video")) {
      hasVideoParam = true;
    }
  });

  const modelType = detectModelType(outputTypes, hasVideoParam);
  const spaceId = config.space_id || spaceRef;
  const key = normalizeKey(spaceId.replace("/", "-")) || normalizeKey(spaceUrl);
  const label = resolveString(config.title, spaceId);

  if (modelType === "image") {
    const initKey = parameters.initImage ? "initImages" : null;
    if (parameters.initImage && initKey) {
      parameters[initKey] = parameters.initImage;
      delete parameters.initImage;
    }
  }

  if (modelType === "video" && parameters.initImage) {
    parameters.initImage.ui = "upload";
  }

  const normalizedParameters =
    modelType === "image"
      ? { ...FALLBACK_IMAGE_PARAMETERS, ...parameters }
      : { ...FALLBACK_VIDEO_PARAMETERS, ...parameters };

  const width = resolveNumber(
    getDefaultFromParam(normalizedParameters.width),
    DEFAULT_IMAGE_META.default_width,
  );
  const height = resolveNumber(
    getDefaultFromParam(normalizedParameters.height),
    DEFAULT_IMAGE_META.default_height,
  );
  const steps = resolveNumber(
    getDefaultFromParam(normalizedParameters.steps),
    DEFAULT_IMAGE_META.default_steps,
  );
  const guidanceScale = resolveNumber(
    getDefaultFromParam(normalizedParameters.guidanceScale),
    DEFAULT_VIDEO_META.default_guidance_scale,
  );
  const durationSec = resolveNumber(
    getDefaultFromParam(normalizedParameters.durationSec),
    DEFAULT_VIDEO_META.default_duration_sec,
  );
  const fps = resolveNumber(
    getDefaultFromParam(normalizedParameters.fps),
    DEFAULT_VIDEO_META.default_fps,
  );

  const meta =
    modelType === "image"
      ? {
          ...DEFAULT_IMAGE_META,
          model_id: spaceId,
          default_width: width,
          default_height: height,
          default_steps: steps,
          max_input_images: hasImageInput ? 1 : 0,
        }
      : {
          ...DEFAULT_VIDEO_META,
          supports_init_image: hasImageInput,
          t2v_model_id: spaceId,
          i2v_model_id: null,
          default_width: DEFAULT_VIDEO_META.default_width,
          default_height: DEFAULT_VIDEO_META.default_height,
          default_duration_sec: durationSec,
          default_fps: fps,
          default_steps: steps,
          default_guidance_scale: guidanceScale,
        };

  const providerConfig: Record<string, unknown> = {
    space_id: spaceId,
    api_name: resolvedApiName,
    timeout_ms: DEFAULT_TIMEOUT_MS,
  };

  if (modelType === "image") {
    providerConfig.input_images_format = inputImagesFormat;
  }

  const draft: DraftPayload = {
    type: modelType,
    key,
    label,
    vendor: DEFAULT_VENDOR,
    provider: DEFAULT_PROVIDER,
    providerConfig,
    parameters: normalizedParameters,
    meta,
    isActive: true,
    isDefault: false,
  };

  return {
    spaceId,
    apiNames,
    resolvedApiName,
    draft,
    warnings,
  };
}
