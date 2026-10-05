"use client";

import { useLocale } from "next-intl";
import { getGradioContract, normalizeGradioModel, fileFieldMaxItems } from "@/shared/model-catalog/gradio-contract";
import { AppInput } from "@/shared/ui/app-input";
import { AppLabel } from "@/shared/ui/app-form-control";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Edit application limits without changing the provider's scalar/array contract. */
export function ModelImageInputLimits({ type, providerConfigText, parametersText, metaText, onChange }: {
  type: string; providerConfigText: string; parametersText: string; metaText: string;
  onChange: (value: { parametersText?: string; metaText?: string }) => void;
}) {
  const ko = useLocale() === "ko";
  let model, contract;
  try {
    model = normalizeGradioModel({ providerConfig: JSON.parse(providerConfigText), parameters: JSON.parse(parametersText), meta: JSON.parse(metaText) });
    // Read the immutable provider ceiling independently of the edited limit.
    contract = getGradioContract({ ...model, parameters: Object.fromEntries(Object.entries(record(model.parameters)).map(([key, raw]) => {
      const parameter = { ...record(raw) }; delete parameter.maxItems; return [key, parameter];
    })) });
  } catch { return null; }
  const parameters = record(model.parameters), meta = record(model.meta);
  const fields = contract?.inputs.filter(field => field.media === "image" && ["file", "files", "gallery"].includes(field.kind) && !field.hidden) ?? [];
  if (contract && !fields.length) return null;
  if (!contract && type !== "image" && !(type === "video" && meta.supports_init_image)) return null;
  const title = ko ? "최대 입력 이미지 수" : "Maximum input images";
  return <div className="flex flex-col gap-3">
    {contract ? fields.map(field => {
      const key = Object.keys(parameters).find(key => key === field.name || record(record(parameters[key]).binding).parameterName === field.name) ?? field.name;
      const parameter = record(parameters[key]);
      const ceiling = fileFieldMaxItems(field);
      const minimum = Math.max(1, typeof field.schema.minItems === "number" ? field.schema.minItems : 1);
      return <div key={field.name} className="flex flex-col gap-2">
        <AppLabel htmlFor={"image-limit-" + field.name}>{title} · {field.label}</AppLabel>
        <AppInput id={"image-limit-" + field.name} type="number" min={minimum} max={ceiling} step={1}
          disabled={field.kind === "file"} value={parameter.maxItems === undefined ? ceiling : String(parameter.maxItems)}
          onChange={event => onChange({ parametersText: JSON.stringify({ ...parameters, [key]: { ...parameter, maxItems: event.target.value === "" ? "" : Number(event.target.value) } }, null, 2) })}/>
        <p className="text-xs text-muted-foreground">{field.kind === "file"
          ? (ko ? "단일 이미지 입력입니다." : "This input accepts a single image.")
          : (ko ? `이 입력은 최대 ${ceiling}장까지 처리할 수 있습니다.` : `This input supports up to ${ceiling} images.`)}</p>
      </div>;
    }) : <div className="flex flex-col gap-2">
      <AppLabel htmlFor="image-limit-legacy">{title}</AppLabel>
      <AppInput id="image-limit-legacy" type="number" min={0} step={1} disabled={type === "video"}
        value={type === "video" ? 1 : String(meta.max_input_images ?? 0)}
        onChange={event => onChange({metaText: JSON.stringify({...meta, max_input_images: event.target.value === "" ? "" : Number(event.target.value)}, null, 2)})}/>
      <p className="text-xs text-muted-foreground">{ko ? "모델이 실제로 지원하는 개수를 설정하세요. 0은 이미지 입력 없음입니다." : "Set the number supported by the model. Zero means no image input."}</p>
    </div>}
  </div>;
}
