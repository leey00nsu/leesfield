import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppButton } from "@/shared/ui/app-button";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const exampleUrl = apiBaseUrl
  ? `${apiBaseUrl}/api/external/models`
  : "<API_BASE_URL>/api/external/models";

export function ApiDocsAuthSection() {
  const t = useTranslations("apiDocs.auth");

  return (
    <section id="authentication" className="scroll-mt-32">
      <AppDocsSectionCard
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
          <AppButton asChild variant="brand" size="sm">
            <Link href="/api-key">{t("viewKey")}</Link>
          </AppButton>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <p className="text-sm text-foreground/60">
              {t.rich("includeHeader", {
                header: (chunks) => (
                  <code className="rounded border border-data-accent/20 bg-data-accent/10 px-1.5 py-0.5 font-mono text-data-accent-foreground">
                    {chunks}
                  </code>
                ),
              })}
            </p>
            <div className="mt-4 rounded-xl border border-border bg-background p-4 font-mono text-sm text-foreground/76">
              <span className="text-data-accent-foreground">curl</span>{" "}
              {exampleUrl} \
              <div className="mt-1 pl-4">
                -H{" "}
                <span className="text-foreground/78">
                  &quot;X-API-Key: lf_live_...&quot;
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="text-sm leading-6 text-foreground/58">
              {t("warning")}
            </p>
          </div>
        </div>
      </AppDocsSectionCard>
    </section>
  );
}
