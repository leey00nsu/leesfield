"use client";
import type { ComponentProps } from "react";
import { usePatchAssetMetadata } from "../hook/use-media-assets";
import { MediaAssetCard } from "./media-asset-card";

export function ManagedMediaAssetCard({ writable = true, onError, ...props }: Omit<ComponentProps<typeof MediaAssetCard>, "onStar" | "busy"> & { writable?: boolean; onError: (error: unknown) => void }) {
  const patch = usePatchAssetMetadata();
  const { asset } = props;
  return <MediaAssetCard {...props} busy={patch.isPending} onStar={writable ? async () => {
    try { await patch.mutateAsync({ id: asset.id, expectedVersion: asset.version, starred: !asset.starred }); }
    catch (error) { onError(error); }
  } : undefined} />;
}
