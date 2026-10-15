"use client";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExecutionTime } from "@/shared/ui/execution-time";
import type { ImageGenerationState, ImageResultSlot } from "../hook/use-image-generation";
import { AppMediaOrderBadge } from "@/shared/ui/app-media-order-badge";
import { AppButton } from "@/shared/ui/app-button";
import { AppMediaOpenButton } from "@/shared/ui/app-media-open-button";
import { cn } from "@/shared/lib/utils";
import { GenerationCanvas, GenerationPending } from "@/shared/ui/generation-canvas";
import { GenerationResultReveal } from "@/shared/ui/generation-result-reveal";
import { GenerationStudioIntro } from "@/shared/ui/generation-studio-intro";
const RESULTS_PER_PAGE = 9;
const previewShellClass = "flex flex-col items-center px-4 pb-56 sm:px-6 lg:pb-64";
const resultFrameClass = "mt-10 min-h-[18rem] w-full max-w-6xl rounded-[1.75rem] bg-[#0b0d0c]/72 shadow-[0_24px_90px_rgba(0,0,0,0.46)] sm:min-h-[24rem]";
export function ImageGenerationResult({ state, embedded = false }: { state: ImageGenerationState; embedded?: boolean }) {
  const tGeneration = useTranslations("generation");
  const tStatuses = useTranslations("history.statuses");
  const tImage = useTranslations("generation.image");
  const tActions = useTranslations("common.actions");
  const isGenerating = state.status === "pending" || state.status === "processing" || state.status === "uploading";
  const resultImages = state.result?.images ?? [];
  type Entry = { key: string; image?: NonNullable<ImageGenerationState["result"]>["images"][number]; slot?: ImageResultSlot };
  const entries: Entry[] = state.slots?.flatMap<Entry>(slot => slot.images.length
    ? slot.images.map((image, index) => ({ key: index === 0 ? slot.id : slot.id + "-" + index, image, slot }))
    : [{ key: slot.id, image: undefined, slot }])
    ?? [
      ...resultImages.map((image, index) => ({ key: image.requestId ? image.requestId + "-" + image.outputIndex : image.url + "-" + index, image, slot: undefined })),
      ...Array.from({ length: isGenerating ? Math.max(0, (state.batch?.total ?? 1) - resultImages.length) : 0 }, (_, index) => ({ key: "pending-" + index, image: undefined, slot: undefined })),
    ];
  const hasResults = resultImages.length > 0;
  const hasMultipleResults = entries.length > 1;
  const firstImage = resultImages[0];
  // The polling requestId changes on each repeat; the first result stays stable.
  const resultKey = state.slots?.[0]?.id ?? (firstImage
    ? JSON.stringify([firstImage.requestId ?? firstImage.url, firstImage.outputIndex])
    : null);
  const pageCount = Math.max(1, Math.ceil(entries.length / RESULTS_PER_PAGE));
  const [selection, setSelection] = useState({ key: resultKey, page: 0 });
  const page = selection.key === resultKey ? Math.min(selection.page, pageCount - 1) : 0;
  if (selection.key !== resultKey || selection.page !== page) {
    setSelection({ key: resultKey, page });
  }
  const pageStart = page * RESULTS_PER_PAGE;
  const visibleEntries = entries.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const resultsGridClass = hasMultipleResults ? "grid-cols-3 grid-rows-3" : "grid-cols-1";


  return <>
            <GenerationResultReveal visible={!embedded || isGenerating || hasResults || entries.length > 0 || state.status === "failed"} className={embedded ? "generation-result" : previewShellClass}>
              {!embedded && (<GenerationStudioIntro
                compact={embedded}
                guidance={tGeneration("page.imageGuidance")}
                eyebrow={tImage("previewEyebrow")}
                title={tImage("previewTitle")}
                description={tImage("previewDescription")}
              />)}
              {state.batch && <p role="status" className="mt-4 text-sm text-muted-foreground">{tGeneration("imageCountPicker.progress", state.batch)}</p>}
              <GenerationCanvas
                isGenerating={false}
                status={entries.length ? "idle" : state.status}
                createdAt={state.createdAt}
                finishedAt={state.finishedAt}
                errorMessage={state.errorMessage}
                className={cn(
                  embedded
                    ? "mx-auto w-full max-w-[400px] aspect-square rounded-xl bg-card"
                    : resultFrameClass,
                  hasMultipleResults && "aspect-square",
                )}
              >
                {entries.length ? (
                  <div
                    className={cn(
                      "relative z-10 grid h-full w-full gap-3",
                      resultsGridClass,
                    )}
                  >
                    {visibleEntries.map(({ image, slot, key }, localIndex) => {
                      const index = pageStart + localIndex;
                      const requestId = image?.requestId ?? state.requestId;
                      const downloadUrl = requestId
                        ? `/api/image-generation/${requestId}/download?index=${image?.outputIndex ?? index}`
                        : image?.url;

                      return (
                        <div
                          key={key}
                          className="group/result relative min-h-0 min-w-0 overflow-hidden rounded-xl bg-surface-dark"
                        >
                          {image ? <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.url}
                            alt={tImage("generatedImageAlt", {
                              index: index + 1,
                            })}
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/result:scale-105"
                          />
                          </> : slot?.status === "failed" || slot?.status === "cancelled" ? (
                            <div role="status" className="flex h-full min-h-32 flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
                              <span>{tStatuses(slot.status)}</span>{slot.errorMessage && <span className="line-clamp-3">{slot.errorMessage}</span>}
                              {slot.createdAt && <ExecutionTime createdAt={slot.createdAt} finishedAt={slot.finishedAt} status={slot.status} />}
                            </div>
                          ) : <GenerationPending status={slot?.status ?? (localIndex === resultImages.length ? state.status : "pending")} createdAt={slot?.createdAt} finishedAt={slot?.finishedAt} />}
                          <AppMediaOrderBadge order={index + 1} aria-hidden="true" className="bottom-auto top-1" />
                          {image && slot?.createdAt && <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white"><ExecutionTime createdAt={slot.createdAt} finishedAt={slot.finishedAt} status={slot.status} /></div>}
                          {image && <><div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover/result:opacity-100" />
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
                          </div></>}
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
