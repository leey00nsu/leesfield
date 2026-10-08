import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { ApiDocsSection } from "@/widgets/api-docs/ui/api-docs-section";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const exampleUrl = apiBaseUrl
  ? `${apiBaseUrl}/api/external/models`
  : "<API_BASE_URL>/api/external/models";

export function ApiDocsAuthSection() {
  const t = useTranslations("apiDocs.auth");

  return (
    <section id="authentication" className="scroll-mt-24">
      <ApiDocsSection
        title={
          <span className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-data-accent-foreground" />
            {t("title")}
          </span>
        }
        description={t.rich("description", {
          link: (chunks) => (
            <Link
              href="/api-key"
              className="text-data-accent-foreground hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
        action={
          <AppButton asChild variant="surface" size="sm">
            <Link href="/api-key">{t("viewKey")}</Link>
          </AppButton>
        }
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t.rich("includeHeader", {
                header: (chunks) => (
                  <code className="rounded border border-data-accent/20 bg-data-accent/10 px-1.5 py-0.5 font-mono text-data-accent-foreground">
                    {chunks}
                  </code>
                ),
              })}
            </p>
            <div className="mt-4 overflow-x-auto rounded-md border border-border bg-muted/30 p-4 font-mono text-sm text-foreground">
              <span className="text-data-accent-foreground">curl</span>{" "}
              {exampleUrl} \
              <div className="mt-1 pl-4">
                -H{" "}
                <span className="text-foreground/78">
                  &quot;X-API-Key: lf_live_...&quot;
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {t("bearer")}
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/30 p-4 text-sm">
              {`curl "${exampleUrl}" -H "Authorization: Bearer lf_live_..."`}
            </pre>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {t("precedence")}
            </p>
          </div>
          <div className="flex items-start gap-3 border-l-2 border-destructive/60 pl-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="text-sm leading-6 text-muted-foreground">
              {t("warning")}
            </p>
          </div>
        </div>
      </ApiDocsSection>
    </section>
  );
}
