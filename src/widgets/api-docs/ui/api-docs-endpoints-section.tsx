"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
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

function getPrimaryResponse(responses: ApiOperation["responses"]) {
  const success = responses.find((response) => response.status.startsWith("2"));
  return success ?? responses[0] ?? null;
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
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedOperationId(operationId);
      return;
    } catch {
      // fallback below
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = snippet;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedOperationId(operationId);
    } catch {
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
          <section
            key={section.id}
            id={section.id}
            className="flex flex-col gap-8 scroll-mt-32"
          >
            <div className="flex items-center gap-4">
              <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                <Icon className="h-5 w-5 text-primary" />
                {sectionTitle}
              </h2>
              <Badge
                variant={isVideo ? "primary" : "muted"}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px]",
                  isVideo
                    ? "bg-primary text-black"
                    : "border border-white/5 bg-white/10 text-gray-400",
                )}
              >
                {isVideo
                  ? tCommonLabels("beta")
                  : tCommonLabels("version", { version: apiVersion })}
              </Badge>
            </div>

            <div className="flex flex-col gap-10">
              {section.operations.map((operation) => {
                const request = operation.request;
                const primaryResponse = getPrimaryResponse(operation.responses);
                const requestExample = request?.schema
                  ? buildExampleFromSchema(
                      request.schema,
                      openApiDocument,
                      undefined,
                      exampleStrings,
                    )
                  : null;
                const responseExample = primaryResponse
                  ? primaryResponse.example ??
                    buildExampleFromSchema(
                      primaryResponse.schema,
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
                  <div key={operation.id} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="muted"
                          size="md"
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider",
                            methodStyles[operation.method] ??
                              "bg-white/10 text-white",
                          )}
                        >
                          {operation.method}
                        </Badge>
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

                    <div className="rounded-2xl border border-white/5 bg-black shadow-lg">
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
                                <Button
                                  key={language}
                                  type="button"
                                  size="sm"
                                  variant={isActive ? "default" : "ghost"}
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
                                </Button>
                              );
                            })}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="surface"
                            className="h-7 rounded-full border-white/10 px-3 text-[11px] font-bold uppercase tracking-wider"
                            onClick={() =>
                              handleCopySnippet(operation.id, snippet)
                            }
                          >
                            {copiedOperationId === operation.id
                              ? tSnippets("copied")
                              : tSnippets("copy")}
                          </Button>
                        </div>
                      </div>
                      <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                        {snippet}
                      </pre>
                    </div>

                    {request?.properties?.length ? (
                      <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                        <div className="border-b border-white/5 bg-white/5 px-6 py-4">
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
                                  <Badge
                                    variant="muted"
                                    className="rounded bg-white/10 px-2 py-0.5 font-mono uppercase text-gray-400"
                                  >
                                    {param.typeLabel}
                                  </Badge>
                                </div>
                                <Badge
                                  variant="muted"
                                  className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider",
                                    param.required
                                      ? "text-destructive"
                                      : "text-gray-500",
                                  )}
                                >
                                  {param.required
                                    ? tEndpoints("required")
                                    : tEndpoints("optional")}
                                </Badge>
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
                      <div className="rounded-2xl border border-white/5 bg-black shadow-lg">
                        <div className="flex items-center justify-between border-b border-white/5 bg-black px-4 py-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                            {tEndpoints("requestExample")}
                          </span>
                        </div>
                        <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                          {formatJson(requestExample)}
                        </pre>
                      </div>
                    ) : null}

                    {primaryResponse ? (
                      <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                        <div className="flex items-center justify-between border-b border-white/5 bg-surface-lighter px-4 py-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            {tEndpoints("responseExample")}
                          </span>
                          <Badge
                            variant="primary"
                            className="px-2 py-0.5 text-[10px] font-mono"
                          >
                            {primaryResponse.status}
                          </Badge>
                        </div>
                        <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                          {formatJson(
                            responseExample ?? {
                              message:
                                primaryResponse.description ??
                                tEndpoints("responseFallback"),
                            },
                          )}
                        </pre>
                      </div>
                    ) : null}

                    {operation.responses.length > 1 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {operation.responses
                          .filter((response) => response !== primaryResponse)
                          .map((response) => {
                            const responsePayload =
                              response.example ??
                              buildExampleFromSchema(
                                response.schema,
                                openApiDocument,
                                undefined,
                                exampleStrings,
                              );
                            return (
                              <div
                                key={response.status}
                                className="rounded-xl border border-white/5 bg-surface-dark p-4"
                              >
                                <div className="flex items-center gap-3">
                                  <Badge
                                    variant="muted"
                                    size="md"
                                    className="px-2.5 py-1 text-gray-300"
                                  >
                                    {response.status}
                                  </Badge>
                                  <span className="text-sm font-semibold text-white">
                                    {response.description ??
                                      tEndpoints("response")}
                                  </span>
                                </div>
                                {responsePayload ? (
                                  <pre className="mt-3 max-h-48 overflow-x-auto text-xs text-gray-400">
                                    {formatJson(responsePayload)}
                                  </pre>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
