import { contractAuthoringDefaults, contractAuthoringParameters } from "@/shared/model-catalog/gradio-contract";
import { authoringValuesToImageConfig, resolveImageAuthoringDefaults } from "@/shared/generation/image-authoring";
import { generationPayload } from "@/shared/model-catalog/generation-payload";
import { promptPresetRefSchema } from "@/shared/prompt-presets/prompt-preset-contract";
import { promptPresetRecommendations } from "@/shared/prompt-presets/prompt-preset-application";
import {
  getRuntimeAudioDynamicParameters,
  resolveRuntimeAudioDefaults,
  resolveRuntimeVideoDefaults,
  type RuntimeAudioModel,
  type RuntimeImageModel,
  type RuntimeVideoModel,
} from "@/shared/model-catalog/runtime-utils";

type Model = RuntimeImageModel | RuntimeVideoModel | RuntimeAudioModel;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function recommendForNewModel(current: Record<string, unknown>, next: Record<string, unknown>, result: Record<string, unknown>, model: Model) {
  const ref = promptPresetRefSchema.safeParse(next.promptPreset);
  if (!ref.success || current.modelKey === next.modelKey) return result;
  const parameters = { ...record(result.parameters) };
  const explicit = record(generationPayload(model, record(next.parameters)));
  const values = record(generationPayload(model, parameters));
  const recommendation = promptPresetRecommendations(model, values, ref.data, path => path.startsWith("dynamicParams.")
    ? Object.hasOwn(record(explicit.dynamicParams), path.slice(14)) : Object.hasOwn(explicit, path));
  for (const [path, value] of Object.entries(recommendation.updates)) {
    if (path.startsWith("dynamicParams.")) parameters.dynamicParams = { ...record(parameters.dynamicParams), [path.slice(14)]: value };
    else parameters[path] = value;
  }
  return { ...result, parameters };
}

export function projectGenerationModelSelectionDefaults(
  currentConfig: Record<string, unknown>,
  nextConfig: Record<string, unknown>,
  models: readonly Model[],
) {
  if (!nextConfig.modelKey) return nextConfig;
  const model = models.find((candidate) => candidate.key === nextConfig.modelKey);
  if (!model) return nextConfig;
  const prompt = typeof nextConfig.prompt === "string" ? nextConfig.prompt : "";
  const contractDefaults = contractAuthoringDefaults(model);
  if (contractDefaults) {
    const reset = Object.hasOwn(nextConfig, "parameters") && Object.keys(record(nextConfig.parameters)).length === 0;
    const previous = currentConfig.modelKey === nextConfig.modelKey && !reset ? record(currentConfig.parameters) : {};
    return recommendForNewModel(currentConfig, nextConfig, { ...nextConfig, parameters: { ...contractDefaults, ...contractAuthoringParameters(model, { ...previous, ...record(nextConfig.parameters) }) } }, model);
  }
  const defaults = model.type === "image"
    ? authoringValuesToImageConfig(resolveImageAuthoringDefaults(model, prompt), model).parameters
    : model.type === "video"
      ? resolveRuntimeVideoDefaults(model)
      : resolveRuntimeAudioDefaults(model);
  const nextParameters = record(nextConfig.parameters);
  // A supplied empty parameter object is an explicit reset. Partial updates
  // retain authored values for the same model, including hidden generic fields.
  const resetParameters = Object.hasOwn(nextConfig, "parameters") && Object.keys(nextParameters).length === 0;
  const currentParameters = currentConfig.modelKey === nextConfig.modelKey && !resetParameters
    ? record(currentConfig.parameters)
    : {};
  const parameters = { ...currentParameters, ...nextParameters };
  const dynamicDefaults = model.type === "audio"
    ? Object.fromEntries(getRuntimeAudioDynamicParameters(model)
      .filter(({ config }) => config.default !== undefined)
      .map(({ key, config }) => [key, config.default]))
    : {};
  return recommendForNewModel(currentConfig, nextConfig, {
    ...nextConfig,
    parameters: {
      ...defaults,
      ...parameters,
      ...(Object.keys(dynamicDefaults).length
        ? { dynamicParams: {
            ...dynamicDefaults,
            ...(Object.hasOwn(nextParameters, "dynamicParams") && Object.keys(record(nextParameters.dynamicParams)).length === 0
              ? {}
              : record(currentParameters.dynamicParams)),
            ...record(nextParameters.dynamicParams),
          } }
        : {}),
    },
  }, model);
}
