import type { ReactNode } from "react";
import { AudioLines, Image, Sparkles, Video } from "lucide-react";
import { modelProviderLabel } from "@/shared/model-catalog/provider-display";
import { AppModalityTag } from "./app-modality-tag";
import { appResourceRowIconClassName } from "./app-resource-list";

type AppModelIdentityProps = {
  name: ReactNode;
  identifier?: string;
  provider: string;
  type: "image" | "video" | "audio" | "llm";
  modalities: readonly string[];
  badge?: ReactNode;
  audioLabel?: string;
};

export function AppModelIdentity({ name, identifier, provider, type, modalities, badge, audioLabel }: AppModelIdentityProps) {
  const Icon = { image: Image, video: Video, audio: AudioLines, llm: Sparkles }[type];
  return <>
    <div data-model-type-icon="" className={appResourceRowIconClassName}>
      <Icon className="size-6 text-white/66" aria-hidden />
    </div>
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="truncate text-sm font-medium text-foreground">{name}</h3>
        {badge}
      </div>
      {identifier && <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{identifier}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <AppModalityTag>{modelProviderLabel(provider)}</AppModalityTag>
        {modalities.map(mode => <AppModalityTag key={mode}>{mode}</AppModalityTag>)}
        {audioLabel && <span>{audioLabel}</span>}
      </div>
    </div>
  </>;
}
