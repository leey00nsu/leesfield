import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/shared/ui/badge";

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
    <section id="errors" className="flex flex-col gap-8 scroll-mt-32">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
          <AlertTriangle className="h-5 w-5 text-primary" />
          {t("title")}
        </h2>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          {t("description")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {errorCards.map((card) => (
          <div
            key={card.status}
            className="rounded-2xl border border-white/5 bg-surface-dark p-5"
          >
            <div className="flex items-center gap-3">
              <Badge variant="muted" size="md" className="px-2.5 py-1 text-gray-300">
                {card.status}
              </Badge>
              <h3 className="text-sm font-bold text-white">
                {t(`cards.${card.key}.title`)}
              </h3>
            </div>
            <p className="mt-3 text-sm text-gray-400">
              {t(`cards.${card.key}.description`)}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/5 bg-black/60 p-6">
        <p className="text-xs font-mono uppercase tracking-wider text-gray-500">
          {t("exampleTitle")}
        </p>
        <pre className="mt-3 overflow-x-auto text-sm text-gray-300">
          {errorResponseSnippet}
        </pre>
      </div>
    </section>
  );
}
