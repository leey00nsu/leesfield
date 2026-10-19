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

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { AppBadge } from "@/shared/ui/app-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppSelectRoot, AppSelectTrigger, AppSelectValue, AppSelectContent, AppSelectItem } from "@/shared/ui/app-select";
import { ApiDocsSection } from "@/widgets/api-docs/ui/api-docs-section";
import { cn } from "@/shared/lib/utils";
import { ApiDocsParameters } from "./api-docs-parameters";
import { ApiDocsPermissions } from "./api-docs-permissions";
import { ApiDocsModelConfig } from "./api-docs-model-config";
import { ApiDocsSpacesGuide } from "./api-docs-spaces-guide";
import { mediaSelectionExample } from "@/features/api-docs/model/media-selection-example";
import { useClipboardCopy } from "@/shared/ui/use-clipboard-copy";
import { useTranslations } from "next-intl";
import {
  buildExampleFromSchema,
  buildOperationExamplePath,
  type ApiOperation,
  type ApiSection,
  type ExampleStrings,
} from "@/features/api-docs/model/openapi-helpers";
import type { OpenApiDocument } from "@/features/api-docs/model/openapi-types";
import {
  buildSnippet,
  buildGenerationMultipartSnippet,
  snippetLanguages,
  type SnippetLanguage,
} from "@/features/api-docs/model/snippet-templates";
import {
  tagIdMap,
} from "@/widgets/api-docs/lib/api-docs-metadata";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "") || "<API_BASE_URL>";
const methodsWithBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  openApiDocument: OpenApiDocument | null;
}

