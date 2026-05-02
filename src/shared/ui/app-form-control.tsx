"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
export { AppInput } from "@/shared/ui/app-input";

export function AppFormField({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-app-form-field=""
      className={cn("space-y-2", className)}
      {...props}
    />
  );
}

export function AppLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return (
    <Label
      data-app-label=""
      className={cn(
        "text-xs font-mono uppercase tracking-widest text-gray-500",
        className,
      )}
      {...props}
    />
  );
}

export function AppTextarea({
  className,
  ...props
}: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      data-app-textarea=""
      className={cn(
        "w-full rounded-xl border-white/10 bg-black/40 px-4 py-3 font-mono text-xs text-white focus-visible:border-primary",
        className,
      )}
      {...props}
    />
  );
}

type AppSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function AppSelect({
  id,
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder,
  disabled,
  className,
}: AppSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        data-app-select=""
        aria-label={ariaLabel}
        className={cn(
          "h-11 w-full rounded-xl border-white/10 bg-surface-lighter px-3 text-sm font-medium text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        data-app-select-content=""
        className="border-white/10 bg-[#0b0d0e] text-white"
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="text-sm"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type AppCheckboxProps = Omit<ComponentProps<"input">, "type"> & {
  label: string;
  wrapperClassName?: string;
};

export function AppCheckbox({
  label,
  className,
  wrapperClassName,
  ...props
}: AppCheckboxProps) {
  return (
    <label
      data-app-checkbox=""
      className={cn(
        "flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-gray-400",
        wrapperClassName,
      )}
    >
      <input
        type="checkbox"
        className={cn("h-4 w-4 accent-primary", className)}
        {...props}
      />
      {label}
    </label>
  );
}
