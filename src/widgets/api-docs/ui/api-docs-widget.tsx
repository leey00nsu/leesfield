import { useTranslations } from "next-intl";
import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import { buildApiSections } from "@/features/api-docs/model/openapi-helpers";
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
  const tStates = useTranslations("apiDocs.states");
  const apiSections = buildApiSections(openApiDocument);
  const apiVersion = openApiDocument.info.version ?? "v1";
  const introTitle = t("intro.titleFallback");
  const introDescription = t("intro.descriptionFallback");

  return (
    <div className="pb-20">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-6 pt-6 sm:px-10 lg:flex-row lg:items-start">
        <ApiDocsSidebar apiVersion={apiVersion} apiSections={apiSections} />

        <div className="min-w-0 flex-1">
          <div className="flex w-full flex-col gap-8 pb-24">
            <ApiDocsIntroSection
              introTitle={introTitle}
              introDescription={introDescription}
              apiVersion={apiVersion}
            />

            <div className="h-px bg-white/10" />

            <ApiDocsAuthSection />

            <div className="h-px bg-white/10" />

            <ApiDocsErrorSection />

            <div className="h-px bg-white/10" />

            {apiSections.length ? (
              <ApiDocsEndpointsSection
                apiSections={apiSections}
                apiVersion={apiVersion}
                openApiDocument={openApiDocument}
              />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0b0d0e] px-5 py-5 text-sm text-gray-300">
                {tStates("missingEndpoints")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
