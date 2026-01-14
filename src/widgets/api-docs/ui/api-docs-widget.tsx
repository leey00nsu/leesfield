"use client";

import { useEffect, useMemo, useState } from "react";
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
import { PageHeader } from "@/shared/ui/page-header";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import { useOpenApiDocument } from "@/features/api-docs/model/use-openapi-document";
import {
  buildApiSections,
  buildExampleFromSchema,
  type ApiOperation,
  type ApiSection,
} from "@/features/api-docs/model/openapi-helpers";

const generalNavItems = [
  { id: "introduction", label: "소개", icon: Info },
  { id: "authentication", label: "인증", icon: Lock },
  { id: "errors", label: "오류", icon: AlertTriangle },
];

const fallbackEndpointItems = [
  { id: "images", label: "이미지", icon: ImageIcon },
  { id: "videos", label: "비디오", icon: Film },
  { id: "models", label: "모델", icon: Boxes },
];

const tagLabelMap: Record<string, string> = {
  Images: "이미지",
  Videos: "비디오",
  Models: "모델",
};

const highlightCards = [
  {
    title: "낮은 지연",
    description: "최적화된 추론 파이프라인으로 빠르게 생성합니다.",
    icon: Zap,
  },
  {
    title: "보안",
    description: "스코프된 API 키로 안전하게 보호합니다.",
    icon: ShieldCheck,
  },
  {
    title: "RESTful",
    description: "일관된 REST 구조로 쉽게 연동할 수 있습니다.",
    icon: BookOpen,
  },
];

const errorCards = [
  {
    status: "400",
    title: "잘못된 요청",
    description: "요청 본문이 유효하지 않습니다.",
  },
  {
    status: "401",
    title: "인증 실패",
    description: "API 키가 없거나 올바르지 않습니다.",
  },
  {
    status: "403",
    title: "접근 거부",
    description: "키가 폐기되었거나 권한이 없습니다.",
  },
  {
    status: "500",
    title: "서버 오류",
    description: "서버에서 예기치 않은 오류가 발생했습니다.",
  },
];

