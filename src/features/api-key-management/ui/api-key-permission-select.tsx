"use client";
import { useId } from "react";
import { useTranslations } from "next-intl";
import { apiOperationPermissions, customAccessMarker, resolveApiKeyPermissions, type PlatformPermission } from "@/shared/api/platform-permissions";

export function ApiKeyPermissionSelect({ permissions, onChange, disabled = false }: {
  permissions: PlatformPermission[];
  onChange: (permissions: PlatformPermission[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("apiKey.permissions");
  const id = useId();
  const effective = resolveApiKeyPermissions(permissions);
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t("label")}</p>
      {[false, true].map((admin) => (
        <fieldset key={String(admin)} disabled={disabled} className="space-y-3">
          <legend className="mb-3 text-xs text-muted-foreground">{t(admin ? "administration" : "account")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {apiOperationPermissions.filter((permission) => (permission === "models:manage" || permission === "monitoring:read-all") === admin).map((permission) => (
              <label key={permission} htmlFor={id + permission} className="flex cursor-pointer items-center gap-3 text-sm has-disabled:cursor-default has-disabled:opacity-60">
                <input id={id + permission} type="checkbox" checked={effective.includes(permission)}
                  onChange={(event) => onChange([customAccessMarker, ...apiOperationPermissions.filter((p) => p === permission ? event.target.checked : effective.includes(p))])}
                  className="size-4 shrink-0 accent-data-accent" />
                {t("actions." + permission.replace(":", "_"))}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
