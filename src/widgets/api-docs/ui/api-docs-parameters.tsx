import { useTranslations } from "next-intl";
import type { ApiSchemaProperty } from "@/features/api-docs/model/openapi-helpers";

export function ApiDocsParameters({ title, parameters }: {
  title: string;
  parameters: ApiSchemaProperty[];
}) {
  const t = useTranslations("apiDocs.endpoints");
  return (
    <div className="min-w-0 space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead className="border-y border-border text-xs text-muted-foreground">
            <tr>{["parameter", "requiredLabel", "default", "description", "constraints"].map((key) => <th key={key} scope="col" className="px-3 py-3 font-medium first:pl-0">{t(key)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border border-b border-border">
            {parameters.map((parameter) => {
              const schema = parameter.schema;
              const constraints: string[] = [];
              if (schema?.minimum !== undefined || schema?.maximum !== undefined)
                constraints.push(`${schema.minimum ?? "—"}–${schema.maximum ?? "—"}`);
              if (schema?.maxLength !== undefined) constraints.push(t("maxCharacters", { count: schema.maxLength }));
              if (schema?.minLength !== undefined) constraints.push(t("minCharacters", { count: schema.minLength }));
              if (schema?.enum) constraints.push(schema.enum.map(String).join(" / "));
              if (schema?.writeOnly) constraints.push(t("writeOnly"));
              if (schema?.pattern) constraints.push(schema.pattern);
              if (schema?.["x-normalization"] === "parse-integer-clamp") constraints.push(t("clamped"));
              if (schema?.["x-normalization"] === "trim-truncate") constraints.push(t("truncated"));
              return (
                <tr key={parameter.name} className="align-top">
                  <th scope="row" className="max-w-48 py-4 pr-3 font-normal">
                    <code className="whitespace-nowrap font-medium">{parameter.name}</code>
                    <span className="mt-1 block text-xs text-muted-foreground">{parameter.typeLabel}</span>
                  </th>
                  <td className="whitespace-nowrap px-3 py-4 text-xs text-muted-foreground">{t(parameter.required ? "required" : "optional")}</td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono text-xs">{schema?.default === undefined ? "—" : JSON.stringify(schema.default)}</td>
                  <td className="min-w-36 px-3 py-4 leading-6 text-muted-foreground">{parameter.description ?? "—"}</td>
                  <td className="min-w-28 px-3 py-4 text-xs leading-6 text-muted-foreground">{constraints.join(" · ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
