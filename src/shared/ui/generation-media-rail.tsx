"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Image, Clapperboard, AudioLines } from "lucide-react";
import { useTranslations } from "next-intl";
import { TabsList, TabsTrigger } from "@/shared/ui/brand/tabs/tabs";
export const GenerationMediaContext = createContext<ReactNode>(null);
export function GenerationMediaRail() {
  const nav = useTranslations("nav");
  const icons = { image: Image, video: Clapperboard, audio: AudioLines };
  return (
    <TabsList
      aria-label={nav("generate")}
      className="generation-media-rail border bg-card p-1"
    >
      {(["image", "video", "audio"] as const).map((type) => {
        const Icon = icons[type];
        return (
          <TabsTrigger
            className="gap-2 px-3 py-3 sm:flex-col data-active:border-data-accent/40 data-active:bg-data-accent/15 data-active:text-data-accent-foreground dark:data-active:border-data-accent/40 dark:data-active:bg-data-accent/15 dark:data-active:text-data-accent-foreground"
            value={type}
            key={type}
          >
            <Icon />
            {nav(type)}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}
export function GenerationComposerLayout({
  children,
  rail,
}: {
  children: ReactNode;
  rail?: ReactNode;
}) {
  const inherited = useContext(GenerationMediaContext);
  return (
    <div className="generation-composer-layout flex min-w-0 flex-col gap-3 sm:flex-row">
      {(rail ?? inherited) && <div className="generation-media-shell rounded-[1.05rem] border border-white/12 bg-black/24 p-3 backdrop-blur-xl sm:p-4">{rail ?? inherited}</div>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function useVerticalMediaRail() {
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setVertical(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return vertical;
}
