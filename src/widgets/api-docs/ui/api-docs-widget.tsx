import { useTranslations } from "next-intl";
import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import { buildApiSections } from "@/features/api-docs/model/openapi-helpers";
import { ApiDocsSidebar } from "@/widgets/api-docs/ui/api-docs-sidebar";
import { ApiDocsIntroSection } from "@/widgets/api-docs/ui/api-docs-intro-section";
import { ApiDocsOpenApiSection } from "@/widgets/api-docs/ui/api-docs-openapi-section";
import { ApiDocsAuthSection } from "@/widgets/api-docs/ui/api-docs-auth-section";
import { ApiDocsAccessSection } from "@/widgets/api-docs/ui/api-docs-access-section";
import { ApiDocsRequestGuideSection } from "@/widgets/api-docs/ui/api-docs-request-guide-section";
import { ApiDocsErrorSection } from "@/widgets/api-docs/ui/api-docs-error-section";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";
import { externalApiVersion } from "@/shared/api/external-contract";

interface ApiDocsWidgetProps {
  openApiDocument: OpenApiDocument;
}

export function ApiDocsWidget({ openApiDocument }: ApiDocsWidgetProps) {
  const t = useTranslations("apiDocs");
  const tStates = useTranslations("apiDocs.states");
  const apiSections = buildApiSections(openApiDocument);
  const apiVersion = openApiDocument.info.version ?? externalApiVersion;
  const introTitle = t("intro.titleFallback");
  const introDescription = t("intro.descriptionFallback");

  return (
    <div className="border-t border-border bg-background text-foreground">
      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ApiDocsSidebar apiVersion={apiVersion} apiSections={apiSections} />

        <article className="min-w-0 px-5 py-10 sm:px-10 lg:px-12 lg:py-14 xl:px-16">
          <div className="mx-auto flex w-full max-w-[960px] flex-col gap-16 pb-24">
            <ApiDocsIntroSection
              introTitle={introTitle}
              introDescription={introDescription}
              apiVersion={apiVersion}
            />

            <ApiDocsOpenApiSection />

            <ApiDocsAuthSection />

            <ApiDocsAccessSection />

            <ApiDocsRequestGuideSection />

            <ApiDocsErrorSection />

            {apiSections.length ? (
              <ApiDocsEndpointsSection
                apiSections={apiSections}
                openApiDocument={openApiDocument}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {tStates("missingEndpoints")}
              </p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
