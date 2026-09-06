"use client";
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
} from "react";
import { Loader2 } from "lucide-react";
import {
  Button as BrandButton,
  buttonVariants,
} from "@/shared/ui/brand/button/button";
type Props = Omit<ComponentProps<typeof BrandButton>, "children"> & {
  children?: React.ReactNode;
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
};
export function Button({
  asChild = false,
  isLoading = false,
  loadingText,
  children,
  disabled,
  ...props
}: Props) {
  const child = asChild ? Children.only(children) : null;
  const loading = isLoading ? (
    <>
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {loadingText ?? children}
    </>
  ) : (
    children
  );
  if (asChild && isValidElement(child))
    return (
      <BrandButton
        {...props}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        nativeButton={false}
        role={(child.props as { href?: string }).href ? "link" : props.role}
        render={child as ReactElement}
      />
    );
  return (
    <BrandButton
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {loading}
    </BrandButton>
  );
}
export { buttonVariants };
