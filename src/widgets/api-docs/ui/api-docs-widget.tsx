"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Film,
  Image as ImageIcon,
  Info,
  KeyRound,
  Lock,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { DashboardPageHeader } from "@/shared/ui/dashboard-page-header";
import { Button } from "@/shared/ui/button";
import { useOpenApiDocument } from "@/features/api-docs/model/use-openapi-document";
import {
  buildApiSections,
  type ApiOperation,
  type ApiSection,
} from "@/features/api-docs/model/openapi-helpers";

const generalNavItems = [
  { id: "introduction", label: "Introduction", icon: Info, active: true },
  { id: "authentication", label: "Authentication", icon: Lock },
  { id: "errors", label: "Errors", icon: AlertTriangle },
];

const fallbackEndpointItems = [
  { id: "images", label: "Images", icon: ImageIcon },
  { id: "videos", label: "Videos", icon: Film },
  { id: "models", label: "Models", icon: Boxes },
];

const highlightCards = [
  {
    title: "Low Latency",
    description: "Optimized inference pipelines for rapid generation.",
    icon: Zap,
  },
  {
    title: "Secure",
    description: "Scoped API keys with strict validation and rotation tools.",
    icon: ShieldCheck,
  },
  {
    title: "RESTful",
    description: "Predictable endpoints and response shapes for fast integration.",
    icon: BookOpen,
  },
];

const errorCards = [
  {
    status: "400",
    title: "Invalid request",
    description: "Payload validation failed. Fix fields and retry.",
  },
  {
    status: "401",
    title: "Unauthorized",
    description: "Missing API key header or invalid credentials.",
  },
  {
    status: "403",
    title: "Forbidden",
    description: "Key is revoked or does not have access to the resource.",
  },
  {
    status: "500",
    title: "Server error",
    description: "Unexpected error. Capture the request id and contact support.",
  },
];

const errorResponseSnippet = `{
  "message": "INVALID_REQUEST",
  "errors": {
    "prompt": ["Required"]
  }
}`;

const methodStyles: Record<string, string> = {
  GET: "bg-white/10 text-white",
  POST: "bg-primary text-black shadow-[0_0_10px_rgba(212,240,50,0.3)]",
  PUT: "bg-white/10 text-white",
  PATCH: "bg-white/10 text-white",
  DELETE: "bg-destructive text-white",
};

