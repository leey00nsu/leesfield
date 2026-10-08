import { useTranslations } from "next-intl";
import {
  generationBodyLimitBytes,
  bodyReadTimeoutMs,
  maxExternalFiles,
  maxExternalFileBytes,
  maxExternalTotalFileBytes,
} from "@/shared/api/request-limits";
import { ApiDocsSection } from "./api-docs-section";

export function ApiDocsRequestGuideSection() {
  const t = useTranslations("apiDocs.requestGuide");
  const mib = (bytes: number) => `${bytes / 1024 / 1024} MiB`;
  const limits = [
    { key: "body", value: mib(generationBodyLimitBytes) },
    { key: "files", value: t("fileCount", { count: maxExternalFiles }) },
    { key: "file", value: mib(maxExternalFileBytes) },
    { key: "totalFiles", value: mib(maxExternalTotalFileBytes) },
    { key: "timeout", value: t("seconds", { count: bodyReadTimeoutMs / 1000 }) },
    { key: "presets", value: "96 KiB" },
    { key: "models", value: "1 MiB" },
    { key: "hf", value: "8 MiB" },
  ];

  return (
    <section id="request-options" className="scroll-mt-24">
      <ApiDocsSection title={t("title")} description={t("description")}>
        <div className="max-w-3xl space-y-3 text-sm leading-7 text-muted-foreground">
          <h3 className="text-base font-semibold text-foreground">{t("retryTitle")}</h3>
          <p>{t("retry")}</p>
        </div>
        <div className="max-w-3xl space-y-3 text-sm leading-7 text-muted-foreground">
          <h3 className="text-base font-semibold text-foreground">{t("presetTitle")}</h3>
          <p>{t("preset")}</p>
          <p>{t("presetRef")}</p>
        </div>
        <div className="space-y-4">
          <h3 className="text-base font-semibold">{t("limitsTitle")}</h3>
          <dl className="divide-y divide-border border-y border-border">
            {limits.map(({ key, value }) => (
              <div key={key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-6">
                <dt className="text-sm text-muted-foreground">{t(key)}</dt>
                <dd className="font-mono text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{t("fileRules")}</p>
        </div>
      </ApiDocsSection>
    </section>
  );
}
