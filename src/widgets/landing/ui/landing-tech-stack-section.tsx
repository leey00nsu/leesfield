import { Code2, Database, Palette, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";

export function LandingTechStackSection() {
  const t = useTranslations("landing.techStack");
  const items = [
    { key: "nextjs", icon: Terminal },
    { key: "typescript", icon: Code2 },
    { key: "prisma", icon: Database },
    { key: "tailwind", icon: Palette },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold uppercase tracking-widest text-white">
          {t("title")}
        </h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="group flex flex-col items-center justify-center rounded-xl border border-white/5 bg-surface-dark p-6 transition-all hover:border-white/20"
            >
              <Icon className="mb-3 h-10 w-10 text-white transition-colors group-hover:text-primary" />
              <span className="font-mono font-bold tracking-wider text-white">
                {t(`items.${item.key}.label`)}
              </span>
              <span className="mt-1 text-xs text-gray-500">
                {t(`items.${item.key}.description`)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
