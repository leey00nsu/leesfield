
import { assertGradioExecutable, gradioInputValues, fileFieldMaxItems, type GradioContract } from "./gradio-contract";

export function gradioFieldLabel(field: GradioContract["inputs"][number]): string {
  const label = field.label || field.name;
  return field.required ? label.replace(/\s*\((?:optional|선택|선택 사항)\)/gi, "").trim() : label;
}

export function gradioFormError(contract: GradioContract, values: {prompt?: string; dynamicParams?: Record<string, unknown>}, scope: "form" | "options" = "form"): string | null {
  if (scope === "options") contract = {...contract, inputRules: undefined, inputGroups: undefined, inputs: contract.inputs.filter(field=>!field.canonical && !field.hidden)};
  const prompt = contract.inputs.find(field => field.canonical === "prompt");
  if (scope === "form" && prompt && !prompt.allowEmpty && !values.prompt?.trim()) {
    return "HF_CONTRACT_REQUIRED:" + prompt.name;
  }
  try {
    assertGradioExecutable(contract);
    const inputs = gradioInputValues(contract, values);
    for (const field of contract.inputs) {
      const value = inputs[field.name];
      if (field.required && !field.allowEmpty && ((typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0))) {
        return "HF_CONTRACT_REQUIRED:" + field.name;
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "HF_CONTRACT_INVALID";
  }
}

export function gradioFormMessage(error: string, contract: GradioContract, locale: string): string {
  const ko = locale === "ko";
  const detail = error.slice(error.indexOf(":") + 1);
  const field = contract.inputs.find(field => detail === field.name || detail.startsWith(field.name + ":"));
  const label = (field ? gradioFieldLabel(field) : "") || (ko ? "입력 항목" : "This input");
  if (error.startsWith("HF_CONTRACT_REQUIRED:"))
    return ko ? label + ": 필수 입력입니다." : label + ": This field is required.";
  if (error.startsWith("HF_CONTRACT_FILE_COUNT_LIMIT:")) {
    const limit = field ? fileFieldMaxItems(field) : 8;
    return ko ? `${label}: 최대 ${limit}개까지 첨부할 수 있습니다.` : `${label}: Attach up to ${limit} files.`;
  }
  if (error.startsWith("HF_CONTRACT_RANGE:") || error.startsWith("HF_CONTRACT_INTEGER:"))
    return ko ? label + ": 허용 범위와 입력 단위를 확인해 주세요." : label + ": Check the allowed range and step.";
  if (error.startsWith("HF_CONTRACT_CHOICE:"))
    return ko ? label + ": 제공된 옵션을 선택해 주세요." : label + ": Select one of the available options.";
  if (error.startsWith("HF_CONTRACT_NOT_NULLABLE:"))
    return ko ? label + ": 값을 입력해 주세요." : label + ": Enter a value.";
  if (error.startsWith("HF_CONTRACT_TYPE:") || error.startsWith("HF_CONTRACT_SCHEMA:"))
    return ko ? label + ": 입력 형식을 확인해 주세요." : label + ": Check the input format.";
  return ko ? "이 모델의 입력 또는 출력 설정으로는 생성할 수 없습니다. 모델 설정을 확인해 주세요." : "This model cannot generate with its current input or output settings. Check the model configuration.";
}
