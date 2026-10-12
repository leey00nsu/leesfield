"use client";
import {
  gradioFieldLabel,
  gradioFormError,
  gradioFormMessage,
} from "@/shared/model-catalog/gradio-form-validation";
import { useLocale } from "next-intl";
import {
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
  AppSelectContent,
  AppSelectItem,
} from "@/shared/ui/app-select";
import { Switch } from "@/shared/ui/brand/switch/switch";
import { resolveContractGenerationCapabilities } from "@/shared/model-catalog/modality";
import { GenerationReferenceAttachments } from "./generation-reference-attachments";
import { GradioFileField, GradioFileSlot, PairedAudioSection } from "./gradio-file-field";
import { pairedAudioField, reorderPairedSlots } from "@/shared/model-catalog/attachment-relationships";
import { fileFieldMaxItems } from "@/shared/model-catalog/gradio-contract";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppButton } from "@/shared/ui/app-button";
import { AppPromptMessage } from "./app-prompt-message";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
import { type JsonValue } from "@/shared/model-catalog/gradio-contract";
import { numericParameterValue } from "@/shared/model-catalog/parameter-contract";
import { useState, useEffect, useRef } from "react";

export function isContractFileField(field: GradioContract["inputs"][number]) {
  return ["file", "files", "gallery"].includes(field.kind);
}

export function contractOptionFields(contract: GradioContract) {
  return contract.inputs.filter(field => !field.canonical && !field.hidden && !isContractFileField(field));
}

