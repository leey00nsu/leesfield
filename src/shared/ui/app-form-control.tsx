"use client";

import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

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

export function AppInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      data-app-input=""
      className={cn(
        "h-11 w-full rounded-xl border-white/10 bg-black/40 px-4 text-sm text-white focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-60",
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

export function AppSelectNative({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      data-app-select-native=""
      className={cn(
        "h-11 w-full rounded-xl border border-white/10 bg-surface-lighter px-3 text-sm text-white focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
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
