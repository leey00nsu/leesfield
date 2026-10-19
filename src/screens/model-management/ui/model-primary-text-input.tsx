"use client";

import { useLocale } from "next-intl";
import { getGradioContract, normalizeGradioModel } from "@/shared/model-catalog/gradio-contract";
import { AppLabel } from "@/shared/ui/app-form-control";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Presentation role only: provider field names and validation stay intact. */
export function ModelPrimaryTextInput({ providerConfigText, parametersText, onChange }: {
  providerConfigText: string; parametersText: string;
  onChange: (value: { parametersText: string; providerConfigText: string }) => void;
}) {
  const ko = useLocale() === "ko";
  let model, contract;
  try {
    model = normalizeGradioModel({ providerConfig: JSON.parse(providerConfigText), parameters: JSON.parse(parametersText) });
    contract = getGradioContract(model);
  } catch { return null; }
  if (!contract || record(model.providerConfig).workflow_id !== undefined) return null;
  const parameters = record(model.parameters);
  const candidates = contract.inputs.filter(field => field.kind === "string" && !field.hidden && !field.choices?.length);
  const current = contract.inputs.find(field => field.canonical === "prompt");
  return <div className="flex flex-col gap-2">
    <AppLabel>{ko ? "주 텍스트 입력" : "Primary text input"}</AppLabel>
    <AppSelectRoot value={current?.name ?? "__none"} onValueChange={name => {
      const next = Object.fromEntries(Object.entries(parameters).map(([key, raw]) => {
        const parameter = record(raw), binding = { ...record(parameter.binding) };
        const wasPrompt = binding.canonicalKey === "prompt";
        if (wasPrompt) delete binding.canonicalKey;
        if (binding.parameterName === name) binding.canonicalKey = "prompt";
        // A demoted generic prompt must not read the new primary editor value.
        return [key === "prompt" && wasPrompt && binding.parameterName !== name ? "hf:" + binding.parameterName : key,
          { ...parameter, binding }];
      }));
      onChange({ parametersText: JSON.stringify(next, null, 2), providerConfigText: JSON.stringify(model.providerConfig, null, 2) });
    }}>
      <AppSelectTrigger aria-label={ko ? "주 텍스트 입력" : "Primary text input"}><AppSelectValue /></AppSelectTrigger>
      <AppSelectContent position="popper">
        <AppSelectItem value="__none">{ko ? "미지정 · 원본 입력 사용" : "None · use original inputs"}</AppSelectItem>
        {candidates.map(field => <AppSelectItem key={field.name} value={field.name}>{field.label + " · " + field.name}</AppSelectItem>)}
      </AppSelectContent>
    </AppSelectRoot>
    <p className="text-xs text-muted-foreground">{ko
      ? "선택한 필드를 프롬프트 입력창과 노드의 텍스트 연결에 사용합니다. 미지정이면 원본 필드를 입력합니다."
      : "Use this field for the prompt editor and node text connections. Leave unset to enter the original fields."}</p>
  </div>;
}
