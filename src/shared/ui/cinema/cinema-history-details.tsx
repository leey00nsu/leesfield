"use client";
import { useLocale, useTranslations } from "next-intl";
import { cinemaCatalog, cinemaOptionName, type CinemaCategory, legacyCinemaFocalLengths } from "@/shared/cinema/cinema-catalog";
import { parseCinemaSettings, type CinemaSnapshot } from "@/shared/cinema/cinema-contract";
import { AppExpandableText } from "@/shared/ui/app-expandable-text";

export function CinemaHistoryDetails({ snapshot }: { snapshot: CinemaSnapshot }) {
  const settings = parseCinemaSettings(snapshot.settings, "video");
  const t = useTranslations("cinema");
  const locale = useLocale();
  const tHistory = useTranslations("history.detail");
  const categories = (Object.keys(cinemaCatalog) as CinemaCategory[]).filter(category => settings[category] !== "auto");
  const legacyFocalLength = snapshot.schemaVersion === 1 ? snapshot.settings.focalLength : "auto";
  return <section className="grid gap-3">
    <h3 className="text-sm font-semibold">{t("sourcePrompt")}</h3>
    <AppExpandableText collapsedLines={4} showMoreLabel={tHistory("showMore")} showLessLabel={tHistory("showLess")}>{snapshot.sourcePrompt}</AppExpandableText>
    {(categories.length > 0 || legacyFocalLength !== "auto") && <>
      <h3 className="text-sm font-semibold">{t("settings")}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {categories.map(category => <div key={category} className="contents"><dt className="text-muted-foreground">{t(category)}</dt><dd>{cinemaOptionName(category, settings[category], locale)}</dd></div>)}
        {legacyFocalLength !== "auto" && <div className="contents"><dt className="text-muted-foreground">{t("focalLength")}</dt><dd>{legacyCinemaFocalLengths.find(item => item.id === legacyFocalLength)?.name}</dd></div>}
      </dl>
    </>}
    <h3 className="text-sm font-semibold">{t("finalPrompt")}</h3>
    <AppExpandableText collapsedLines={4} showMoreLabel={tHistory("showMore")} showLessLabel={tHistory("showLess")}>{snapshot.finalPrompt}</AppExpandableText>
  </section>;
}
