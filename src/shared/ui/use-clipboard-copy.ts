"use client";

import { useTranslations } from "next-intl";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { appToast } from "@/shared/ui/app-toast";

type CopyOptions = {
  successMessage?: string;
  errorMessage?: string;
  isCurrent?: () => boolean;
};

/** Keep copy feedback out of form state; late one-time key results must stay silent. */
export function useClipboardCopy() {
  const t = useTranslations("common.actions");
  return async (value: string, options: CopyOptions = {}): Promise<boolean> => {
    if (!value.trim()) return false;
    let copied = false;
    try {
      copied = await copyTextToClipboard(value);
    } catch {
      // Clipboard errors can contain sensitive input; never log their payload.
    }
    if (options.isCurrent && !options.isCurrent()) return false;
    if (copied) appToast.copied(options.successMessage ?? t("copied"));
    else appToast.error(options.errorMessage ?? t("copyFailed"));
    return copied;
  };
}
