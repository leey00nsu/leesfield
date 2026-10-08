"use client";

import { useTranslations } from "next-intl";
import type { ApiOperation } from "@/features/api-docs/model/openapi-helpers";
import { getApiPermissionAnchor } from "../lib/api-docs-metadata";

export function ApiDocsPermissions({ permissions = [], conditionalPermissions = [] }: {
  permissions?: ApiOperation["permissions"];
  conditionalPermissions?: ApiOperation["conditionalPermissions"];
}) {
  const t = useTranslations("apiDocs.endpoints");
  const tPermissions = useTranslations("apiKey.permissions.actions");
  if (!permissions.length && !conditionalPermissions.length) return null;

  const permissionLink = (permission: string) => {
    const anchor = getApiPermissionAnchor(permission);
    return (
      <a href={"#" + anchor} title={permission}
        className="inline-flex max-w-full rounded border border-border px-2 py-1 text-data-accent-foreground hover:underline"
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const target = document.getElementById(anchor);
          target?.closest("details")?.setAttribute("open", "");
          target?.focus({ preventScroll: true });
        }}>
        {tPermissions(permission.replace(":", "_"))}
      </a>
    );
  };

  return (
    <div className="min-w-0 space-y-3">
      <h4 className="text-sm font-semibold">{t("permission")}</h4>
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">{t("permission")}</caption>
        <colgroup><col className="w-20 sm:w-24" /><col className="w-[40%] sm:w-[35%]" /><col /></colgroup>
        <thead className="border-y border-border text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="py-3 pr-3 font-medium">{t("permissionKind")}</th>
            <th scope="col" className="py-3 pr-3 font-medium">{t("permission")}</th>
            <th scope="col" className="py-3 font-medium">{t("whenRequired")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border border-b border-border">
          {permissions.map((permission) => (
            <tr key={"required-" + permission} className="align-top">
              <td className="py-3 pr-3 text-xs text-muted-foreground">{t("required")}</td>
              <td className="py-3 pr-3">{permissionLink(permission)}</td>
              <td className="py-3 text-xs leading-6 text-muted-foreground">{t("allRequests")}</td>
            </tr>
          ))}
          {conditionalPermissions.map(({ field, permission, condition }) => (
            <tr key={field + "-" + permission} className="align-top">
              <td className="py-3 pr-3 text-xs text-muted-foreground">{t("conditional")}</td>
              <td className="py-3 pr-3">{permissionLink(permission)}</td>
              <td className="py-3 text-xs leading-6 text-muted-foreground">
                {t.rich(condition === "present" ? "whenProvided" : "whenEquals", {
                  field, value: condition,
                  condition: (chunks) => <code className="whitespace-nowrap">{chunks}</code>,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
