"use client";

import { useState, type ImgHTMLAttributes } from "react";
import { imageUrlsFor } from "./image-variants";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  asset: {url: string; imageVariants?: unknown};
  purpose?: "list" | "display";
};
export function VariantImage({asset, purpose = "display", ...props}: Props) {
  const urls = imageUrlsFor(asset, purpose);
  return <CandidateImage key={urls.join("|")} {...props} urls={urls} />;
}
function CandidateImage({urls, onError, alt, ...props}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {urls: string[]}) {
  const [index, setIndex] = useState(0);
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt ?? ""} src={urls[index]} onError={event => {
    if (index + 1 < urls.length) setIndex(index + 1);
    else onError?.(event);
  }} />;
}
