import { AppPageShell } from "@/shared/ui/app-page-shell";
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
    <AppPageShell className="px-6 sm:px-10">
      <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start">
        <ApiDocsSidebar apiVersion={apiVersion} apiSections={apiSections} />

        <div className="min-w-0 flex-1">
          <div className="flex w-full flex-col gap-8 pb-24">
            <ApiDocsIntroSection
              introTitle={introTitle}
              introDescription={introDescription}
              apiVersion={apiVersion}
            />

            <ApiDocsAuthSection />

            <ApiDocsErrorSection />

            {apiSections.length ? (
              <ApiDocsEndpointsSection
                apiSections={apiSections}
                apiVersion={apiVersion}
                openApiDocument={openApiDocument}
              />
            ) : (
              <div className="rounded-2xl border border-border bg-card px-5 py-5 text-sm text-foreground/80">
                {tStates("missingEndpoints")}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppPageShell>
  );
}
