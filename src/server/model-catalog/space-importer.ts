import { assessGradioSupport, normalizeGradioModel } from "@/shared/model-catalog/gradio-contract";
import { buildImportContract, gradioLabel } from "@/server/hf-space/import-contract";
import { Client } from "@gradio/client";
import {
  scoreEndpointCandidate,
} from "@/server/hf-space/endpoint-scoring";
import {
  buildHfParameterDescriptors,
  type HfParameterBinding,
} from "@/server/hf-space/parameter-contract";
import {
  normalizeRuntimeParameterOptions,
  type RuntimeParameterOptionInput,
} from "@/shared/model-catalog/parameter-options";

type ModelType = "image" | "video" | "audio";

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
  options?: RuntimeParameterOptionInput[];
  binding?: HfParameterBinding;
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
  support: ReturnType<typeof assessGradioSupport>;
  spaceId: string;
  apiNames: string[];
  resolvedApiName: string;
  draft: DraftPayload;
  warnings: string[];
};

type EndpointParameter = {
  parameter_name?: string;
  label?: string;
  parameter_has_default?: boolean;
  parameter_default?: unknown;
  component?: string;
  python_type?: { type?: string } | string;
  hidden?: boolean;
};

type EndpointInfo = {
  parameters?: EndpointParameter[];
};

const DEFAULT_VENDOR = "HUGGINGFACE";
const DEFAULT_PROVIDER = "hf_space";
const CONNECT_TIMEOUT_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 300000;

