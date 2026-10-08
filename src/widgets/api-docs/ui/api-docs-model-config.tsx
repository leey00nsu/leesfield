"use client";
import { useTranslations } from "next-intl";
import type { OpenApiSchema } from "@/features/api-docs/model/openapi-types";

export function ApiDocsModelConfig({ schema }: { schema: OpenApiSchema | null }) {
  const t = useTranslations("apiDocs.endpoints");
  const variants = schema?.allOf?.[0];
  if (!variants || "$ref" in variants || !variants.anyOf) return null;
  return (
    <details className="min-w-0 space-y-4">
      <summary className="cursor-pointer text-sm text-muted-foreground">{t("modelConfig")}</summary>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse text-left text-xs">
          <caption className="sr-only">{t("modelConfig")}</caption>
          <thead className="border-y border-border text-muted-foreground">
            <tr>{["modelType", "provider", "connectionFields", "modelFields"].map((key) =>
              <th key={key} scope="col" className="px-3 py-3 font-medium">{t(key)}</th>,
            )}</tr>
          </thead>
          <tbody className="divide-y divide-border border-b border-border">
            {variants.anyOf.map((variant, index) => {
              if ("$ref" in variant) return null;
              const fields = variant.properties ?? {};
              const literal = (name: string) => {
                const field = fields[name];
                return field && !("$ref" in field) ? String(field.const ?? field.enum?.[0] ?? "") : "";
              };
              const required = (name: string) => {
                const field = fields[name];
                return field && !("$ref" in field) ? field.required ?? [] : [];
              };
              const modelFields = ["parameters", "meta"].flatMap((name) =>
                required(name).map((field) => name + "." + field),
              );
              if (variant.required?.includes("apiKey")) modelFields.push("apiKey");
              const active = fields.isActive;
              return (
                <tr key={index} className="align-top">
                  <th scope="row" className="px-3 py-4 font-normal">
                    <code>{literal("type")}</code>
                    {active && !("$ref" in active) && typeof active.const === "boolean"
                      ? <code className="mt-2 block">isActive={String(active.const)}</code> : null}
                  </th>
                  <td className="px-3 py-4"><code>{literal("provider")}</code></td>
                  <td className="px-3 py-4 leading-6"><code>{required("providerConfig").join(", ") || "—"}</code></td>
                  <td className="px-3 py-4 leading-6"><code>{modelFields.join(", ") || "—"}</code></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
