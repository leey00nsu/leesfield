import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { ProductPageIntro, type ProductPageIntroProps } from "@/shared/ui/brand/product-page-intro/product-page-intro";

type AppPageShellProps = ComponentProps<"div"> & {
  beforeIntro?: React.ReactNode;
  intro?: Pick<ProductPageIntroProps, "title" | "description" | "aside">;
};
export function AppPageShell({ className, intro, beforeIntro, children, ...props }: AppPageShellProps) {
  return (
    <div data-app-page-shell="" className={cn("mx-auto flex w-full max-w-[1440px] flex-col gap-6 pt-6 pb-16 sm:pt-8", className)} {...props}>
      {beforeIntro}
      {intro && <ProductPageIntro eyebrow={null} {...intro} className="[&>div>p:first-child]:hidden [&_h1]:mt-0 justify-center text-center [&>div]:flex [&>div]:flex-col [&>div]:items-center" />}
      {children}
    </div>
  );
}
