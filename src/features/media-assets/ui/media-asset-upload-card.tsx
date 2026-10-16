"use client";
import { useLocale, useTranslations } from "next-intl";
import { mediaUploadErrorMessage } from "@/shared/api/reference-file-upload";
import { Upload } from "lucide-react";
import type { LibraryUpload } from "../hook/use-asset-library-uploads";
import { AppButton } from "@/shared/ui/app-button";
import { GenerationPending } from "@/shared/ui/generation-canvas";
import { appMediaGalleryTileClassName } from "@/shared/ui/app-media-gallery";
import { cn } from "@/shared/lib/utils";

export function MediaAssetUploadCard({ upload, onCancel, onRetry, onRemove }: {
  upload: LibraryUpload; onCancel: () => void; onRetry: () => void; onRemove: () => void;
}) {
  const ko = useLocale() === "ko";
  const t = useTranslations("assets");
  const pending = upload.status === "uploading";
  return <article aria-label={upload.file.name} className={cn("relative overflow-hidden bg-card", appMediaGalleryTileClassName)}>
    {pending ? <GenerationPending status="uploading" /> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
      <Upload className="size-6" aria-hidden="true" />
      <p role="status">{upload.status === "failed" && upload.error ? mediaUploadErrorMessage(upload.error, ko) : t(upload.status === "failed" ? "uploadFailed" : "uploadCancelled")}</p>
    </div>}
    <div className="absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-black/90 to-transparent px-3 pb-3 pt-8">
      <p className="truncate text-sm text-white">{upload.file.name}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {pending ? <AppButton size="sm" variant="surface" onClick={onCancel}>{t("cancel")}</AppButton> : <AppButton size="sm" variant="surface" onClick={onRetry}>{t("retry")}</AppButton>}
        <AppButton size="sm" variant="ghost" onClick={onRemove}>{t("remove")}</AppButton>
      </div>
    </div>
  </article>;
}
