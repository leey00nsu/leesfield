"use client";

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
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "<API_BASE_URL>";
const methodsWithBody = new Set(["POST", "PUT", "PATCH"]);

const methodStyles: Record<string, string> = {
  GET: "bg-white/10 text-white",
  POST: "bg-primary text-black shadow-[0_0_10px_rgba(212,240,50,0.3)]",
  PUT: "bg-white/10 text-white",
  PATCH: "bg-white/10 text-white",
  DELETE: "bg-destructive text-white",
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
  const [copiedOperationId, setCopiedOperationId] = useState<string | null>(null);
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
        const isVideo = section.id.includes("video");
        const sectionTitle = tagIdMap[section.title]
          ? tNav(tagIdMap[section.title])
          : section.title;
        return (
          <section key={section.id} id={section.id} className="scroll-mt-32">
            <AppDocsSectionCard
              eyebrow={<AppBadge variant="muted">{section.id}</AppBadge>}
              title={
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  {sectionTitle}
                </span>
              }
              action={
                <AppBadge
                  variant={isVideo ? "primary" : "muted"}
                  className={cn(
                    "px-2 py-0.5 text-[10px]",
                    isVideo
                      ? "bg-primary text-black"
                      : "border border-white/5 bg-white/10 text-gray-400",
                  )}
                >
                  {isVideo
                    ? tCommonLabels("beta")
                    : tCommonLabels("version", { version: apiVersion })}
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
                  body: methodAllowsBody ? requestExample ?? undefined : undefined,
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
                            "rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
                            methodStyles[operation.method] ??
                              "bg-white/10 text-white",
                          )}
                        >
                          {operation.method}
                        </AppBadge>
                        <code className="font-mono text-lg text-white">
                          {operation.path}
                        </code>
                      </div>
                      {operation.description ? (
                        <p className="text-gray-400 leading-relaxed max-w-3xl">
                          {operation.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/5 bg-black shadow-lg">
                      <div className="flex flex-col gap-4 border-b border-white/5 bg-black px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                            {tSnippets("title")}
                          </span>
                          <p className="text-xs text-gray-500">
                            {tSnippets("description")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                            {tSnippets("languageLabel")}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {orderedLanguages.map((language) => {
                              const isActive = language === selectedLanguage;
                              return (
                                <AppButton
                                  key={language}
                                  type="button"
                                  size="sm"
                                  variant={isActive ? "primary" : "ghost"}
                                  className={cn(
                                    "h-7 rounded-full px-3 text-[11px] font-bold uppercase tracking-wider",
                                    isActive
                                      ? "bg-primary text-black"
                                      : "border border-white/10 text-gray-300 hover:bg-white/5",
                                  )}
                                  aria-pressed={isActive}
                                  onClick={() =>
                                    setSnippetLanguagesById((prev) => ({
                                      ...prev,
                                      [operation.id]: language,
                                    }))
                                  }
                                >
                                  {tSnippets(`languages.${language}`)}
                                </AppButton>
                              );
                            })}
                          </div>
                          <AppButton
                            type="button"
                            size="sm"
                            variant="surface"
                            className="h-8 rounded-lg px-2.5 text-xs font-semibold"
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
                      </div>
                      <pre className="app-scrollbar overflow-x-auto p-6 text-sm text-gray-300">
                        {snippet}
                      </pre>
                    </div>

                    {request?.properties?.length ? (
                      <div className="rounded-2xl border border-white/8 bg-transparent shadow-none">
                        <div className="border-b border-white/8 px-6 py-4">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                            {tEndpoints("requestParams")}
                          </span>
                        </div>
                        <div className="divide-y divide-white/5">
                          {request.properties.map((param) => (
                            <div
                              key={param.name}
                              className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[200px_1fr]"
                            >
                              <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <code className="font-mono font-bold text-primary">
                                    {param.name}
                                  </code>
                                  <AppBadge
                                    variant="muted"
                                    className="rounded bg-white/10 px-2 py-0.5 font-mono uppercase text-gray-400"
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
                                      : "border border-white/12 text-gray-500",
                                  )}
                                >
                                  {param.required
                                    ? tEndpoints("required")
                                    : tEndpoints("optional")}
                                </AppBadge>
                              </div>
                              <div className="flex flex-col gap-2">
                                {param.description ? (
                                  <p className="text-sm text-gray-400">
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
                      <div className="overflow-hidden rounded-2xl border border-white/5 bg-black shadow-lg">
                        <div className="flex items-center justify-between border-b border-white/5 bg-black px-4 py-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                            {tEndpoints("requestExample")}
                          </span>
                        </div>
                        <pre className="app-scrollbar overflow-x-auto p-6 text-sm text-gray-300">
                          {formatJson(requestExample)}
                        </pre>
                      </div>
                    ) : null}

                    {operation.responses.length ? (
                      <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
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
                                className="rounded-xl border border-white/5 bg-surface-dark p-4"
                              >
                                <div className="flex items-center gap-3">
                                  <AppBadge
                                    variant="muted"
                                    size="md"
                                    className="px-2.5 py-1 text-gray-300"
                                  >
                                    {response.status}
                                  </AppBadge>
                                  <span className="text-sm font-semibold text-white">
                                    {response.description ??
                                      tEndpoints("response")}
                                  </span>
                                </div>
                                <pre className="app-scrollbar mt-3 max-h-48 overflow-auto text-xs text-gray-400">
                                  {formatJson(
                                    responsePayload ?? {
                                      message:
                                        response.description ??
                                        tEndpoints("responseFallback"),
                                    },
                                  )}
                                </pre>
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