const errorResponseSnippet = `{
  "message": "INVALID_REQUEST",
  "errors": [
    {
      "field": "prompt",
      "messages": ["필수 입력입니다."]
    }
  ]
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

function getPrimaryResponse(responses: ApiOperation["responses"]) {
  const success = responses.find((response) => response.status.startsWith("2"));
  return success ?? responses[0] ?? null;
}

export function ApiDocsWidget() {
  const { document: openApiDocument, isLoading, error } = useOpenApiDocument();
  const apiSections = useMemo(
    () => (openApiDocument ? buildApiSections(openApiDocument) : []),
    [openApiDocument],
  );
  const endpointNavItems = useMemo(
    () =>
      apiSections.length
        ? apiSections.map((section) => ({
            id: section.id,
            label: tagLabelMap[section.title] ?? section.title,
            icon: getEndpointIcon(section),
          }))
        : fallbackEndpointItems,
    [apiSections],
  );
  const sectionIds = useMemo(
    () => [...generalNavItems, ...endpointNavItems].map((item) => item.id),
    [endpointNavItems],
  );
  const [activeSectionId, setActiveSectionId] = useState("introduction");

  useEffect(() => {
    const elements = sectionIds
      .map((id) => window.document.getElementById(id))
      .filter((value): value is HTMLElement => Boolean(value));

    if (elements.length === 0) return;

    const updateActiveSection = () => {
      const lastElement = elements[elements.length - 1];
      const pageHeight = document.documentElement.scrollHeight;
      const scrollPosition = window.scrollY + window.innerHeight;
      if (lastElement && scrollPosition >= pageHeight - 80) {
        setActiveSectionId(lastElement.id);
        return;
      }

      const offset = 140;
      let current = elements[0]?.id ?? "introduction";
      for (const element of elements) {
        const top = element.getBoundingClientRect().top - offset;
        if (top <= 0) {
          current = element.id;
        } else {
          break;
        }
      }
      setActiveSectionId(current);
    };

    updateActiveSection();

    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        updateActiveSection();
        ticking = false;
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [sectionIds]);

  const apiVersion = openApiDocument?.info.version ?? "v1";
  const introTitle = openApiDocument?.info.title ?? "leesfield API";
  const introDescription =
    openApiDocument?.info.description ??
    "leesfield 외부 REST API 문서입니다. 이미지/비디오 생성과 모델 조회를 제공합니다.";

  return (
    <div className="flex flex-col gap-8 pb-20">
      <PageHeader
        title={
          <>
            <span className="text-white">API</span>{" "}
            <span className="text-primary">문서</span>
          </>
        }
        subtitle="REST API 레퍼런스"
        sticky={false}
      />

      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-6 sm:px-10 lg:flex-row">
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-white/10 pr-6">
          <div className="sticky top-[calc(var(--dashboard-header-height,0px)+24px)] flex flex-col gap-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 font-mono">
              <span className="h-2 w-2 rounded-full bg-primary" />
              API 레퍼런스 {apiVersion}
            </div>
            <nav className="flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <h3 className="px-2 text-xs font-bold uppercase tracking-wider text-white">
                  일반
                </h3>
                <div className="flex flex-col gap-1">
                  {generalNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSectionId === item.id;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
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
                  엔드포인트
                </h3>
                <div className="flex flex-col gap-1">
                  {endpointNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSectionId === item.id;
                    return (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
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
                  <span className="text-primary">문서</span>
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

            <div className="h-px bg-linear-to-r from-white/10 to-transparent" />

            <section
              id="authentication"
              className="flex flex-col gap-8 scroll-mt-32"
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                  <KeyRound className="h-5 w-5 text-primary" />
                  인증
                </h2>
                <p className="text-gray-400 leading-relaxed">
                  모든 요청은 API 키 인증이 필요합니다. 키는{" "}
                  <Link
                    href="/api-key"
                    className="text-primary hover:underline"
                  >
                    API 키 관리
                  </Link>{" "}
                  화면에서 확인할 수 있습니다.
                </p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                    헤더 인증
                  </span>
                  <Button
                    asChild
                    variant="outline"
                    className="h-8 rounded-full border-white/10 bg-surface-lighter px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10"
                  >
                    <Link href="/api-key">API 키 보기</Link>
                  </Button>
                </div>
                <div className="p-6">
                  <p className="text-sm text-gray-400">
                    모든 요청에{" "}
                    <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
                      X-API-Key
                    </code>{" "}
                    헤더를 포함하세요.
                  </p>
                  <div className="mt-4 rounded-lg border border-white/5 bg-black/50 p-4 font-mono text-sm text-gray-300">
                    <span className="text-accent-purple">curl</span> https://api.leesfield.ai/v1/models \
                    <div className="pl-4 mt-1">
                      -H{" "}
                      <span className="text-green-400">
                        &quot;X-API-Key: lf_live_...&quot;
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                    <p className="text-xs text-gray-400">
                      API 키는 외부에 노출되지 않도록 안전하게 보관하세요.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="h-px bg-linear-to-r from-white/10 to-transparent" />

            <section id="errors" className="flex flex-col gap-8 scroll-mt-32">
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  오류
                </h2>
                <p className="text-gray-400 leading-relaxed max-w-2xl">
                  모든 오류 응답은 동일한 구조를 사용합니다.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {errorCards.map((card) => (
                  <div
                    key={card.status}
                    className="rounded-2xl border border-white/5 bg-surface-dark p-5"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="muted" size="md" className="px-2.5 py-1 text-gray-300">
                        {card.status}
                      </Badge>
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
                  오류 응답 예시
                </p>
                <pre className="mt-3 overflow-x-auto text-sm text-gray-300">
                  {errorResponseSnippet}
                </pre>
              </div>
            </section>

            <div className="h-px bg-linear-to-r from-white/10 to-transparent" />

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
                const sectionTitle = tagLabelMap[section.title] ?? section.title;
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
                        {isVideo ? "Beta" : `버전 ${apiVersion}`}
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-10">
                      {section.operations.map((operation) => {
                        const request = operation.request;
                        const primaryResponse = getPrimaryResponse(operation.responses);
                        const requestExample = request?.schema
                          ? buildExampleFromSchema(request.schema, openApiDocument)
                          : null;
                        const responseExample = primaryResponse
                          ? primaryResponse.example ??
                            buildExampleFromSchema(
                              primaryResponse.schema,
                              openApiDocument,
                            )
                          : null;

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

                            {request?.properties?.length ? (
                              <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
                                <div className="border-b border-white/5 bg-white/5 px-6 py-4">
                                  <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
                                    요청 본문 파라미터
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
                                          {param.required ? "필수" : "선택"}
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
                                    요청 예시
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
                                    응답 예시
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
                                        "응답 예시 없음",
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
                                  .map((response) => {
                                    const responsePayload =
                                      response.example ??
                                      buildExampleFromSchema(
                                        response.schema,
                                        openApiDocument,
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
                                            {response.description ?? "응답"}
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