function getEndpointIcon(section: ApiSection) {
  const key = section.id.toLowerCase();
  if (key.includes("image")) return ImageIcon;
  if (key.includes("video")) return Film;
  if (key.includes("model")) return Boxes;
  return BookOpen;
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getPrimaryResponse(operations: ApiOperation["responses"]) {
  const success = operations.find((response) => response.status.startsWith("2"));
  return success ?? operations[0] ?? null;
}

export function ApiDocsWidget() {
  const { document, isLoading, error } = useOpenApiDocument();
  const apiSections = useMemo(
    () => (document ? buildApiSections(document) : []),
    [document],
  );
  const endpointNavItems = apiSections.length
    ? apiSections.map((section) => ({
        id: section.id,
        label: section.title,
        icon: getEndpointIcon(section),
      }))
    : fallbackEndpointItems;
  const apiVersion = document?.info.version ?? "v1";
  const introTitle = document?.info.title ?? "lee's field API";
  const introDescription =
    document?.info.description ??
    "Integrate lee's field into your products with REST endpoints for image, video, and model discovery. Everything is protected by API keys and documented directly from our request and response types.";

  return (
    <div className="flex flex-col gap-8 pb-20">
      <DashboardPageHeader
        title={
          <>
            <span className="text-white">API</span>{" "}
            <span className="text-primary">Documentation</span>
          </>
        }
        subtitle="REST API REFERENCE"
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 sm:px-10 lg:flex-row">
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-white/10 pr-6">
          <div className="sticky top-28 flex flex-col gap-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 font-mono">
              <span className="h-2 w-2 rounded-full bg-primary" />
              API Reference {apiVersion}
            </div>
            <nav className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-white">
                  General
                </h3>
                <div className="flex flex-col gap-1">
                  {generalNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          item.active
                            ? "border border-primary/10 bg-primary/10 text-primary"
                            : "text-gray-400 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-white">
                  Endpoints
                </h3>
                <div className="flex flex-col gap-1">
                  {endpointNavItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            </nav>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          <div className="flex w-full flex-col gap-16 pb-24">
            <section
              id="introduction"
              className="flex flex-col gap-6 scroll-mt-32"
            >
              <div>
                <h2 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
                  <span className="text-white">API</span>{" "}
                  <span className="text-primary">Documentation</span>
                </h2>
                <p className="mt-2 text-xs font-mono uppercase tracking-widest text-gray-500">
                  {introTitle} · {apiVersion}
                </p>
                <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-3xl">
                  {introDescription}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {highlightCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className="rounded-2xl border border-white/5 bg-surface-dark p-5 transition-colors hover:border-primary/30"
                    >
                      <div className="mb-3 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-base font-bold text-white">
                        {card.title}
                      </h3>
                      <p className="mt-2 text-sm text-gray-500">
                        {card.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section
              id="authentication"
              className="flex flex-col gap-8 scroll-mt-32"
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                  <KeyRound className="h-5 w-5 text-primary" />
                  Authentication
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  Authenticate every request with your API key. You can manage
                  keys in the{" "}
                  <Link
                    href="/api-key"
                    className="text-primary hover:underline"
                  >
                    API Keys
                  </Link>{" "}
                  dashboard.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                    Header Authentication
                  </span>
                  <Button
                    asChild
                    variant="outline"
                    className="h-8 rounded-full border-white/10 bg-surface-lighter px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10"
                  >
                    <Link href="/api-key">View API Keys</Link>
                  </Button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-gray-400">
                    Include your API key in the{" "}
                    <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                      X-API-Key
                    </code>{" "}
                    header for every request.
                  </p>
                  <div className="mt-4 rounded-lg border border-white/5 bg-black/50 p-4 font-mono text-sm text-gray-300">
                    <span className="text-accent-purple">curl</span> https://api.leesfield.ai/v1/models \
                    <div className="pl-4 mt-1">
                      -H{" "}
                      <span className="text-green-400">"X-API-Key: lf_live_..."</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                    <p className="text-xs text-gray-400">
                      Keep your keys secure. Never expose secret API keys in
                      client-side code or public repositories.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            <section id="errors" className="flex flex-col gap-8 scroll-mt-32">
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  Errors
                </h2>
                <p className="text-gray-400 leading-relaxed max-w-2xl">
                  Every error response follows a consistent structure so you can
                  reliably surface issues to users and retry when appropriate.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {errorCards.map((card) => (
                  <div
                    key={card.status}
                    className="rounded-2xl border border-white/5 bg-surface-dark p-5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-300">
                        {card.status}
                      </span>
                      <h3 className="text-sm font-bold text-white">
                        {card.title}
                      </h3>
                    </div>
                    <p className="mt-3 text-sm text-gray-400">
                      {card.description}
                    </p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-white/5 bg-black/60 p-6">
                <p className="text-xs font-mono uppercase tracking-wider text-gray-500">
                  Example error payload
                </p>
                <pre className="mt-3 overflow-x-auto text-sm text-gray-300">
                  {errorResponseSnippet}
                </pre>
              </div>
            </section>

            <div className="h-px bg-gradient-to-r from-white/10 to-transparent" />

            {isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-surface-dark/80 px-6 py-4 text-sm text-gray-300">
                OpenAPI 스키마를 불러오는 중입니다.
              </div>
            ) : null}
            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-4 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {apiSections.length ? (
              apiSections.map((section) => {
                const Icon = getEndpointIcon(section);
                const isVideo = section.id.includes("video");
                return (
                  <section
                    key={section.id}
                    id={section.id}
                    className="flex flex-col gap-8 scroll-mt-32"
                  >
                    <div className="flex items-center gap-4">
                      <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                        <Icon className="h-5 w-5 text-primary" />
                        {section.title}
                      </h2>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isVideo
                            ? "bg-primary text-black"
                            : "border border-white/5 bg-white/10 text-gray-400"
                        }`}
                      >
                        {isVideo ? "Beta" : `Version ${apiVersion}`}
                      </span>
                    </div>

                    <div className="flex flex-col gap-10">
                      {section.operations.map((operation) => {
                        const request = operation.request;
                        const primaryResponse = getPrimaryResponse(operation.responses);

                        return (
                          <div
                            key={operation.id}
                            className="flex flex-col gap-6"
                          >
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                                    methodStyles[operation.method] ??
                                    "bg-white/10 text-white"
                                  }`}
                                >
                                  {operation.method}
                                </span>
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

                            {request?.properties?.length ? (
                              <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                                <div className="border-b border-white/5 bg-white/5 px-6 py-4">
                                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                                    Body Parameters
                                  </span>
                                </div>
                                <div className="divide-y divide-white/5">
                                  {request.properties.map((param) => (
                                    <div
                                      key={param.name}
                                      className="grid grid-cols-1 gap-4 p-6 md:grid-cols-[200px_1fr]"
                                    >
                                      <div className="flex flex-col gap-1">
                                        <code className="font-mono font-bold text-primary">
                                          {param.name}
                                        </code>
                                        <span
                                          className={`text-[10px] font-bold uppercase tracking-wider ${
                                            param.required
                                              ? "text-destructive"
                                              : "text-gray-500"
                                          }`}
                                        >
                                          {param.required ? "Required" : "Optional"}
                                        </span>
                                      </div>
                                      <div className="flex flex-col gap-2">
                                        <span className="text-sm font-medium text-gray-300">
                                          {param.typeLabel}
                                        </span>
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

                            {request?.schema ? (
                              <div className="rounded-2xl border border-white/5 bg-black shadow-lg">
                                <div className="flex items-center justify-between border-b border-white/5 bg-black px-4 py-2">
                                  <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                                    Request Schema
                                  </span>
                                </div>
                                <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                                  {formatJson(request.schema)}
                                </pre>
                              </div>
                            ) : null}

                            {primaryResponse ? (
                              <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                                <div className="flex items-center justify-between border-b border-white/5 bg-surface-lighter px-4 py-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                    Example Response
                                  </span>
                                  <span className="text-[10px] font-mono text-primary">
                                    {primaryResponse.status}
                                  </span>
                                </div>
                                <pre className="overflow-x-auto p-6 text-sm text-gray-300">
                                  {formatJson(
                                    primaryResponse.example ??
                                      primaryResponse.schema ??
                                      {
                                        message:
                                          primaryResponse.description ??
                                          "No response schema",
                                      },
                                  )}
                                </pre>
                              </div>
                            ) : null}

                            {operation.responses.length > 1 ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                {operation.responses
                                  .filter(
                                    (response) => response !== primaryResponse,
                                  )
                                  .map((response) => (
                                    <div
                                      key={response.status}
                                      className="rounded-xl border border-white/5 bg-surface-dark p-4"
                                    >
                                      <div className="flex items-center gap-3">
                                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                                          {response.status}
                                        </span>
                                        <span className="text-sm font-semibold text-white">
                                          {response.description ?? "Response"}
                                        </span>
                                      </div>
                                      {response.schema || response.example ? (
                                        <pre className="mt-3 max-h-48 overflow-x-auto text-xs text-gray-400">
                                          {formatJson(
                                            response.example ?? response.schema,
                                          )}
                                        </pre>
                                      ) : null}
                                    </div>
                                  ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            ) : !isLoading ? (
              <div className="rounded-2xl border border-white/10 bg-surface-dark/80 px-6 py-6 text-sm text-gray-300">
                OpenAPI 스키마를 불러오지 못해 엔드포인트 정보를 표시할 수 없습니다.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