export function ApiDocsEndpointsSection({
  apiSections,
  openApiDocument,
}: ApiDocsEndpointsSectionProps) {
  const tNav = useTranslations("apiDocs.sidebar.nav");
  const tEndpoints = useTranslations("apiDocs.endpoints");
  const tExamples = useTranslations("apiDocs.examples");
  const tSnippets = useTranslations("apiDocs.snippets");
  const [snippetLanguagesById, setSnippetLanguagesById] = useState<
    Record<string, SnippetLanguage>
  >({});
  const copy = useClipboardCopy();
  const [responseExamplesById, setResponseExamplesById] = useState<Record<string, string>>({});
  const exampleStrings: ExampleStrings = {
    sample: tExamples("sample"),
    samplePrompt: tExamples("samplePrompt"),
    sampleLabel: tExamples("sampleLabel"),
    sampleName: tExamples("sampleName"),
    sampleMessage: tExamples("sampleMessage"),
  };
  const orderedLanguages = useMemo(() => snippetLanguages, []);

  const handleCopySnippet = (snippet: string) => copy(snippet, { successMessage: tSnippets("copied") });

  return (
    <>
      {apiSections.map((section) => {
        const sectionTitle = tagIdMap[section.title]
          ? tNav(tagIdMap[section.title])
          : section.title;
        return (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <ApiDocsSection title={sectionTitle}>
              {section.id === "spaces" ? <ApiDocsSpacesGuide /> : null}
              <div className="divide-y divide-border">
                {section.operations.map((operation) => {
                  const description = operation.description;
                  const request = operation.request;
                  const requestExample = request?.schema
                    ? buildExampleFromSchema(
                        request.schema,
                        openApiDocument,
                        undefined,
                        exampleStrings,
                      )
                    : null;
                  if (operation.path === "/api/external/generations" && requestExample && typeof requestExample === "object")
                    delete (requestExample as Record<string, unknown>).promptPreset;
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
                    path: buildOperationExamplePath(operation),
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
                      className="scroll-mt-24 flex flex-col gap-6 py-10 first:pt-0"
                    >
                      <div className="flex flex-col gap-3">
                        <h3 className="flex flex-wrap items-center gap-3">
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
                        </h3>
                        {description ? (
                          <p className="text-muted-foreground leading-relaxed max-w-3xl">
                            {description}
                          </p>
                        ) : null}
                      </div>

                      <ApiDocsPermissions permissions={operation.permissions} conditionalPermissions={operation.conditionalPermissions} />
                      {operation.requestLimits ? (
                        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                          {Object.entries(operation.requestLimits).map(([key, value]) => (
                            <div key={key} className="flex gap-2">
                              <dt>{tEndpoints("limits." + key)}</dt>
                              <dd className="font-mono">{key.endsWith("Bytes") ? value >= 1024 * 1024 ? value / (1024 * 1024) + " MiB" : value / 1024 + " KiB" : key.endsWith("Ms") ? value / 1000 + " s" : value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

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
                                  handleCopySnippet(snippet)
                                }
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {tSnippets("copy")}
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

                      {operation.path === "/api/external/generations" && operation.method === "POST" ? (
                        <details className="min-w-0 space-y-4">
                          <summary className="cursor-pointer text-sm text-muted-foreground">{tSnippets("multipartTitle")}</summary>
                          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{tSnippets("multipartDescription")}</p>
                          <AppButton aria-label={tSnippets("multipartTitle") + " " + tSnippets("copy")} size="pill-sm" variant="surface" onClick={() => handleCopySnippet(
                            buildGenerationMultipartSnippet(apiBaseUrl, exampleStrings.samplePrompt),
                          )}>
                            {tSnippets("copy")}
                          </AppButton>
                          <AppCodeSnippet code={buildGenerationMultipartSnippet(apiBaseUrl, exampleStrings.samplePrompt)} language="bash" />
                        </details>
                      ) : null}

                      {operation.queryParameters?.length ? (
                        <ApiDocsParameters title={tEndpoints("queryParams")} parameters={operation.queryParameters} />
                      ) : null}
                      {operation.queryLimits && operation.path !== "/api/external/monitoring/api-keys" ? (
                        <p className="text-xs text-muted-foreground">{tEndpoints("dateRange", operation.queryLimits)}</p>
                      ) : null}
                      {operation.headerParameters?.length ? (
                        <details className="space-y-4">
                          <summary className="cursor-pointer text-sm text-muted-foreground">{tEndpoints("optionalHeaders")}</summary>
                          <ApiDocsParameters title={tEndpoints("headers")} parameters={operation.headerParameters} />
                        </details>
                      ) : null}
                      {request?.properties?.length ? (
                        <ApiDocsParameters title={tEndpoints("requestParams")} parameters={request.properties} />
                      ) : null}
                      {operation.usageNotes?.length ? (
                        <details className="min-w-0 space-y-3" data-usage-guide>
                          <summary className="cursor-pointer text-sm text-data-accent-foreground">{operation.usageTitle ?? tEndpoints("usageGuide")}</summary>
                          {operation.usageNotes.map((note, index) => <p key={index} className="max-w-3xl text-sm leading-7 text-muted-foreground">{note}</p>)}
                          {operation.method === "PUT" && operation.path === "/api/external/spaces/{spaceId}" ? (
                            <>
                              <AppButton size="pill-sm" variant="surface" onClick={() => handleCopySnippet(mediaSelectionExample)} aria-label={`${operation.usageTitle} ${tSnippets("copy")}`}>
                                {tSnippets("copy")}
                              </AppButton>
                              <AppCodeSnippet code={mediaSelectionExample} language="javascript" />
                            </>
                          ) : null}
                        </details>
                      ) : null}
                      {operation.path === "/api/external/admin/models" && operation.method === "POST"
                        ? <ApiDocsModelConfig schema={request?.schema ?? null} /> : null}

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
                          <h4 className="text-sm font-semibold">{tEndpoints("responseExample")}</h4>
                          <div className="divide-y divide-border border-y border-border">
                            {operation.responses.map((response) => {
                              const responseKey = `${operation.id}:${response.status}`;
                              const selectedExample = response.examples?.find((example) => example.name === responseExamplesById[responseKey]) ?? response.examples?.[0];
                              const responsePayload = selectedExample?.value ?? getResponsePayload(
                                response,
                                openApiDocument,
                                exampleStrings,
                              );
                              return (
                                <details
                                  key={response.status}
                                  open={response.status.startsWith("2")}
                                  className="group py-3"
                                >
                                  <summary className="cursor-pointer text-sm leading-6 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
                                    <AppBadge
                                      variant="muted"
                                      size="md"
                                      className="mr-3 px-2.5 py-1 text-foreground/80"
                                    >
                                      {response.status}
                                    </AppBadge>
                                    <span className="text-sm font-semibold text-foreground">
                                      {response.description ??
                                        tEndpoints("response")}
                                    </span>
                                  </summary>
                                  {response.examples && response.examples.length > 1 ? (
                                    <AppSelectRoot value={selectedExample?.name} onValueChange={(value) => {
                                      if (value) setResponseExamplesById((previous) => ({ ...previous, [responseKey]: value }));
                                    }}>
                                      <AppSelectTrigger aria-label={`${response.status} ${tEndpoints("responseExample")}`} className="mt-3 w-fit max-w-full">
                                        <AppSelectValue />
                                      </AppSelectTrigger>
                                      <AppSelectContent>
                                        {response.examples.map((example) => <AppSelectItem key={example.name} value={example.name}>{example.name}</AppSelectItem>)}
                                      </AppSelectContent>
                                    </AppSelectRoot>
                                  ) : null}
                                  {response.status !== "204" ? <AppCodeSnippet
                                    className="app-scrollbar mt-3 max-h-48 overflow-auto [&_pre]:text-xs"
                                    code={formatJson(
                                      responsePayload ?? {
                                        message:
                                          response.description ??
                                          tEndpoints("responseFallback"),
                                      },
                                    )}
                                  /> : null}
                                </details>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </ApiDocsSection>
          </section>
        );
      })}
    </>
  );
}
