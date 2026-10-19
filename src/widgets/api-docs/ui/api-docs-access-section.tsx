import { useTranslations } from "next-intl";
import { apiOperationPermissions } from "@/shared/api/platform-permissions";
import { ApiDocsSection } from "./api-docs-section";
import { getApiPermissionAnchor } from "../lib/api-docs-metadata";

export function ApiDocsAccessSection() {
  const t = useTranslations("apiDocs.access");
  const tActions = useTranslations("apiKey.permissions.actions");
  return (
    <section id="access" className="scroll-mt-24">
      <ApiDocsSection title={t("title")} description={t("description")}>
        <div className="max-w-3xl space-y-3 text-sm leading-7 text-muted-foreground">
          <p>{t("administration")}</p>
          <p>{t("spaces")}</p>
          <a href="/api-key" className="text-data-accent-foreground hover:underline">{t("settings")}</a>
        </div>
        {/* A direct fragment can make the browser open this ancestor before hydration. */}
        <details className="space-y-3" suppressHydrationWarning>
          <summary className="cursor-pointer text-sm text-muted-foreground">{t("identifiers")}</summary>
          <dl className="divide-y divide-border border-y border-border">
            {apiOperationPermissions.map((permission) => (
              <div key={permission} id={getApiPermissionAnchor(permission)} tabIndex={-1}
                className="scroll-mt-24 flex flex-wrap justify-between gap-2 py-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
                <dt>{tActions(permission.replace(":", "_"))}</dt>
                <dd className="font-mono text-xs text-muted-foreground">{permission}</dd>
              </div>
            ))}
          </dl>
        </details>
      </ApiDocsSection>
    </section>
  );
}
