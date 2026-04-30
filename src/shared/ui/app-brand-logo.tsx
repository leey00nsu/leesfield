import type { ComponentProps } from "react";
import { BrandLogo } from "@/shared/ui/brand-logo";

export function AppBrandLogo(props: ComponentProps<typeof BrandLogo>) {
  return <BrandLogo data-app-brand-logo="" {...props} />;
}
