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
import type { GradioContract } from "@/shared/model-catalog/gradio-contract";
import { type JsonValue } from "@/shared/model-catalog/gradio-contract";

export function GradioContractFields({
  contract,
  values,
  prompt,
  onChange,
}: {
  contract: GradioContract;
  values: Record<string, unknown>;
  prompt: string;
  onChange: (values: Record<string, JsonValue>) => void;
}) {
  const ko = useLocale() === "ko";

  const update = (name: string, value: JsonValue | undefined) => {
    const next = { ...values };
    if (value === undefined) delete next[name];
    else next[name] = value;
    onChange(next as Record<string, JsonValue>);
  };
  const error = gradioFormError(contract, { prompt, dynamicParams: values }, "options");
  return (
    <div className="grid max-h-[60vh] min-w-0 grid-cols-2 gap-x-3 gap-y-5 overflow-y-auto p-1">
      {contract.inputs
        .filter((f) => !f.canonical && !f.hidden)
        .map((field) => {
          const label = gradioFieldLabel(field).replace(/\s*\(optional\)\s*$/i, "");
          const value = Object.prototype.hasOwnProperty.call(values, field.name)
            ? values[field.name]
            : field.default;
          return (
            <div key={field.name} className={["file", "files", "gallery"].includes(field.kind) ? "flex min-w-0 flex-col gap-2 text-sm" : "col-span-2 flex min-w-0 flex-col gap-2 text-sm"}>
              <span>
                {label}
                {field.required ? (
                  <span className="ml-2 text-xs text-destructive">
                    {ko ? "필수" : "Required"}
                  </span>
                ) : null}
              </span>
              {field.choices?.length ? (
                <AppSelectRoot
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
                  aria-label={label}
                  aria-required={field.required}
                  checked={value === true}
                  onCheckedChange={(checked) => update(field.name, checked)}
                />
              ) : ["file", "files", "gallery"].includes(field.kind) ? (
                <GradioFileField label={label} field={field} value={value} onChange={(value) => update(field.name, value)} />
              ) : field.kind === "json" ? (
                <AppTextarea
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
                  aria-label={label}
                  aria-required={field.required}
                  value={value == null ? "" : String(value)}
                  onChange={(e) => update(field.name, e.target.value)}
                />
              ) : (
                <AppInput
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
        <p role="alert" className="col-span-2 text-xs text-destructive">
          {gradioFormMessage(error, contract, ko ? "ko" : "en")}
        </p>
      )}
    </div>
  );
}