export function GradioContractFields({
  contract,
  values,
  prompt,
  onChange,
  scope = "all",
  disabled = false,
  excludeNames = [],
}: {
  contract: GradioContract;
  values: Record<string, unknown>;
  prompt: string;
  onChange: (values: Record<string, JsonValue>) => void;
  scope?: "all" | "attachments" | "options";
  disabled?: boolean;
  excludeNames?: readonly string[];
}) {
  const ko = useLocale() === "ko";
  const [customChoices, setCustomChoices] = useState<Record<string, string>>({});
  const [relationError,setRelationError] = useState<string|null>(null);

  const latest = useRef(values);
  useEffect(()=>{latest.current=values;},[values]);
  const update = (name: string, value: JsonValue | undefined) => {
    if (disabled) return;
    const next = { ...latest.current };
    if (value === undefined) delete next[name];
    else next[name] = value;
    latest.current = next;
    onChange(next as Record<string, JsonValue>);
  };
  const fields = contract.inputs.filter(field =>
    !field.canonical && !field.hidden && !excludeNames.includes(field.name) &&
    (scope === "all" || isContractFileField(field) === (scope === "attachments")),
  );
  const topFields = fields.filter(field => !field.attachment || !fields.some(parent=>parent.name===field.attachment?.pairedWith));
  if (!fields.length) return null;
  const capabilities = scope === "attachments" ? resolveContractGenerationCapabilities(contract,contract.output?.media ?? "video") : null;
  const requiredReferences = capabilities && capabilities.modalities.length > 0 && !capabilities.modalities.some(mode=>mode.startsWith("T2"))
    ? capabilities.modalities.map(mode=>({I:ko ? "이미지" : "image",V:ko ? "영상" : "video",A:ko ? "오디오" : "audio"}[mode[0] as "I"|"V"|"A"])).join(ko ? " 또는 " : " or ") : null;
  const keys = new Set(fields.map(field => field.name));
  const visibleContract = { ...contract, inputRules: undefined, inputGroups: undefined, inputs: fields };
  const error = gradioFormError(visibleContract, {
    prompt, dynamicParams: Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key))),
  }, "options");
  return (
    <div data-contract-fields={scope} className={scope === "attachments"
      ? "flex max-h-[35vh] min-w-0 flex-col gap-3 overflow-y-auto px-4 pt-4"
      : "grid max-h-[60vh] min-w-0 grid-cols-2 gap-x-3 gap-y-5 overflow-y-auto p-1"}>
      <GenerationReferenceAttachments fields={scope === "attachments" ? topFields : []} disabled={disabled} requirement={requiredReferences ? (ko ? requiredReferences + " 참조가 필요합니다." : "A " + requiredReferences + " reference is required.") : undefined}>
      {topFields
        .map((field) => {
          const label = gradioFieldLabel(field, ko ? "ko" : "en").replace(/\s*\(optional\)\s*$/i, "");
          const value = Object.prototype.hasOwnProperty.call(values, field.name)
            ? values[field.name]
            : field.default;
          const paired = pairedAudioField(fields, field.name);
          return (
            <div key={field.name} className={["file", "files", "gallery"].includes(field.kind) ? "flex min-w-0 flex-col gap-2 text-sm" : "col-span-2 flex min-w-0 flex-col gap-2 text-sm"}>
              {(!isContractFileField(field) || !!field.choices?.length) && <span>
                {label}
                {field.required ? (
                  <span className="ml-2 text-xs text-destructive">
                    {ko ? "필수" : "Required"}
                  </span>
                ) : null}
              </span>}
              {paired && Array.isArray(values[paired.name]) && (values[paired.name] as unknown[]).some((item,index)=>item!=null && index>=(Array.isArray(value)?value.length:0)) &&
                <AppButton type="button" variant="ghost" size="sm" disabled={disabled} className="self-start text-xs"
                  onClick={()=>{update(paired.name,(latest.current[paired.name] as JsonValue[]).slice(0,Array.isArray(value)?value.length:0));setRelationError(null);}}>
                  {ko?"연결할 영상이 없는 오디오 제거":"Remove audio without a matching video"}
                </AppButton>}
              {field.choiceMode === "multiple" ? (
                <fieldset aria-label={label} disabled={disabled} className="flex flex-col gap-2">
                  {(field.choices ?? []).map(option => {
                    const selected = Array.isArray(value) ? value : [];
                    const checked = selected.includes(option);
                    return <label key={JSON.stringify(option)} className="flex items-center gap-2">
                      <input type="checkbox" checked={checked}
                        disabled={!checked && field.maxChoices !== undefined && selected.length >= field.maxChoices}
                        onChange={e => update(field.name, e.target.checked ? [...selected, option] as JsonValue[] : selected.filter(v => v !== option) as JsonValue[])}/>
                      {String(option)}
                    </label>;
                  })}
                  {field.allowCustomValue && <>
                    <AppInput aria-label={label + (ko ? " 직접 입력" : " custom value")}
                      value={customChoices[field.name] ?? ""} onChange={e => setCustomChoices({...customChoices, [field.name]: e.target.value})}/>
                    <AppButton type="button" variant="ghost" size="sm" disabled={disabled || !customChoices[field.name]}
                      onClick={() => {
                        const selected=Array.isArray(value) ? value as JsonValue[] : [];
                        const custom=customChoices[field.name];
                        if (custom && !selected.includes(custom) && (field.maxChoices === undefined || selected.length < field.maxChoices)) {
                          update(field.name, [...selected, custom]);
                          setCustomChoices({...customChoices,[field.name]:""});
                        }
                      }}>{ko ? "추가" : "Add"}</AppButton>
                    {(Array.isArray(value) ? value : []).filter(v => !field.choices?.includes(v as string | number)).map(v => <AppButton
                      key={JSON.stringify(v)} type="button" variant="ghost" size="sm"
                      onClick={() => update(field.name, (value as JsonValue[]).filter(item => item !== v))}>{String(v)} · {ko ? "제거" : "Remove"}</AppButton>)}
                  </>}
                </fieldset>
              ) : field.choices?.length ? (
                <>
                <AppSelectRoot
                  disabled={disabled}
                  value={value == null ? "" : JSON.stringify(value)}
                  onValueChange={(selected) =>
                    update(
                      field.name,
                      selected === "" ? field.nullable ? null : undefined : JSON.parse(selected),
                    )
                  }
                >
                  <AppSelectTrigger
                    aria-label={label}
                    aria-required={field.required}
                    className="w-full"
                  >
                    <AppSelectValue placeholder={ko ? "선택" : "Select"} />
                  </AppSelectTrigger>
                  <AppSelectContent position="popper">
                    {(!field.required || field.nullable) && (
                      <AppSelectItem value="">
                        {ko ? "선택 안 함" : "Not selected"}
                      </AppSelectItem>
                    )}
                    {field.choices.map((v) => (
                      <AppSelectItem
                        key={JSON.stringify(v)}
                        value={JSON.stringify(v)}
                      >
                        {String(v)}
                      </AppSelectItem>
                    ))}
                  </AppSelectContent>
                </AppSelectRoot>
                {field.allowCustomValue && <AppInput disabled={disabled} aria-label={label + (ko ? " 직접 입력" : " custom value")}
                  value={value == null ? "" : String(value)} onChange={e => update(field.name, e.target.value)}/>}
                </>
              ) : field.kind === "boolean" ? (
                <Switch
                  disabled={disabled}
                  aria-label={label}
                  aria-required={field.required}
                  checked={value === true}
                  onCheckedChange={(checked) => update(field.name, checked)}
                />
              ) : isContractFileField(field) ? (
                <GradioFileField disabled={disabled} label={label} field={field} value={value} onChange={(value) => update(field.name, value)}
                  onChangeOrder={paired ? order => {
                    if (disabled || (Object.hasOwn(latest.current,field.name)?latest.current[field.name]:field.default) !== value) return;
                    const videos = Array.isArray(value) ? value : [];
                    const audio = latest.current[paired.name] ?? paired.default;
                    const next = {...latest.current, [field.name]:order.map(index=>videos[index])};
                    try { if (Array.isArray(audio)) next[paired.name] = reorderPairedSlots(audio,order); }
                    catch {setRelationError(ko?"미지정 오디오의 기본 동작을 유지할 수 없는 순서입니다. 영상별 오디오를 첨부하거나 비운 뒤 이동해 주세요.":"This order cannot preserve unspecified audio defaults. Attach or clear each video soundtrack before moving it.");return;}
                    setRelationError(null);
                    latest.current = next; onChange(next as Record<string,JsonValue>);
                  } : undefined}
                  />
              ) : field.kind === "json" ? (
                <AppTextarea
                  disabled={disabled}
                  aria-label={label}
                  aria-required={field.required}
                  defaultValue={
                    value === undefined ? "" : JSON.stringify(value, null, 2)
                  }
                  onChange={(e) => {
                    try {
                      update(field.name, JSON.parse(e.target.value));
                    } catch {
                      update(field.name, e.target.value);
                    }
                  }}
                />
              ) : field.ui === "textarea" ? (
                <AppTextarea
                  disabled={disabled}
                  aria-label={label}
                  aria-required={field.required}
                  value={value == null ? "" : String(value)}
                  onChange={(e) => update(field.name, e.target.value)}
                />
              ) : (
                <AppInput
                  disabled={disabled}
                  aria-label={label}
                  aria-required={field.required}
                  type={field.kind === "number" ? "number" : "text"}
                  min={field.min}
                  max={field.max}
                  step={field.step ?? "any"}
                  value={value == null ? "" : String(value)}
                  onChange={(e) =>
                    update(
                      field.name,
                      field.kind === "number"
                        ? e.target.value === ""
                          ? undefined
                          : numericParameterValue(e.target.value) as JsonValue
                        : e.target.value,
                    )
                  }
                />
              )}
              {field.nullable && !["file", "files", "gallery"].includes(field.kind) && (
                <AppButton
                  disabled={disabled}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 self-start px-2 text-xs text-muted-foreground"
                  onClick={() => update(field.name, null)}
                >
                  {ko ? "값 비우기" : "Clear value"}
                </AppButton>
              )}
            </div>
          );
        })}
      </GenerationReferenceAttachments>
      {topFields.map(field => {
        const paired = pairedAudioField(fields, field.name);
        const value = Object.hasOwn(values, field.name) ? values[field.name] : field.default;
        if (!paired || !Array.isArray(value) || !value.length) return null;
        const audio = values[paired.name] ?? paired.default;
        return <PairedAudioSection key={paired.name} field={paired}>
          {value.slice(0, fileFieldMaxItems(paired)).map((_, index) =>
            <GradioFileSlot key={index} index={index} disabled={disabled} field={paired} label={gradioFieldLabel(paired, ko ? "ko" : "en")}
              value={Array.isArray(audio) ? audio[index] ?? null : null}
              onChange={selected => {
                if (disabled || (Object.hasOwn(latest.current, field.name) ? latest.current[field.name] : field.default) !== value) return;
                const current = latest.current[paired.name] ?? paired.default;
                const next = Array.isArray(current) ? [...current] : [];
                while (next.length <= index) next.push(null);
                next[index] = selected ?? null;
                update(paired.name, next as JsonValue[]);
              }} />)}
        </PairedAudioSection>;
      })}
      {relationError && <AppPromptMessage>{relationError}</AppPromptMessage>}
      {error && (
        <AppPromptMessage className="col-span-full">
          {gradioFormMessage(error, contract, ko ? "ko" : "en")}
        </AppPromptMessage>
      )}
    </div>
  );
}
