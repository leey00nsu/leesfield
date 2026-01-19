import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui/button";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const exampleUrl = apiBaseUrl
  ? `${apiBaseUrl}/v1/models`
  : "<API_BASE_URL>/v1/models";

export function ApiDocsAuthSection() {
  const t = useTranslations("apiDocs.auth");

  return (
    <section id="authentication" className="flex flex-col gap-8 scroll-mt-32">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
          <KeyRound className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <p className="text-gray-400 leading-relaxed">
          {t.rich("description", {
            link: (chunks) => (
              <Link href="/api-key" className="text-primary hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
        <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
            {t("headerAuth")}
          </span>
          <Button
            asChild
            variant="outline"
            className="h-8 rounded-full border-white/10 bg-surface-lighter px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10"
          >
            <Link href="/api-key">{t("viewKey")}</Link>
          </Button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-400">
            {t.rich("includeHeader", {
              header: (chunks) => (
                <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                  {chunks}
                </code>
              ),
            })}
          </p>
          <div className="mt-4 rounded-lg border border-white/5 bg-black/50 p-4 font-mono text-sm text-gray-300">
            <span className="text-accent-purple">curl</span>{" "}
            {exampleUrl} \
            <div className="pl-4 mt-1">
              -H{" "}
              <span className="text-green-400">
                &quot;X-API-Key: lf_live_...&quot;
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="text-xs text-gray-400">
              {t("warning")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
