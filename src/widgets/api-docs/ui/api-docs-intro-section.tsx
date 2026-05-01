import { useTranslations } from "next-intl";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";

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
  const tSidebar = useTranslations("apiDocs.sidebar");
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
    "<API_BASE_URL>";

  return (
    <section id="introduction" className="scroll-mt-32">
      <AppDocsSectionCard
        eyebrow={<AppBadge variant="primary">API</AppBadge>}
        title={introTitle}
        description={introDescription}
        action={
          <AppBadge variant="muted" className="px-2.5 py-1">
            {apiVersion}
          </AppBadge>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-black/18 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-white/36">
              Base URL
            </p>
            <p className="mt-2 break-all font-mono text-sm text-white/78">
              {apiBaseUrl}
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/18 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-white/36">
              {tSidebar("general")}
            </p>
            <p className="mt-2 text-sm text-white/70">
              {tSidebar("nav.authentication")}
            </p>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/18 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-white/36">
              Version
            </p>
            <p className="mt-2 text-sm text-white/70">{apiVersion}</p>
          </div>
        </div>
      </AppDocsSectionCard>
    </section>
  );
}
