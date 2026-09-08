"use client";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/ui/brand/tabs/tabs";
import {
  AppCodeSnippet,
  CodeBlock,
  CodeBlockHeader,
  CodeBlockBody,
  CodeBlockItem,
  CodeBlockContent,
} from "@/shared/ui/app-code-block";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";
import { cn } from "@/shared/lib/utils";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { appToast } from "@/shared/ui/app-toast";
import { useTranslations } from "next-intl";
import {
  buildExampleFromSchema,
  type ApiOperation,
  type ApiSection,
  type ExampleStrings,
} from "@/features/api-docs/model/openapi-helpers";
import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import {
  buildSnippet,
  snippetLanguages,
  type SnippetLanguage,
} from "@/features/api-docs/model/snippet-templates";
import {
  getEndpointIcon,
  tagIdMap,
} from "@/widgets/api-docs/lib/api-docs-metadata";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "<API_BASE_URL>";
const methodsWithBody = new Set(["POST", "PUT", "PATCH"]);

const methodStyles: Record<string, string> = {
  GET: "bg-white/10 text-foreground",
  POST: "border-data-accent/25 bg-data-accent/15 text-data-accent-foreground",
  PUT: "bg-white/10 text-foreground",
  PATCH: "bg-white/10 text-foreground",
  DELETE: "bg-destructive text-foreground",
};

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getResponsePayload(
  response: ApiOperation["responses"][number],
  openApiDocument: OpenApiDocument | null,
  exampleStrings: ExampleStrings,
) {
  return (
    response.example ??
    buildExampleFromSchema(
      response.schema,
      openApiDocument,
      undefined,
      exampleStrings,
    )
  );
}

interface ApiDocsEndpointsSectionProps {
  apiSections: ApiSection[];
  apiVersion: string;
  openApiDocument: OpenApiDocument | null;
}

