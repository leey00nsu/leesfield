import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";

const errorCards = [
  {
    status: "400",
    key: "badRequest",
  },
  {
    status: "401",
    key: "unauthorized",
  },
  {
    status: "403",
    key: "forbidden",
  },
  {
    status: "500",
    key: "serverError",
  },
];

export function ApiDocsErrorSection() {
  const t = useTranslations("apiDocs.errors");
  const errorResponseSnippet = `{
  "message": "${t("exampleMessage")}",
  "errors": [
    {
      "field": "prompt",
      "messages": ["${t("exampleFieldMessage")}"]
    }
  ]
}`;

  return (
    <section id="errors" className="scroll-mt-32">
      <AppDocsSectionCard
        eyebrow={<AppBadge variant="outline">ERROR REFERENCE</AppBadge>}
        title={
          <span className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-primary" />
            {t("title")}
          </span>
        }
        description={t("description")}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {errorCards.map((card) => (
            <div
              key={card.status}
              className="rounded-2xl border border-white/8 bg-black/18 p-5"
            >
              <div className="flex items-center gap-3">
                <AppBadge variant="muted" size="md" className="px-2.5 py-1 text-white/68">
                  {card.status}
                </AppBadge>
                <h3 className="text-sm font-bold text-white">
                  {t(`cards.${card.key}.title`)}
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">
                {t(`cards.${card.key}.description`)}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/58 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/38">
            {t("exampleTitle")}
          </p>
          <pre className="mt-3 overflow-x-auto text-sm text-white/76">
            {errorResponseSnippet}
          </pre>
        </div>
      </AppDocsSectionCard>
    </section>
  );
}
