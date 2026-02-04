import { useTranslations } from "next-intl";

export function LandingWhySection() {
  const t = useTranslations("landing.why");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold uppercase tracking-widest text-white">
          {t("title")}
        </h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
        {t("description")}
      </p>
    </div>
  );
}

