"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Label } from "@/shared/ui/label";
import {
  AppSelectContent,
  AppSelectItem,
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
} from "@/shared/ui/app-select";
import {
  type AppSelectTriggerSize,
  type AppSelectTriggerSurface,
} from "@/shared/ui/app-select";
import { Textarea } from "@/shared/ui/textarea";
export { AppInput } from "@/shared/ui/app-input";

export function AppFormField({ className, ...props }: ComponentProps<"div">) {
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
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}

type AppTextareaSurface = "default" | "transparent";
type AppTextareaProps = ComponentProps<typeof Textarea> & {
  surface?: AppTextareaSurface;
};

const appTextareaSurfaceClassNames: Record<AppTextareaSurface, string> = {
  default:
    "rounded-md border-input bg-background text-sm text-foreground focus-visible:border-ring",
  transparent:
    "border-none bg-transparent dark:bg-transparent shadow-none px-5 pb-5 pt-5 text-base text-white placeholder:text-gray-500 focus-visible:ring-0",
};

export function AppTextarea({
  className,
  surface = "default",
  ...props
}: AppTextareaProps) {
  return (
    <Textarea
      data-app-textarea=""
      data-surface={surface}
      className={cn("w-full", appTextareaSurfaceClassNames[surface], className)}
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
  surface?: AppSelectTriggerSurface;
  triggerSize?: AppSelectTriggerSize;
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
  surface,
  triggerSize,
}: AppSelectProps) {
  return (
    <AppSelectRoot
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <AppSelectTrigger
        id={id}
        data-app-select=""
        aria-label={ariaLabel}
        surface={surface}
        triggerSize={triggerSize}
        className={className}
      >
        <AppSelectValue placeholder={placeholder} />
      </AppSelectTrigger>
      <AppSelectContent data-app-select-content="">
        {options.map((option) => (
          <AppSelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="text-sm"
          >
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelectRoot>
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
        "flex items-center gap-2 text-sm text-muted-foreground",
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
