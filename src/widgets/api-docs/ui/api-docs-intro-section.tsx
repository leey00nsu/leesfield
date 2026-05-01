import { BookOpen, ShieldCheck, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";

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
    <section id="introduction" className="scroll-mt-32">
      <AppDocsSectionCard
        eyebrow={<AppBadge variant="primary">{introTitle}</AppBadge>}
        title={
          <>
            <span className="text-white">{tTitle("leading")}</span>{" "}
            <span className="text-primary">{tTitle("accent")}</span>
          </>
        }
        description={introDescription}
        action={
          <AppBadge variant="muted" className="px-2.5 py-1">
            {apiVersion}
          </AppBadge>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {highlightCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className="rounded-2xl border border-white/8 bg-black/16 p-5 transition-colors hover:border-primary/20 hover:bg-black/22"
              >
                <div className="mb-3 text-primary/85">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {tHighlights(`${card.key}.title`)}
                </h3>
                <p className="mt-2 text-sm text-white/50">
                  {tHighlights(`${card.key}.description`)}
                </p>
              </div>
            );
          })}
        </div>
      </AppDocsSectionCard>
    </section>
  );
}
