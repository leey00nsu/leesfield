import { BookOpen, ShieldCheck, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

const highlightCards = [
  { key: "latency", icon: Zap },
  { key: "security", icon: ShieldCheck },
  { key: "restful", icon: BookOpen },
];

interface ApiDocsIntroSectionProps {
  introTitle: string;
  introDescription: string;
  apiVersion: string;
}

export function ApiDocsIntroSection({
  introTitle,
  introDescription,
  apiVersion,
}: ApiDocsIntroSectionProps) {
  const tTitle = useTranslations("apiDocs.title");
  const tHighlights = useTranslations("apiDocs.intro.highlights");

  return (
    <section id="introduction" className="flex flex-col gap-6 scroll-mt-32">
      <div>
        <h2 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
          <span className="text-white">{tTitle("leading")}</span>{" "}
          <span className="text-primary">{tTitle("accent")}</span>
        </h2>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-gray-500">
          {introTitle} · {apiVersion}
        </p>
        <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-3xl">
          {introDescription}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {highlightCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="rounded-2xl border border-white/5 bg-surface-dark p-5 transition-colors hover:border-primary/30"
            >
              <div className="mb-3 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                {tHighlights(`${card.key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {tHighlights(`${card.key}.description`)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
