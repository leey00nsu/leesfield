"use client";
import {
  Children,
  isValidElement,
  type ReactNode,
  type ComponentProps,
} from "react";
function optionsFromChildren(
  children: ReactNode,
): { value: string; label: ReactNode }[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child))
      return [];
    if (child.type === B.SelectItem && typeof child.props.value === "string")
      return [{ value: child.props.value, label: child.props.children }];
    return optionsFromChildren(child.props.children);
  });
}
import * as B from "@/shared/ui/brand/select/select";
type RootProps = ComponentProps<typeof B.Select<string>>;
export function Select({
  onValueChange,
  ...props
}: Omit<RootProps, "onValueChange"> & {
  onValueChange?: (value: string) => void;
}) {
  return (
    <B.Select<string>
      items={optionsFromChildren(props.children)}
      {...props}
      onValueChange={(value) => {
        if (value !== null) onValueChange?.(value);
      }}
    />
  );
}
export const SelectGroup = B.SelectGroup,
  SelectValue = B.SelectValue,
  SelectTrigger = B.SelectTrigger,
  SelectItem = B.SelectItem,
  SelectLabel = B.SelectLabel,
  SelectSeparator = B.SelectSeparator,
  SelectScrollUpButton = B.SelectScrollUpButton,
  SelectScrollDownButton = B.SelectScrollDownButton;
export function SelectContent({
  position,
  ...props
}: ComponentProps<typeof B.SelectContent> & {
  position?: "popper" | "item-aligned";
}) {
  return (
    <B.SelectContent alignItemWithTrigger={position !== "popper"} {...props} />
  );
}
