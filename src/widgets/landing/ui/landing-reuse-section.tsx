import { Terminal } from "./aceternity-terminal";
import { RevealContent } from "@/shared/ui/brand/reveal-content/reveal-content";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
export function LandingReuseSection() {
  const t = useTranslations("inferenceLanding.apiSection");
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-20 lg:grid-cols-2 lg:gap-20">
      <RevealContent suppressHydrationWarning variant="section">
        <p className="text-sm text-data-accent-foreground">{t("eyebrow")}</p>
        <h2 className="mt-4 text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-5 max-w-lg leading-7 text-muted-foreground">
          {t("description")}
        </p>
        <AppButton asChild variant="surface" className="mt-7">
          <Link href="/api-docs">
            {t("action")}
            <ArrowUpRight />
          </Link>
        </AppButton>
      </RevealContent>
      <RevealContent
        suppressHydrationWarning
        variant="section"
        delay={120}
        className="min-w-0"
      >
        <Terminal
          typingSpeed={12}
          initialDelay={300}
          commands={[
            'const response = await fetch("/api/external/image-generation", {\n  method: "POST",\n  headers: {\n    "x-api-key": apiKey,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    model: modelKey,\n    prompt: "A quiet blue hour",\n  }),\n});\n\nconst { requestId } = await response.json();\nconst status = await fetch(\n  `/api/external/image-generation/${requestId}`,\n  { headers: { "x-api-key": apiKey } },\n);',
          ]}
          className="max-w-none px-0"
        />
        <p className="mt-3 text-xs text-muted-foreground">{t("example")}</p>
      </RevealContent>
    </section>
  );
}
