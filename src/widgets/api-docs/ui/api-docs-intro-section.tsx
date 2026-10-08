import { useTranslations } from "next-intl";

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
  const t = useTranslations("apiDocs.intro");
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "") ||
    "<API_BASE_URL>";

  return (
    <section id="introduction" className="scroll-mt-24 space-y-6">
      <p className="text-xs font-medium text-data-accent-foreground">
        {tSidebar("reference")} <span className="ml-2 text-muted-foreground">{apiVersion}</span>
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{introTitle}</h1>
      <p className="max-w-3xl text-base leading-8 text-muted-foreground">{introDescription}</p>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("quickstart")}</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
          {[
            { key: "latency", href: "#models" },
            { key: "security", href: "#post-/api/external/generations" },
            { key: "restful", href: "#get-/api/external/generations/{requestId}" },
          ].map(({ key, href }) => (
            <li key={key} className="pl-1">
              <a href={href} className="font-medium text-data-accent-foreground hover:underline">{t(`highlights.${key}.title`)}</a>
              <p className="text-muted-foreground">{t(`highlights.${key}.description`)}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-2 border-y border-border py-5">
        <p className="text-xs font-medium text-muted-foreground">{tSidebar("baseUrl")}</p>
        <code className="block break-all text-sm">{apiBaseUrl}</code>
      </div>
    </section>
  );
}
