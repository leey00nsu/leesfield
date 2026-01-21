"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/shared/ui/page-header";
import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import { buildApiSections } from "@/features/api-docs/model/openapi-helpers";
import {
  fallbackEndpointItems,
  generalNavItems,
  getEndpointIcon,
  tagIdMap,
} from "@/widgets/api-docs/lib/api-docs-metadata";
import { useApiDocsNavigation } from "@/widgets/api-docs/hook/use-api-docs-navigation";
import { ApiDocsSidebar } from "@/widgets/api-docs/ui/api-docs-sidebar";
import { ApiDocsIntroSection } from "@/widgets/api-docs/ui/api-docs-intro-section";
import { ApiDocsAuthSection } from "@/widgets/api-docs/ui/api-docs-auth-section";
import { ApiDocsErrorSection } from "@/widgets/api-docs/ui/api-docs-error-section";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";

interface ApiDocsWidgetProps {
  openApiDocument: OpenApiDocument;
}

export function ApiDocsWidget({ openApiDocument }: ApiDocsWidgetProps) {
  const t = useTranslations("apiDocs");
  const tNav = useTranslations("apiDocs.sidebar.nav");
  const tStates = useTranslations("apiDocs.states");
  const apiSections = useMemo(
    () => buildApiSections(openApiDocument),
    [openApiDocument],
  );
  const generalItems = useMemo(
    () =>
      generalNavItems.map((item) => ({
        ...item,
        label: tNav(item.id),
      })),
    [tNav],
  );
  const endpointNavItems = useMemo(() => {
    if (!apiSections.length) {
      return fallbackEndpointItems.map((item) => ({
        ...item,
        label: tNav(item.id),
      }));
    }
    return apiSections.map((section) => ({
      id: section.id,
      label: tagIdMap[section.title]
        ? tNav(tagIdMap[section.title])
        : section.title,
      icon: getEndpointIcon(section),
    }));
  }, [apiSections, tNav]);
  const sectionIds = useMemo(
    () => [...generalItems, ...endpointNavItems].map((item) => item.id),
    [generalItems, endpointNavItems],
  );
  const { activeSectionId } = useApiDocsNavigation({ sectionIds });
  const apiVersion = openApiDocument.info.version ?? "v1";
  const introTitle = t("intro.titleFallback");
  const introDescription = t("intro.descriptionFallback");

  return (
    <div className="flex flex-col gap-8 pb-20">
      <PageHeader
        title={
          <>
            <span className="text-white">{t("title.leading")}</span>{" "}
            <span className="text-primary">{t("title.accent")}</span>
          </>
        }
        subtitle={t("subtitle")}
        sticky={false}
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 sm:px-10 lg:flex-row">
        <ApiDocsSidebar
          apiVersion={apiVersion}
          generalItems={generalItems}
          endpointItems={endpointNavItems}
          activeSectionId={activeSectionId}
        />

        <div className="flex-1 min-w-0">
          <div className="flex w-full flex-col gap-16 pb-24">
            <ApiDocsIntroSection
              introTitle={introTitle}
              introDescription={introDescription}
              apiVersion={apiVersion}
            />

            <div className="h-px bg-linear-to-r from-white/10 to-transparent" />

            <ApiDocsAuthSection />

            <div className="h-px bg-linear-to-r from-white/10 to-transparent" />

            <ApiDocsErrorSection />

            <div className="h-px bg-linear-to-r from-white/10 to-transparent" />

            {apiSections.length ? (
              <ApiDocsEndpointsSection
                apiSections={apiSections}
                apiVersion={apiVersion}
                openApiDocument={openApiDocument}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-surface-dark/80 px-6 py-6 text-sm text-gray-300">
                {tStates("missingEndpoints")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
