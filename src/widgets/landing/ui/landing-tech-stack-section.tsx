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
    <div className="flex flex-col gap-5 border-t border-white/10 pt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-base font-semibold text-gray-300">
          {t("title")}
        </h2>
        <p className="max-w-2xl text-sm leading-relaxed text-gray-500">
          {t("description")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-surface-dark/40 p-4 text-left"
            >
              <Icon className="h-5 w-5 text-gray-500" />
              <div>
                <span className="block text-sm font-semibold text-gray-200">
                  {t(`items.${item.key}.label`)}
                </span>
                <span className="text-xs text-gray-500">
                  {t(`items.${item.key}.description`)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
