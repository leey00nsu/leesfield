"use client";
import { AppPageShell } from "@/shared/ui/app-page-shell";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  GenerationMediaContext,
  GenerationMediaRail,
} from "@/shared/ui/generation-media-rail";
import { ImageGenerationForm } from "@/features/image-generation/ui/image-generation-form";
import { VideoGenerationForm } from "@/features/video-generation/ui/video-generation-form";
import { AudioGenerationForm } from "@/features/audio-generation/ui/audio-generation-form";
import {
  mediaTypes,
  normalizeMediaType,
  type MediaType,
} from "@/shared/lib/generation/routes";
import { GenerationQueryContext } from "@/shared/lib/generation/query-context";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { TabsContent } from "@/shared/ui/brand/tabs/tabs";
const forms = {
  image: ImageGenerationForm,
  video: VideoGenerationForm,
  audio: AudioGenerationForm,
};

function QueryPanel({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  const [attachment, setAttachment] = useState<{
    query: string;
    value: string;
  } | null>(null);
  const params = useMemo(() => {
    const result = new URLSearchParams(query);
    if (attachment?.query === query && attachment.value)
      result.append("initImage", attachment.value);
    return result;
  }, [query, attachment]);
  const draftId = params.get("landingDraft");
  useEffect(() => {
    if (!draftId) return;
    let value = "";
    try {
      const data = JSON.parse(
        sessionStorage.getItem("leesfield:landing:" + draftId) ?? "{}",
      );
      if (
        typeof data.initImage === "string" &&
        data.initImage.startsWith("data:image/")
      )
        value = data.initImage;
    } catch {}
    queueMicrotask(() => setAttachment({ query, value }));
  }, [draftId, query]);
  if (draftId && attachment?.query !== query) return null;
  return (
    <GenerationQueryContext value={params}>{children}</GenerationQueryContext>
  );
}
export function GenerationScreen({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const t = useTranslations("generation.page");
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = 0;
    let height = 0;
    const observer = new ResizeObserver(() => {
      const active = element.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) .generation-composer-layout');
      if (!active) return;
      const nextWidth = active.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; height = 0; element.style.removeProperty("--composer-min-height"); }
      height = Math.max(height, window.matchMedia("(min-width: 640px)").matches ? 336 : 576, active.getBoundingClientRect().height);
      element.style.setProperty("--composer-min-height", height + "px");
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const params = useSearchParams();
  const selected = normalizeMediaType(params.get("type"));
  const query = params.toString();
  const [panels, setPanels] = useState<Partial<Record<MediaType, string>>>(
    () => ({ [selected]: query }),
  );
  // Register a newly visited panel before committing; keep every prior panel mounted.
  if (
    panels[selected] === undefined ||
    ([...params.keys()].some((key) => key !== "type") &&
      panels[selected] !== query)
  )
    setPanels({ ...panels, [selected]: query });
  const [vertical, setVertical] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setVertical(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  // External reuse links may supply a new payload for an already visited medium.
  const select = (value: unknown) => {
    const type = normalizeMediaType(value);
    window.history.pushState(null, "", "/generate?type=" + type);
  };
  return (
    <AppPageShell ref={container} className="flex-1 justify-center py-8 sm:py-8" intro={{ title: t("title"), description: t("description") }}>
      <TabsPrimitive.Root
        data-vertical={vertical ? "" : undefined}
        data-horizontal={!vertical ? "" : undefined}
        value={selected}
        onValueChange={select}
        orientation={vertical ? "vertical" : "horizontal"}
        className="group/tabs w-full"
      >
        <GenerationMediaContext value={<GenerationMediaRail />}>
          <div className="min-w-0 flex-1">
            {mediaTypes.map((type) => {
              const Form = forms[type];
              return (
                <TabsContent
                  key={type}
                  value={type}
                  keepMounted
                  hidden={selected !== type}
                >
                  {panels[type] !== undefined && (
                    <QueryPanel query={panels[type]}>
                      <Form isAuthenticated={isAuthenticated} embedded />
                    </QueryPanel>
                  )}
                </TabsContent>
              );
            })}
          </div>
        </GenerationMediaContext>
      </TabsPrimitive.Root>
    </AppPageShell>
  );
}
