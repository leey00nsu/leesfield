"use client";
import { Children, type ReactElement, type ComponentProps } from "react";
import * as B from "@/shared/ui/brand/dropdown-menu/dropdown-menu";
export const DropdownMenu = B.DropdownMenu,
  DropdownMenuContent = B.DropdownMenuContent,
  DropdownMenuGroup = B.DropdownMenuGroup,
  DropdownMenuPortal = B.DropdownMenuPortal,
  DropdownMenuSeparator = B.DropdownMenuSeparator,
  DropdownMenuShortcut = B.DropdownMenuShortcut,
  DropdownMenuSub = B.DropdownMenuSub,
  DropdownMenuSubContent = B.DropdownMenuSubContent,
  DropdownMenuSubTrigger = B.DropdownMenuSubTrigger,
  DropdownMenuCheckboxItem = B.DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup = B.DropdownMenuRadioGroup,
  DropdownMenuRadioItem = B.DropdownMenuRadioItem;
export function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: ComponentProps<typeof B.DropdownMenuTrigger> & { asChild?: boolean }) {
  return (
    <B.DropdownMenuTrigger
      {...props}
      render={asChild ? (Children.only(children) as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </B.DropdownMenuTrigger>
  );
}
export function DropdownMenuItem({
  asChild,
  children,
  ...props
}: ComponentProps<typeof B.DropdownMenuItem> & { asChild?: boolean }) {
  return (
    <B.DropdownMenuItem
      {...props}
      nativeButton={false}
      render={asChild ? (Children.only(children) as ReactElement) : undefined}
    >
      {asChild ? undefined : children}
    </B.DropdownMenuItem>
  );
}
export function DropdownMenuLabel(
  props: ComponentProps<typeof B.DropdownMenuLabel>,
) {
  return (
    <B.DropdownMenuGroup>
      <B.DropdownMenuLabel {...props} />
    </B.DropdownMenuGroup>
  );
}
