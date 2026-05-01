import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const exampleUrl = apiBaseUrl
  ? `${apiBaseUrl}/v1/models`
  : "<API_BASE_URL>/v1/models";

export function ApiDocsAuthSection() {
  const t = useTranslations("apiDocs.auth");

  return (
    <section id="authentication" className="scroll-mt-32">
      <AppDocsSectionCard
        eyebrow={<AppBadge variant="outline">API SECURITY</AppBadge>}
        title={
          <span className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-primary" />
            {t("title")}
          </span>
        }
        description={t.rich("description", {
          link: (chunks) => (
            <Link href="/api-key" className="text-primary hover:underline">
              {chunks}
            </Link>
          ),
        })}
        action={
          <AppButton
            asChild
            variant="surface"
            size="sm"
            className="rounded-full border-white/10 px-3 text-[11px] font-bold uppercase tracking-wider"
          >
            <Link href="/api-key">{t("viewKey")}</Link>
          </AppButton>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/8 bg-black/18 p-5">
            <p className="text-sm text-white/60">
              {t.rich("includeHeader", {
                header: (chunks) => (
                  <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                    {chunks}
                  </code>
                ),
              })}
            </p>
            <div className="mt-4 rounded-xl border border-white/8 bg-black/52 p-4 font-mono text-sm text-white/76">
              <span className="text-primary">curl</span> {exampleUrl} \
              <div className="mt-1 pl-4">
                -H{" "}
                <span className="text-white/78">
                  &quot;X-API-Key: lf_live_...&quot;
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="text-sm leading-6 text-white/58">
              {t("warning")}
            </p>
          </div>
        </div>
      </AppDocsSectionCard>
    </section>
  );
}
