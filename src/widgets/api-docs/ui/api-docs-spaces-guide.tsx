"use client";

import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { spacesWorkflowExample } from "@/features/api-docs/model/spaces-workflow-example";
import { CodeBlock, CodeBlockHeader, CodeBlockItem, CodeBlockContent, CodeBlockCopyButton } from "@/shared/ui/app-code-block";

const steps = [
  { key: "spacesDiscovery", target: "get-/api/external/spaces/capabilities" },
  { key: "spacesAuthor", target: "put-/api/external/spaces/{spaceId}" },
  { key: "spacesExecute", target: "post-/api/external/spaces/{spaceId}/nodes/{nodeId}/executions" },
  { key: "spacesResults", target: "get-/api/external/spaces/{spaceId}/nodes/{nodeId}/executions/{executionId}" },
] as const;

export function ApiDocsSpacesGuide() {
  const t = useTranslations("apiDocs.requestGuide");
  const tSnippets = useTranslations("apiDocs.snippets");
  return (
    <div id="spaces-guide" className="max-w-3xl space-y-4 text-sm leading-7 text-muted-foreground">
      <h3 className="text-base font-semibold text-foreground">{t("spacesTitle")}</h3>
      <ol className="list-decimal space-y-1 pl-5">
        {steps.map(({ key, target }) => (
          <li key={key}><a href={`#${target}`} className="text-data-accent-foreground hover:underline">{t(key)}</a></li>
        ))}
      </ol>
      <p>{t("spacesExecutionScope")}</p>
      <p>{t("spacesWeb")}</p>
      <a href="#post-/api/external/assets/uploads" className="block text-data-accent-foreground hover:underline">{t("spacesAssets")}</a>
      <details>
        <summary className="cursor-pointer text-data-accent-foreground">{t("spacesExample")}</summary>
        <CodeBlock value="javascript" data={[{ language: "javascript", filename: "", code: spacesWorkflowExample }]} className="mt-3 h-auto min-w-0">
          <CodeBlockHeader className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-3">
            <span className="text-[10px] font-sans uppercase tracking-wider text-muted-foreground">{tSnippets("title")}</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-muted-foreground">{tSnippets("languageLabel")} · {tSnippets("languages.javascript")}</span>
              <CodeBlockCopyButton size="pill-sm" variant="surface" aria-label={`${t("spacesExample")} ${tSnippets("copy")}`} className="text-xs font-semibold">
                <Copy className="h-3.5 w-3.5" />
                {tSnippets("copy")}
              </CodeBlockCopyButton>
            </div>
          </CodeBlockHeader>
          <CodeBlockItem value="javascript" lineNumbers={false} className="max-h-[32rem] min-w-0 overflow-auto">
            <CodeBlockContent language="javascript">{spacesWorkflowExample}</CodeBlockContent>
          </CodeBlockItem>
        </CodeBlock>
      </details>
    </div>
  );
}
