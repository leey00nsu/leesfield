"use client";

import type { AppPreviewImageProps } from "@/shared/ui/app-preview-image";
import { AppPreviewImage } from "@/shared/ui/app-preview-image";
import { imageUrlsFor } from "./image-variants";

type Props = Omit<AppPreviewImageProps, "src" | "sources"> & {
  asset: {url: string; imageVariants?: unknown};
  purpose?: "list" | "display";
};
export function VariantImage({asset, purpose = "display", ...props}: Props) {
  const urls = imageUrlsFor(asset, purpose);
  return <AppPreviewImage {...props} sources={urls} />;
}
