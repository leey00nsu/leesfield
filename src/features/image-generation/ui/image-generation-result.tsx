"use client";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ImageGenerationState } from "../hook/use-image-generation";
import { AppMediaOrderBadge } from "@/shared/ui/app-media-order-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppMediaOpenButton } from "@/shared/ui/app-media-open-button";
import { cn } from "@/shared/lib/utils";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { GenerationResultReveal } from "@/shared/ui/generation-result-reveal";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
const RESULTS_PER_PAGE = 9;
const previewShellClass = "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const resultFrameClass = "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";
export function ImageGenerationResult({ state, embedded = false }: { state: ImageGenerationState; embedded?: boolean }) {
  const tGeneration = useTranslations("generation");
  const tImage = useTranslations("generation.image");
  const tActions = useTranslations("common.actions");
  const isGenerating = state.status === "pending" || state.status === "processing" || state.status === "uploading";
  const resultImages = state.result?.images ?? [];
  const hasResults = resultImages.length > 0;
  const hasMultipleResults = resultImages.length > 1;
  const firstImage = resultImages[0];
  // The polling requestId changes on each repeat; the first result stays stable.
  const resultKey = firstImage
    ? JSON.stringify([firstImage.requestId ?? firstImage.url, firstImage.outputIndex])
    : null;
  const pageCount = Math.max(1, Math.ceil(resultImages.length / RESULTS_PER_PAGE));
  const [selection, setSelection] = useState({ key: resultKey, page: 0 });
  const page = selection.key === resultKey ? Math.min(selection.page, pageCount - 1) : 0;
  if (selection.key !== resultKey || selection.page !== page) {
    setSelection({ key: resultKey, page });
  }
  const pageStart = page * RESULTS_PER_PAGE;
  const visibleImages = resultImages.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const resultsGridClass = hasMultipleResults ? "grid-cols-3 grid-rows-3" : "grid-cols-1";


  return <>
            <GenerationResultReveal visible={!embedded || isGenerating || hasResults || state.status === "failed"} className={embedded ? "generation-result" : previewShellClass}>
              {!embedded && (<GenerationStudioIntro
                compact={embedded}
                guidance={tGeneration("page.imageGuidance")}
                eyebrow={tImage("previewEyebrow")}
                title={tImage("previewTitle")}
                description={tImage("previewDescription")}
              />)}
              {state.batch && <p role="status" className="mt-4 text-sm text-muted-foreground">{tGeneration("imageCountPicker.progress", state.batch)}</p>}
              <GenerationCanvas
                isGenerating={isGenerating}
                status={state.status}
                errorMessage={state.errorMessage}
                className={cn(
                  embedded
                    ? "mx-auto w-full max-w-[400px] aspect-square rounded-xl bg-card"
                    : resultFrameClass,
                  hasMultipleResults && "aspect-square",
                )}
              >
                {hasResults ? (
                  <div
                    className={cn(
                      "relative z-10 grid h-full w-full gap-3",
                      resultsGridClass,
                    )}
                  >
                    {visibleImages.map((image, localIndex) => {
                      const index = pageStart + localIndex;
                      const requestId = image.requestId ?? state.requestId;
                      const downloadUrl = requestId
                        ? `/api/image-generation/${requestId}/download?index=${image.outputIndex ?? index}`
                        : image.url;

                      return (
                        <div
                          key={`${image.url}-${index}`}
                          className="group/result relative min-h-0 min-w-0 overflow-hidden rounded-xl bg-surface-dark"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={tImage("generatedImageAlt", {
                              index: index + 1,
                            })}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/result:scale-105"
                          />
                          <AppMediaOrderBadge order={index + 1} aria-hidden="true" className="bottom-auto top-1" />
                          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover/result:opacity-100" />
                          <div className="absolute bottom-3 right-3 flex gap-2 opacity-0 transition-opacity group-hover/result:opacity-100">
                            <AppMediaOpenButton href={image.url} />
                            <AppButton asChild variant="surface" size="icon-sm">
                              <a
                                href={downloadUrl}
                                download
                                title={tActions("download")}
                                aria-label={tActions("download")}
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </AppButton>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div aria-hidden="true" className="h-full w-full" />
                )}
              </GenerationCanvas>
              {hasMultipleResults && (
                <nav aria-label={tImage("pagination.label")} className="mt-4 flex items-center justify-center gap-2">
                  <AppButton type="button" variant="surface" size="icon-sm"
                    aria-label={tImage("pagination.previous")} disabled={page === 0}
                    onClick={() => setSelection({ key: resultKey, page: page - 1 })}>
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </AppButton>
                  <span aria-live="polite" aria-atomic="true" className="min-w-20 text-center text-sm tabular-nums text-muted-foreground">
                    {tImage("pagination.page", { current: page + 1, total: pageCount })}
                  </span>
                  <AppButton type="button" variant="surface" size="icon-sm"
                    aria-label={tImage("pagination.next")} disabled={page === pageCount - 1}
                    onClick={() => setSelection({ key: resultKey, page: page + 1 })}>
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </AppButton>
                </nav>
              )}
            </GenerationResultReveal>

            {hasResults && state.errorMessage && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                {state.errorMessage}
              </div>
            )}

  </>;
}
