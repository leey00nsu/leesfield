"use client";
import { useTranslations } from "next-intl";
import { AppCodeSnippet } from "@/shared/ui/app-code-block";
export function HistoryRequestSettings({
  parameters,
  loading,
  error,
}: {
  parameters?: Record<string, unknown> | null;
  loading?: boolean;
  error?: boolean;
}) {
  const t = useTranslations("history.detail");
  const legacy = parameters && Object.hasOwn(parameters, "dynamicParams");
  const entries = legacy ? [] : Object.entries(parameters ?? {}).map(([key,value]) => ({key,label:key,value}));
  const display = (value: unknown): string =>
    value === "[file]"
      ? t("parameterFile")
      : value === null || value === ""
        ? t("parameterEmpty")
        : typeof value === "boolean"
          ? value
            ? t("parameterTrue")
            : t("parameterFalse")
          : typeof value === "object"
            ? JSON.stringify(value).replaceAll(
                '"[file]"',
                JSON.stringify(t("parameterFile")),
              )
            : String(value);
  return (
    <section className="mt-5 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">{t("generationSettings")}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {t("settingsSnapshot")}
      </p>
      <div className="h-80 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("settingsLoading")}
        </p>
      ) : error ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("settingsError")}
        </p>
      ) : !parameters ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("settingsMissing")}
        </p>
      ) : (
        <>
          <dl className="mt-3 divide-y divide-border">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 py-2 text-xs"
              >
                <dt className="break-words text-muted-foreground">
                  {entry.label}
                </dt>
                <dd className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-right">
                  {display(entry.value)}
                </dd>
              </div>
            ))}
          </dl>
          <details open className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              {t("settingsJson")}
            </summary>
            <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
              <AppCodeSnippet code={JSON.stringify(parameters, null, 2)} />
            </div>
          </details>
        </>
      )}
      </div>
    </section>
  );
}
