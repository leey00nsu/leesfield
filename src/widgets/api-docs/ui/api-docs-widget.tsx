"use client";

import { useMemo } from "react";
import { PageHeader } from "@/shared/ui/page-header";
import { useOpenApiDocument } from "@/features/api-docs/model/use-openapi-document";
import {
  buildApiSections,
} from "@/features/api-docs/model/openapi-helpers";
import {
  fallbackEndpointItems,
  generalNavItems,
  getEndpointIcon,
  tagLabelMap,
} from "@/widgets/api-docs/lib/api-docs-metadata";
import { useApiDocsNavigation } from "@/widgets/api-docs/model/use-api-docs-navigation";
import { ApiDocsSidebar } from "@/widgets/api-docs/ui/api-docs-sidebar";
import { ApiDocsIntroSection } from "@/widgets/api-docs/ui/api-docs-intro-section";
import { ApiDocsAuthSection } from "@/widgets/api-docs/ui/api-docs-auth-section";
import { ApiDocsErrorSection } from "@/widgets/api-docs/ui/api-docs-error-section";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";

export function ApiDocsWidget() {
  const { document: openApiDocument, isLoading, error } = useOpenApiDocument();
  const apiSections = useMemo(
    () => (openApiDocument ? buildApiSections(openApiDocument) : []),
    [openApiDocument],
  );
  const endpointNavItems = useMemo(() => {
    if (!apiSections.length) return fallbackEndpointItems;
    return apiSections.map((section) => ({
      id: section.id,
      label: tagLabelMap[section.title] ?? section.title,
      icon: getEndpointIcon(section),
    }));
  }, [apiSections]);
  const sectionIds = useMemo(
    () => [...generalNavItems, ...endpointNavItems].map((item) => item.id),
    [endpointNavItems],
  );
  const { activeSectionId } = useApiDocsNavigation({ sectionIds });

  const apiVersion = openApiDocument?.info.version ?? "v1";
  const introTitle = openApiDocument?.info.title ?? "leesfield API";
  const introDescription =
    openApiDocument?.info.description ??
    "leesfield 외부 REST API 문서입니다. 이미지/비디오 생성과 모델 조회를 제공합니다.";

  return (
    <div className="flex flex-col gap-8 pb-20">
      <PageHeader
        title={
          <>
            <span className="text-white">API</span>{" "}
            <span className="text-primary">문서</span>
          </>
        }
        subtitle="REST API 레퍼런스"
        sticky={false}
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 sm:px-10 lg:flex-row">
        <ApiDocsSidebar
          apiVersion={apiVersion}
          generalItems={generalNavItems}
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

            {isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-surface-dark/80 px-6 py-4 text-sm text-gray-300">
                OpenAPI 스키마를 불러오는 중입니다.
              </div>
            ) : null}
            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {apiSections.length ? (
              <ApiDocsEndpointsSection
                apiSections={apiSections}
                apiVersion={apiVersion}
                openApiDocument={openApiDocument}
              />
            ) : !isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-surface-dark/80 px-6 py-6 text-sm text-gray-300">
                OpenAPI 스키마를 불러오지 못해 엔드포인트 정보를 표시할 수 없습니다.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
