"use client";
import type { ReactNode } from "react";
import {
  AppSelectRoot,
  AppSelectTrigger,
  AppSelectValue,
  AppSelectContent,
  AppSelectItem,
} from "./app-select";
export function AppChoiceSelect({
  value,
  options,
  onValueChange,
  disabled,
  label,
}: {
  value: string;
  options: { value: string; label: ReactNode }[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <AppSelectRoot
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
    >
      <AppSelectTrigger
        triggerSize="sm"
        aria-label={label}
        className="nodrag w-full normal-case tracking-normal"
      >
        <AppSelectValue />
      </AppSelectTrigger>
      <AppSelectContent className="z-[10002]">
        {options.map((option) => (
          <AppSelectItem key={option.value} value={option.value}>
            {option.label}
          </AppSelectItem>
        ))}
      </AppSelectContent>
    </AppSelectRoot>
  );
}
