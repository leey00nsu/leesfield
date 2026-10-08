"use client";

import { Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { ApiDocsSection } from "./api-docs-section";

export function ApiDocsOpenApiSection() {
  const t = useTranslations("apiDocs.specification");

  return (
    <section id="openapi" className="scroll-mt-24">
      <ApiDocsSection title={t("title")} description={t("description")}>
        <div className="space-y-4">
          <p className="text-sm leading-7 text-muted-foreground">{t("access")}</p>
          <div className="flex flex-wrap gap-3">
            <AppButton asChild variant="surface" size="sm">
              <a href="/api/openapi" target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden className="size-3.5" />
                {t("view")}
              </a>
            </AppButton>
            <AppButton asChild variant="surface" size="sm">
              <a href="/api/openapi" download="openapi.json">
                <Download aria-hidden className="size-3.5" />
                {t("download")}
              </a>
            </AppButton>
          </div>
        </div>
      </ApiDocsSection>
    </section>
  );
}