export function ApiDocsEndpointsSection({
  apiSections,
  apiVersion,
  openApiDocument,
}: ApiDocsEndpointsSectionProps) {
  const tNav = useTranslations("apiDocs.sidebar.nav");
  const tEndpoints = useTranslations("apiDocs.endpoints");
  const tCommonLabels = useTranslations("common.labels");
  const tExamples = useTranslations("apiDocs.examples");
  const tSnippets = useTranslations("apiDocs.snippets");
  const [snippetLanguagesById, setSnippetLanguagesById] = useState<
    Record<string, SnippetLanguage>
  >({});
  const [copiedOperationId, setCopiedOperationId] = useState<string | null>(
    null,
  );
  const exampleStrings: ExampleStrings = {
    sample: tExamples("sample"),
    samplePrompt: tExamples("samplePrompt"),
    sampleLabel: tExamples("sampleLabel"),
    sampleName: tExamples("sampleName"),
    sampleMessage: tExamples("sampleMessage"),
  };
  const orderedLanguages = useMemo(() => snippetLanguages, []);

  useEffect(() => {
    if (!copiedOperationId) return;
    const timer = window.setTimeout(() => setCopiedOperationId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedOperationId]);

  const handleCopySnippet = async (operationId: string, snippet: string) => {
    if (!snippet.trim()) return;
    const copied = await copyTextToClipboard(snippet);
    if (copied) {
      setCopiedOperationId(operationId);
      appToast.copied(tSnippets("copied"));
    } else {
      setCopiedOperationId(null);
    }
  };

  return (
    <>
      {apiSections.map((section) => {
        const Icon = getEndpointIcon(section);

        const sectionTitle = tagIdMap[section.title]
          ? tNav(tagIdMap[section.title])
          : section.title;
        return (
          <section key={section.id} id={section.id} className="scroll-mt-32">
            <AppDocsSectionCard
              eyebrow={<AppBadge variant="muted">{section.id}</AppBadge>}
              title={
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-data-accent-foreground" />
                  {sectionTitle}
                </span>
              }
              action={
                <AppBadge variant="muted">
                  {tCommonLabels("version", { version: apiVersion })}
                </AppBadge>
              }
            >
              <div className="flex flex-col gap-10">
                {section.operations.map((operation) => {
                  const request = operation.request;
                  const requestExample = request?.schema
                    ? buildExampleFromSchema(
                        request.schema,
                        openApiDocument,
                        undefined,
                        exampleStrings,
                      )
                    : null;
                  const selectedLanguage =
                    snippetLanguagesById[operation.id] ?? "curl";
                  const methodAllowsBody = methodsWithBody.has(
                    operation.method.toUpperCase(),
                  );
                  const fileFields =
                    request?.properties
                      ?.filter((param) => param.typeLabel.includes("file"))
                      .map((param) => param.name) ?? [];
                  const snippet = buildSnippet(selectedLanguage, {
                    baseUrl: apiBaseUrl,
                    path: operation.path,
                    method: operation.method,
                    body: methodAllowsBody
                      ? (requestExample ?? undefined)
                      : undefined,
                    contentType:
                      request?.contentType ??
                      (methodAllowsBody ? "application/json" : undefined),
                    fileFields,
                  });

                  return (
                    <div
                      key={operation.id}
                      id={operation.id}
                      className="scroll-mt-32 flex flex-col gap-6"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <AppBadge
                            variant="muted"
                            size="md"
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium",
                              methodStyles[operation.method] ??
                                "bg-white/10 text-foreground",
                            )}
                          >
                            {operation.method}
                          </AppBadge>
                          <code className="min-w-0 break-all font-mono text-sm text-foreground sm:text-base">
                            {operation.path}
                          </code>
                        </div>
                        {operation.description ? (
                          <p className="text-muted-foreground leading-relaxed max-w-3xl">
                            {operation.description}
                          </p>
                        ) : null}
                      </div>

                      <CodeBlock
                        value={selectedLanguage}
                        data={[
                          {
                            language: selectedLanguage,
                            filename: "",
                            code: snippet,
                          },
                        ]}
                        className="h-auto min-w-0"
                      >
                        <Tabs
                          data-horizontal=""
                          value={selectedLanguage}
                          onValueChange={(value) =>
                            setSnippetLanguagesById((prev) => ({
                              ...prev,
                              [operation.id]: value as SnippetLanguage,
                            }))
                          }
                          className="min-w-0 flex-col gap-0 bg-background"
                        >
                          <CodeBlockHeader className="flex min-w-0 flex-col items-start gap-4 bg-muted/40 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-sans uppercase tracking-wider text-muted-foreground">
                                {tSnippets("title")}
                              </span>
                              <p className="text-xs text-muted-foreground">
                                {tSnippets("description")}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-sans uppercase tracking-wider text-muted-foreground">
                                {tSnippets("languageLabel")}
                              </span>
                              <TabsList
                                aria-label={tSnippets("languageLabel")}
                                className="h-auto flex-wrap"
                              >
                                {orderedLanguages.map((language) => {
                                  return (
                                    <TabsTrigger
                                      key={language}
                                      value={language}
                                      className="data-active:bg-data-accent/15 data-active:text-data-accent-foreground dark:data-active:bg-data-accent/15 dark:data-active:text-data-accent-foreground"
                                    >
                                      {tSnippets(`languages.${language}`)}
                                    </TabsTrigger>
                                  );
                                })}
                              </TabsList>
                              <AppButton
                                type="button"
                                size="pill-sm"
                                variant="surface"
                                className="text-xs font-semibold"
                                onClick={() =>
                                  handleCopySnippet(operation.id, snippet)
                                }
                              >
                                {copiedOperationId === operation.id ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                                {copiedOperationId === operation.id
                                  ? tSnippets("copied")
                                  : tSnippets("copy")}
                              </AppButton>
                            </div>
                          </CodeBlockHeader>
                          <CodeBlockBody>
                            {(item) => (
                              <TabsContent
                                key={item.language}
                                value={selectedLanguage}
                                className="min-w-0"
                              >
                                <CodeBlockItem
                                  value={item.language}
                                  lineNumbers={false}
                                  className="min-w-0 [&_pre]:overflow-x-auto"
                                >
                                  <CodeBlockContent
                                    language={
                                      selectedLanguage === "curl"
                                        ? "bash"
                                        : selectedLanguage
                                    }
                                  >
                                    {item.code}
                                  </CodeBlockContent>
                                </CodeBlockItem>
                              </TabsContent>
                            )}
                          </CodeBlockBody>
                        </Tabs>
                      </CodeBlock>

                      {request?.properties?.length ? (
                        <div className="rounded-lg border border-border bg-transparent shadow-none">
                          <div className="border-b border-border px-6 py-4">
                            <span className="text-xs font-medium text-foreground/80 font-mono">
                              {tEndpoints("requestParams")}
                            </span>
                          </div>
                          <div className="divide-y divide-border">
                            {request.properties.map((param) => (
                              <div
                                key={param.name}
                                className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[200px_1fr]"
                              >
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <code className="font-mono font-medium text-foreground">
                                      {param.name}
                                    </code>
                                    <AppBadge
                                      variant="muted"
                                      className="rounded bg-white/10 px-2 py-0.5 font-sans uppercase text-muted-foreground"
                                    >
                                      {param.typeLabel}
                                    </AppBadge>
                                  </div>
                                  <AppBadge
                                    variant="muted"
                                    className={cn(
                                      "w-fit self-start rounded-full bg-transparent px-2.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider",
                                      param.required
                                        ? "border border-destructive/25 text-destructive"
                                        : "border border-white/12 text-muted-foreground",
                                    )}
                                  >
                                    {param.required
                                      ? tEndpoints("required")
                                      : tEndpoints("optional")}
                                  </AppBadge>
                                </div>
                                <div className="flex flex-col gap-2">
                                  {param.description ? (
                                    <p className="text-sm text-muted-foreground">
                                      {param.description}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {requestExample ? (
                        <div className="overflow-hidden rounded-md border border-border bg-background">
                          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                            <span className="text-[10px] font-sans uppercase tracking-wider text-muted-foreground">
                              {tEndpoints("requestExample")}
                            </span>
                          </div>
                          <AppCodeSnippet code={formatJson(requestExample)} />
                        </div>
                      ) : null}

                      {operation.responses.length ? (
                        <div className="flex flex-col gap-3">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {tEndpoints("responseExample")}
                          </span>
                          <div className="grid gap-3 md:grid-cols-2">
                            {operation.responses.map((response) => {
                              const responsePayload = getResponsePayload(
                                response,
                                openApiDocument,
                                exampleStrings,
                              );
                              return (
                                <div
                                  key={response.status}
                                  data-testid="api-response-card"
                                  className="rounded-xl border border-border bg-surface-dark p-4"
                                >
                                  <div className="flex items-center gap-3">
                                    <AppBadge
                                      variant="muted"
                                      size="md"
                                      className="px-2.5 py-1 text-foreground/80"
                                    >
                                      {response.status}
                                    </AppBadge>
                                    <span className="text-sm font-semibold text-foreground">
                                      {response.description ??
                                        tEndpoints("response")}
                                    </span>
                                  </div>
                                  <AppCodeSnippet
                                    className="app-scrollbar mt-3 max-h-48 overflow-auto [&_pre]:text-xs"
                                    code={formatJson(
                                      responsePayload ?? {
                                        message:
                                          response.description ??
                                          tEndpoints("responseFallback"),
                                      },
                                    )}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </AppDocsSectionCard>
          </section>
        );
      })}
    </>
  );
}
