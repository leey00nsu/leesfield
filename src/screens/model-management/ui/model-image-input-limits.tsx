"use client";

import { useLocale } from "next-intl";
import { getGradioContract, normalizeGradioModel, fileFieldMaxItems } from "@/shared/model-catalog/gradio-contract";
import { AppInput } from "@/shared/ui/app-input";
import { AppLabel } from "@/shared/ui/app-form-control";
import { gradioFieldLabel } from "@/shared/model-catalog/gradio-form-validation";
import { resolveContractGenerationCapabilities } from "@/shared/model-catalog/modality";
import { fileFieldAllowsNullItems } from "@/shared/model-catalog/gradio-file-schema";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Edit application limits without changing the provider's scalar/array contract. */
export function ModelReferenceInputLimits({ type, providerConfigText, parametersText, metaText, onChange }: {
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
  const fields = contract?.inputs.filter(field => field.media && ["file", "files", "gallery"].includes(field.kind) && !field.hidden) ?? [];
  if (contract && !fields.length) return null;
  if (!contract && type !== "image" && !(type === "video" && meta.supports_init_image)) return null;
  const title = ko ? "최대 입력 이미지 수" : "Maximum input images";
  const capabilities = contract && (type === "image" || type === "video" || type === "audio") ? resolveContractGenerationCapabilities(contract,type) : null;
  return <div className="flex flex-col gap-3">
    {capabilities && <div className="flex flex-col gap-2">
      <AppLabel>{ko ? "지원 방식" : "Supported modes"}</AppLabel>
      <div className="flex flex-wrap gap-2">{capabilities.modalities.map(mode=><span key={mode} className="rounded-full border border-border px-3 py-1 text-xs">{mode}</span>)}</div>
    </div>}
    {contract && <AppLabel>{ko ? "참조 입력 한도" : "Reference input limits"}</AppLabel>}
    {contract ? fields.map(field => {
      const key = Object.keys(parameters).find(key => key === field.name || record(record(parameters[key]).binding).parameterName === field.name) ?? field.name;
      const parameter = record(parameters[key]);
      const ceiling = fileFieldMaxItems(field);
      const minimum = Math.max(1, typeof field.schema.minItems === "number" ? field.schema.minItems : 1);
      return <div key={field.name} className="flex flex-col gap-2">
        <AppLabel htmlFor={"image-limit-" + field.name}>{gradioFieldLabel(field,ko?"ko":"en")}</AppLabel>
        <AppInput id={"image-limit-" + field.name} type="number" min={minimum} max={ceiling} step={1}
          disabled={field.kind === "file"} value={parameter.maxItems === undefined ? ceiling : String(parameter.maxItems)}
          onChange={event => onChange({ parametersText: JSON.stringify({ ...parameters, [key]: { ...parameter, maxItems: event.target.value === "" ? "" : Number(event.target.value) } }, null, 2) })}/>
        <p className="text-xs text-muted-foreground">{field.kind === "file"
          ? (ko ? "파일 1개를 입력할 수 있습니다." : "This input accepts one file.")
          : (ko ? `최대 ${ceiling}${field.media === "image" ? "장" : fileFieldAllowsNullItems(field) ? "슬롯" : "개"}까지 설정할 수 있습니다.` : `Set a limit of up to ${ceiling} ${fileFieldAllowsNullItems(field)?"slots":"files"}.`)}
          {field.required ? (ko ? " 필수 입력입니다." : " Required input.") : (ko ? " 선택 입력입니다." : " Optional input.")}
          {fileFieldAllowsNullItems(field) && (ko ? " 빈 슬롯의 번호를 유지합니다." : "Empty slots keep their positions.")}</p>
        {field.media === "audio" && fileFieldAllowsNullItems(field) && !field.choices?.length && <>
          <AppLabel>{ko ? "오디오 연결" : "Audio relationship"}</AppLabel>
          <AppSelectRoot value={field.attachment?.pairedWith ?? "__independent"}
            onValueChange={pairedWith=>onChange({parametersText:JSON.stringify({...parameters,[key]:{...parameter,attachment:pairedWith==="__independent"?null:{role:"paired_audio",pairedWith,pairing:"index"}}},null,2)})}>
            <AppSelectTrigger aria-label={gradioFieldLabel(field,ko?"ko":"en")+": "+(ko?"오디오 연결":"Audio relationship")}><AppSelectValue/></AppSelectTrigger>
            <AppSelectContent position="popper">
              <AppSelectItem value="__independent">{ko ? "독립 참조 오디오" : "Independent reference audio"}</AppSelectItem>
              {fields.filter(parent=>parent.media==="video" && ["files","gallery"].includes(parent.kind) && !fileFieldAllowsNullItems(parent) && !parent.choices?.length &&
                !fields.some(child=>child.name!==field.name && child.attachment?.pairedWith===parent.name)).map(parent=><AppSelectItem key={parent.name} value={parent.name}>
                  {gradioFieldLabel(parent,ko?"ko":"en")+" · "+parent.name}
                </AppSelectItem>)}
            </AppSelectContent>
          </AppSelectRoot>
          <p className="text-xs text-muted-foreground">{ko ? "영상을 첨부하면 별도 영상별 오디오 영역이 열립니다. 같은 번호의 영상에 오디오를 연결합니다." : "Attaching a video opens a separate soundtrack section. Audio is linked to the video with the same index."}</p>
        </>}
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
