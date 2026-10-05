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
import { GradioFileField } from "./gradio-file-field";
import { AppInput } from "@/shared/ui/app-input";
import { AppTextarea } from "@/shared/ui/app-form-control";
import { AppButton } from "@/shared/ui/app-button";
import { AppPromptMessage } from "./app-prompt-message";
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
import { type JsonValue } from "@/shared/model-catalog/gradio-contract";

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

  const update = (name: string, value: JsonValue | undefined) => {
    if (disabled) return;
    const next = { ...values };
    if (value === undefined) delete next[name];
    else next[name] = value;
    onChange(next as Record<string, JsonValue>);
  };
  const fields = contract.inputs.filter(field =>
    !field.canonical && !field.hidden && !excludeNames.includes(field.name) &&
    (scope === "all" || isContractFileField(field) === (scope === "attachments")),
  );
  if (!fields.length) return null;
  const keys = new Set(fields.map(field => field.name));
  const visibleContract = { ...contract, inputGroups: undefined, inputs: fields };
  const error = gradioFormError(visibleContract, {
    prompt, dynamicParams: Object.fromEntries(Object.entries(values).filter(([key]) => keys.has(key))),
  }, "options");
  return (
    <div data-contract-fields={scope} className={scope === "attachments"
      ? "flex max-h-[35vh] min-w-0 flex-col gap-3 overflow-y-auto px-4 pt-4"
      : "grid max-h-[60vh] min-w-0 grid-cols-2 gap-x-3 gap-y-5 overflow-y-auto p-1"}>
      {fields
        .map((field) => {
          const label = gradioFieldLabel(field).replace(/\s*\(optional\)\s*$/i, "");
          const value = Object.prototype.hasOwnProperty.call(values, field.name)
            ? values[field.name]
            : field.default;
          return (
            <div key={field.name} className={["file", "files", "gallery"].includes(field.kind) ? "flex min-w-0 flex-col gap-2 text-sm" : "col-span-2 flex min-w-0 flex-col gap-2 text-sm"}>
              {(scope !== "attachments" || !isContractFileField(field) || !!field.choices?.length) && <span>
                {label}
                {field.required ? (
                  <span className="ml-2 text-xs text-destructive">
                    {ko ? "필수" : "Required"}
                  </span>
                ) : null}
              </span>}
              {field.choices?.length ? (
                <AppSelectRoot
                  disabled={disabled}
                  value={value == null ? "" : JSON.stringify(value)}
                  onValueChange={(selected) =>
                    update(
                      field.name,
                      selected === "" ? undefined : JSON.parse(selected),
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
                    {!field.required && (
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
                  description={scope === "attachments" ? <span className="text-xs text-muted-foreground">{label}{field.required && <span className="ml-2 text-destructive">{ko ? "필수" : "Required"}</span>}</span> : undefined}/>
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
                          : Number(e.target.value)
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
      {error && (
        <AppPromptMessage className="col-span-full">
          {gradioFormMessage(error, contract, ko ? "ko" : "en")}
        </AppPromptMessage>
      )}
    </div>
  );
}