function normalizeApiName(name: string | false) {
  if (typeof name !== "string") return "";
  return name.startsWith("/") ? name : `/${name}`;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
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
  return gradioLabel(componentProps.label);
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
    (componentProps.choices as RuntimeParameterOptionInput[]) ??
    (componentProps.options as RuntimeParameterOptionInput[]);

  const options = normalizeRuntimeParameterOptions(optionsRaw);
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

function detectModelType(
  outputTypes: string[],
  hasVideoParam: boolean,
  hasAudioParam: boolean,
) {
  if (hasAudioParam) return "audio";
  if (outputTypes.some((type) => type.includes("audio"))) return "audio";
  if (hasVideoParam) return "video";
  if (outputTypes.some((type) => type.includes("video"))) return "video";
  return "image";
}

async function connectWithTimeout(
  spaceRef: string,
  clientOptions?: Parameters<typeof Client.connect>[1],
) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const connectPromise = Client.connect(spaceRef, clientOptions);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("SPACE_CONNECT_TIMEOUT"));
    }, CONNECT_TIMEOUT_MS);
  });

  try {
    return (await Promise.race([connectPromise, timeoutPromise])) as Awaited<
      ReturnType<typeof Client.connect>
    >;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function importModelDraftFromSpace(
  payload: ImportRequest,
): Promise<ImportResult> {
  // 1) 입력 검증 및 HF Space ref 정규화
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

  // 2) HF Space 연결 + API/config 로딩
  const clientOptions = tokenValue
    ? { token: tokenValue as `hf_${string}` }
    : undefined;
  const client = await connectWithTimeout(spaceRef, clientOptions);
  let metadataTimer: ReturnType<typeof setTimeout> | undefined;
  const apiInfo = await Promise.race([client.view_api(), new Promise<never>((_, reject) => { metadataTimer = setTimeout(() => reject(new Error("SPACE_METADATA_TIMEOUT")), CONNECT_TIMEOUT_MS); })]).finally(() => clearTimeout(metadataTimer));
  const config = client.config;
  if (!config) {
    throw new Error("SPACE_CONFIG_NOT_FOUND");
  }

  const named = apiInfo?.named_endpoints ?? {};
  for (const endpoint of Object.values(named)) {
    for (const param of endpoint.parameters ?? []) { param.label = gradioLabel(param.label, param.parameter_name); }
  }
  const apiNames = Object.keys(named).map(normalizeApiName);
  if (apiNames.length === 0) {
    throw new Error("SPACE_API_NOT_FOUND");
  }

  const componentsById = new Map(config.components.map((component) => [component.id, component]));
  const dependencyByApiName = new Map(
    config.dependencies.map((dependency) => [
      normalizeApiName(dependency.api_name ?? ""),
      dependency,
    ]),
  );
  const outputTypesByApiName = new Map<string, string[]>();
  for (const apiName of apiNames) {
    const dependency = dependencyByApiName.get(apiName);
    const outputTypes = (dependency?.outputs ?? [])
      .map((id) => componentsById.get(id))
      .map((component) => (component ? resolveComponentType(component) : null))
      .filter((type): type is string => Boolean(type));
    outputTypesByApiName.set(apiName, outputTypes);
  }

  const warnings: string[] = [];
  const requested = payload.apiName ? normalizeApiName(payload.apiName) : "";
  if (requested && !apiNames.includes(requested)) {
    warnings.push(`UNKNOWN_REQUESTED_API_NAME:${requested}`);
  }
  const resolvedApiName =
    requested && apiNames.includes(requested)
        ? requested
        : [...apiNames].sort((left, right) => {
          const leftScore = scoreEndpointCandidate(
            left,
            named[left] ?? named[left.replace(/^\//, "")],
            outputTypesByApiName.get(left) ?? [],
          );
          const rightScore = scoreEndpointCandidate(
            right,
            named[right] ?? named[right.replace(/^\//, "")],
            outputTypesByApiName.get(right) ?? [],
          );
          return rightScore - leftScore;
        })[0];

  const endpoint = named[resolvedApiName] ?? named[resolvedApiName.replace(/^\//, "")];
  if (!endpoint) {
    throw new Error("SPACE_API_NOT_FOUND");
  }

  // 3) 엔드포인트 연결 컴포넌트 매핑
  const dependency = dependencyByApiName.get(resolvedApiName);
  const inputComponents = (dependency?.inputs ?? []).map((id) => componentsById.get(id));
  const outputComponents = (dependency?.outputs ?? []).map((id) =>
    componentsById.get(id),
  );
  const outputTypes = outputTypesByApiName.get(resolvedApiName) ?? [];

  const parameters: Record<string, ParameterConfig> = {};
  let hasVideoParam = false;
  let hasAudioParam = false;
  let hasImageInput = false;
  let hasAudioInput = false;
  let inputImagesFormat: "file_array" | "gallery" = "file_array";
  const descriptorResult = buildHfParameterDescriptors(
    (endpoint.parameters ?? []).map((paramInfo, index) => {
      const component = inputComponents[index];
      const componentProps = (component?.props ?? {}) as Record<string, unknown>;
      return {
        ...paramInfo,
        component: resolveComponentType(component, paramInfo.component),
        label:
          resolveComponentLabel(componentProps) ||
          paramInfo.label ||
          paramInfo.parameter_name,
        parameter_has_default:
          paramInfo.parameter_has_default ??
          (paramInfo.parameter_default !== undefined ||
            componentProps.value !== undefined ||
            componentProps.default !== undefined),
        parameter_default:
          componentProps.value ??
          componentProps.default ??
          paramInfo.parameter_default,
        choices:
          (componentProps.choices as RuntimeParameterOptionInput[]) ??
          (componentProps.options as RuntimeParameterOptionInput[]),
        lines:
          typeof componentProps.lines === "number"
            ? componentProps.lines
            : undefined,
      };
    }),
  );
  warnings.push(...descriptorResult.warnings);

  inputComponents.forEach((component, index) => {
    if (!component) return;
    const componentProps = (component.props ?? {}) as Record<string, unknown>;
    const componentType = resolveComponentType(component);
    const paramInfo = endpoint.parameters?.[index];
    const label = resolveComponentLabel(componentProps) || paramInfo?.label || paramInfo?.parameter_name || "parameter";
    const descriptorEntry = Object.entries(descriptorResult.parameters).find(
      ([, config]) => config.binding.order === index,
    );

    if (!descriptorEntry) {
      warnings.push(`UNMAPPED_PARAM:${label}`);
      return;
    }
    const [paramKey, descriptorConfig] = descriptorEntry;

    if (paramKey === "durationSec" || paramKey === "fps" || paramKey === "resolution" || paramKey === "aspectRatio") {
      hasVideoParam = true;
    }
    if (paramKey === "voice" || paramKey === "speed" || paramKey === "inputAudio") {
      hasAudioParam = true;
    }

    if (componentType.includes("image") || componentType.includes("gallery")) {
      hasImageInput = true;
      if (componentType.includes("gallery")) {
        inputImagesFormat = "gallery";
      }
    }
    if (componentType.includes("audio")) {
      hasAudioInput = true;
    }

    parameters[paramKey] = {
      ...buildParamConfig(
        componentType,
        componentProps,
        label,
        paramInfo?.parameter_default,
      ),
      ...descriptorConfig,
    };
  });

  outputComponents.forEach((component) => {
    if (!component) return;
    const componentType = resolveComponentType(component);
    if (componentType && componentType.includes("video")) {
      hasVideoParam = true;
    }
    if (componentType && componentType.includes("audio")) {
      hasAudioParam = true;
    }
  });

  // 4) 모델 타입/파라미터/메타 구성
  const contract = buildImportContract(resolvedApiName, endpoint, config);
  warnings.push(...contract.diagnostics);
  const modelType = contract.output?.media ?? detectModelType(outputTypes, hasVideoParam, hasAudioParam);
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
  if (modelType === "audio" && parameters.inputAudio) {
    parameters.inputAudio.ui = "upload";
  }

  const normalizedParameters = parameters;

  const meta = modelType === "image"
    ? { pipeline: "diffusion", model_id: spaceId, max_input_images: hasImageInput ? 1 : 0 }
    : modelType === "video"
      ? { supports_init_image: hasImageInput, t2v_model_id: spaceId, i2v_model_id: null }
      : { model_id: spaceId, supports_input_audio: hasAudioInput };

  const providerConfig: Record<string, unknown> = {
    space_id: spaceId,
    gradio_contract: contract,
    api_name: resolvedApiName,
    timeout_ms: DEFAULT_TIMEOUT_MS,
  };

  if (modelType === "image") {
    providerConfig.input_images_format = inputImagesFormat;
  }
  if (modelType === "audio" && hasAudioInput) {
    providerConfig.input_audio_format = "file";
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
    support: assessGradioSupport(contract),
    spaceId,
    apiNames,
    resolvedApiName,
    draft: normalizeGradioModel(draft),
    warnings,
  };
}
