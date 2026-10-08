import { useTranslations } from "next-intl";
import { ApiDocsSection } from "@/widgets/api-docs/ui/api-docs-section";

const errorStatuses = [
  {
    status: "400",
    key: "badRequest",
  },
  {
    status: "401",
    key: "unauthorized",
  },
  {
    status: "403",
    key: "forbidden",
  },
  { status: "404", key: "notFound" },
  { status: "408", key: "timeout" },
  { status: "409", key: "conflict" },
  { status: "413", key: "tooLarge" },
  { status: "415", key: "mediaType" },
  { status: "429", key: "rateLimit" },
  { status: "499", key: "aborted" },
  { status: "500", key: "serverError" },
  { status: "503", key: "unavailable" },
];

export function ApiDocsErrorSection() {
  const t = useTranslations("apiDocs.errors");
  const errorResponseSnippet = `{
  "message": "${t("exampleMessage")}",
  "errors": {
    "formErrors": [],
    "fieldErrors": {
      "dynamicParams": ["${t("exampleFieldMessage")}"]
    }
  }
}`;

  return (
    <section id="errors" className="scroll-mt-24">
      <ApiDocsSection
        title={t("title")}
        description={t("description")}
      >
        <dl className="divide-y divide-border border-y border-border">
          {errorStatuses.map((error) => (
            <div key={error.status} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-6">
              <dt className="flex items-baseline gap-3 text-sm font-medium">
                <code className="text-muted-foreground">{error.status}</code>
                {t(`cards.${error.key}.title`)}
              </dt>
              <dd className="text-sm leading-6 text-muted-foreground">{t(`cards.${error.key}.description`)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("retry")}</p>
        <div className="mt-6 rounded-md border border-border bg-muted/30 p-5">
          <p className="text-xs font-medium text-muted-foreground">
            {t("exampleTitle")}
          </p>
          <pre className="mt-3 overflow-x-auto text-sm text-foreground/76">
            {errorResponseSnippet}
          </pre>
        </div>
      </ApiDocsSection>
    </section>
  );
}
