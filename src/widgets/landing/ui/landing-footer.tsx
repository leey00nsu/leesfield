import Link from "next/link";
import { useTranslations } from "next-intl";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
export function LandingFooter() {
  const t = useTranslations("inferenceLanding.footer"),
    nav = useTranslations("nav");
  return (
    <footer className="mx-auto w-full max-w-[72rem] border-t px-5 py-12 sm:px-7 lg:px-8">
      <div className="grid gap-10 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <Link href="/">
            <AppBrandLogo size="sm" />
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        {[
          {
            title: t("product"),
            links: [
              ["generate", "/generate"],
              ["nodeStudio", "/spaces"],
              ["history", "/history"],
            ],
          },
          {
            title: t("platform"),
            links: [
              ["model", "/model"],
              ["monitoring", "/monitoring"],
              ["apiDocs", "/api-docs"],
              ["apiKey", "/api-key"],
            ],
          },
        ].map((group) => (
          <div key={group.title}>
            <h2 className="text-xs font-medium text-muted-foreground">
              {group.title}
            </h2>
            <ul className="mt-4 space-y-3">
              {group.links.map(([key, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm hover:text-data-accent-foreground"
                  >
                    {nav(key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-wrap justify-between gap-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Leesfield</p>
        <Link href="https://github.com/leey00nsu/leesfield">GitHub</Link>
      </div>
    </footer>
  );
}
