"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { RevealContent } from "@/shared/ui/brand/reveal-content/reveal-content";
import { AppButton } from "@/shared/ui/app-button";
const Canvas = dynamic(() => import("./landing-spaces-canvas"), { ssr: false });
export function LandingSpacesSection() {
  const t = useTranslations("inferenceLanding.spaces");
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section id="spaces" ref={ref} className="w-full py-20 sm:py-28">
      <RevealContent suppressHydrationWarning variant="section">
        <div className="mx-auto mb-9 flex max-w-6xl px-6 flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm text-data-accent-foreground">{t("label")}</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <AppButton
            asChild
            variant="surface"
            className="self-start shrink-0 sm:self-auto"
          >
            <Link href="/spaces">
              {t("action")}
              <ArrowUpRight />
            </Link>
          </AppButton>
        </div>
        <div
          className="relative h-[470px] w-full sm:h-[760px] [mask-image:linear-gradient(to_bottom,transparent,black_7%,black_93%,transparent)]"
          data-testid="landing-spaces-slot"
        >
          {visible ? (
            <Canvas />
          ) : (
            <div
              className="flex h-[470px] items-center justify-center bg-transparent text-sm text-muted-foreground sm:h-[760px]"
              role="status"
            >
              {t("loading")}
            </div>
          )}
        </div>
      </RevealContent>
    </section>
  );
}
