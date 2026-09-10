"use client";
import { getGradioContract } from "@/shared/model-catalog/gradio-contract";
import { useRef, useState, useEffect } from "react";
import { useRuntimeModelCatalog } from "@/shared/lib/hooks/use-runtime-model-catalog";
import {
  resolveRuntimeImageMaxInputImages,
  resolveRuntimeDefaultModelKey,
  type RuntimeModelBase,
} from "@/shared/model-catalog/runtime-utils";
import { resolveImageAuthoringDefaults } from "@/shared/generation/image-authoring";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ImagePlus,
  Layers,
  Maximize2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { AppInput } from "@/shared/ui/app-input";
import { GenerationModelSection } from "@/shared/ui/generation-model-section";
import { GenerationSettingsPopover } from "@/shared/ui/generation-settings-popover";
import { GenerationPromptField } from "@/shared/ui/generation-prompt-field";
import { GenerationMediaRail } from "@/shared/ui/generation-media-rail";
import { LandingHeroMotionLayer } from "./landing-hero-form-motion";
type Media = "image" | "video" | "audio";
const choices = {
  image: [
    { id: "z-image-turbo", name: "Z-Image Turbo", vendor: "Tongyi" },
    { id: "flux-dev", name: "FLUX", vendor: "Black Forest Labs" },
  ],
  video: [
    { id: "wan-2.2", name: "Wan 2.2", vendor: "Wan" },
    { id: "ltx", name: "LTX", vendor: "Lightricks" },
  ],
  audio: [{ id: "minimax", name: "MiniMax Speech", vendor: "MiniMax" }],
};
export function LandingComposer({
  media,
  isAuthenticated = false,
}: {
  media: Media;
  isAuthenticated?: boolean;
}) {
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = shell.current;
    const layout = element?.firstElementChild;
    if (!element || !(layout instanceof HTMLElement) || typeof ResizeObserver === "undefined") return;
    let width = 0;
    let height = 0;
    const observer = new ResizeObserver(() => {
      const bounds = layout.getBoundingClientRect();
      if (bounds.width !== width) {
        width = bounds.width;
        height = 0;
        layout.style.minHeight = "";
      }
      height = Math.max(height, layout.getBoundingClientRect().height);
      layout.style.minHeight = height + "px";
    });
    observer.observe(layout);
    return () => observer.disconnect();
  }, []);
  const catalog = useRuntimeModelCatalog({ enabled: isAuthenticated });
  const runtimeModels =
    media === "image"
      ? catalog.imageModels
      : media === "video"
        ? catalog.videoModels
        : catalog.audioModels;
  const available = runtimeModels.length
    ? runtimeModels.map((model) => ({
        id: model.key,
        name: model.label,
        vendor: model.vendor,
      }))
    : choices[media];
  const router = useRouter();
  const t = useTranslations("landing.hero");
  const labels = useTranslations("common.labels");
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      (["image", "video", "audio"] as const).map((type) => [
        type,
        {
          prompt: "",
          model: choices[type][0].id,
          width: 1024,
          height: 1024,
          imageCount: 1,
          steps: 9,
          initImage: "",
        },
      ]),
    ),
  );
  const draft = drafts[media];
  const activeId = available.some((model) => model.id === draft.model)
    ? draft.model
    : (resolveRuntimeDefaultModelKey<RuntimeModelBase>(runtimeModels) ??
      available[0].id);
  const activeRuntimeModel = runtimeModels.find(
    (model) => model.key === activeId,
  );
  const uploadDisabled =
    media === "image" &&
    activeRuntimeModel?.type === "image" &&
    resolveRuntimeImageMaxInputImages(activeRuntimeModel) === 0;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const update = (patch: Partial<typeof draft>) =>
    setDrafts((current) => ({
      ...current,
      [media]: { ...current[media], ...patch },
    }));
  const query = new URLSearchParams({
    type: media,
    prompt: draft.prompt,
    source: "landing",
    ...(activeRuntimeModel ? { model: activeId } : {}),
    modelLabel: available.find((model) => model.id === activeId)?.name ?? "",
    width: String(draft.width),
    height: String(draft.height),
    imageCount: String(draft.imageCount),
    steps: String(draft.steps),
  });
  // The public preview does not assume that an editorial model ID exists in this deployment's private catalog.
  const href = "/generate?" + query;
  return (
    <div ref={shell} className="landing-composer w-full">
      <GenerationPromptField
        testId="landing-hero-form-surface"
        surface="hero"
        className="landing-hero-field relative mx-auto w-full max-w-4xl rounded-[1.05rem] border-0 p-3 sm:p-4"
        contentWrapper={(children) => (
          <>
            <LandingHeroMotionLayer
              testId="landing-hero-form-border-motion"
              className="pointer-events-none absolute inset-0 rounded-[1.05rem] border border-white/12"
            />
            <LandingHeroMotionLayer
              testId="landing-hero-form-motion"
              className="flex flex-1 [&>div]:flex-1"
            >
              {children}
            </LandingHeroMotionLayer>
          </>
        )}
        mediaSelector={
          <GenerationMediaRail />
        }
        attachments={
          media !== "audio" ? (
            <div className="flex items-center gap-2 px-4 pt-4">
              {draft.initImage && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={draft.initImage}
                    alt={t("preview.attachment")}
                    className="size-14 rounded-lg object-cover"
                  />
                  <AppButton
                    variant="surface"
                    size="icon-sm"
                    aria-label={t("preview.removeAttachment")}
                    className="absolute -right-2 -top-2"
                    onClick={() => update({ initImage: "" })}
                  >
                    <X className="size-3" />
                  </AppButton>
                </div>
              )}
              <AppButton
                variant="surface"
                size="icon"
                aria-label={t("preview.attachment")}
                disabled={uploadDisabled}
                onClick={() => input.current?.click()}
              >
                <ImagePlus className="size-5" />
              </AppButton>
              <input
                ref={input}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (
                    !file.type.startsWith("image/") ||
                    file.size > 3 * 1024 * 1024
                  ) {
                    setError(t("preview.fileError"));
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    update({ initImage: String(reader.result) });
                    setError("");
                  };
                  reader.readAsDataURL(file);
                  event.target.value = "";
                }}
              />
            </div>
          ) : undefined
        }
        textarea={
          <textarea
            aria-label={t("preview.promptLabel")}
            value={draft.prompt}
            onChange={(event) => update({ prompt: event.target.value })}
            placeholder={t(`preview.placeholders.${media}`)}
            className="min-h-28 w-full resize-none border-0 bg-transparent p-4 text-sm leading-6 outline-none placeholder:text-muted-foreground"
          />
        }
        feedback={error ? <p role="alert">{error}</p> : undefined}
        footerLeft={
          <>
            <GenerationModelSection
              modality={media}
              items={available}
              activeId={activeId}
              onSelect={(model) => {
                const runtime = catalog.imageModels.find(
                  (item) => item.key === model,
                );
                update({
                  model,
                  ...(media === "image" && runtime && !getGradioContract(runtime)
                    ? resolveImageAuthoringDefaults(runtime)
                    : {}),
                });
              }}
            />
            {media !== "audio" && (
              <GenerationSettingsPopover
                label={labels("outputSize")}
                summary={draft.width + " × " + draft.height}
                icon={<Maximize2 className="size-4" />}
              >
                <div className="grid grid-cols-2 gap-3">
                  {(["width", "height"] as const).map((key) => (
                    <label key={key} className="text-xs">
                      {labels(key)}
                      <AppInput
                        type="number"
                        min={256}
                        max={2048}
                        step={64}
                        value={draft[key]}
                        onChange={(e) =>
                          update({ [key]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
              </GenerationSettingsPopover>
            )}
            {media === "image" && (
              <>
                <GenerationSettingsPopover
                  label={labels("imageCount")}
                  summary={String(draft.imageCount)}
                  icon={<Layers className="size-4" />}
                >
                  <AppInput
                    aria-label={labels("imageCount")}
                    type="number"
                    min={1}
                    max={4}
                    value={draft.imageCount}
                    onChange={(e) =>
                      update({ imageCount: Number(e.target.value) })
                    }
                  />
                </GenerationSettingsPopover>
                <GenerationSettingsPopover
                  label={labels("settings")}
                  summary={labels("steps") + " " + draft.steps}
                  icon={<SlidersHorizontal className="size-4" />}
                >
                  <label className="flex flex-col gap-3 text-sm">
                    {labels("steps")} {draft.steps}
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={draft.steps}
                      onChange={(e) =>
                        update({ steps: Number(e.target.value) })
                      }
                    />
                  </label>
                </GenerationSettingsPopover>
              </>
            )}
          </>
        }
        footerRight={
          <AppButton asChild size="lg" variant="generate">
            <Link
              href={href}
              onClick={(event) => {
                if (!draft.initImage) return;
                try {
                  const id = crypto.randomUUID();
                  sessionStorage.setItem(
                    "leesfield:landing:" + id,
                    JSON.stringify({ initImage: draft.initImage }),
                  );
                  event.preventDefault();
                  router.push(href + "&landingDraft=" + id);
                } catch {
                  event.preventDefault();
                  setError(t("preview.fileError"));
                }
              }}
            >
              {t("preview.generate")}
              <Sparkles className="size-4" />
            </Link>
          </AppButton>
        }
      />
    </div>
  );
}
