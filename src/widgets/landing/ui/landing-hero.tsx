import Link from "next/link";
import { Zap } from "lucide-react";
import { Button } from "@/shared/ui/button";

export function LandingHero() {
  return (
    <section className="border-b border-white/5 bg-background-dark/95 px-6 py-10 sm:px-10">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-6xl">
              <span className="text-white">LEES</span>
              <span className="text-primary">FIELD</span>
            </h1>
            <p className="mt-3 flex items-center gap-2 text-xs font-mono tracking-wide text-gray-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              AI 생성 플랫폼 · 시스템 온라인
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild size="lg" variant="hero">
              <Link href="/image">
                <Zap className="h-4 w-4" />
                생성 시작
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-xl border-white/10 bg-surface-dark text-white hover:border-white hover:bg-white/5"
            >
              <Link href="/api-docs">데모 보기</Link>
            </Button>
          </div>
        </div>

        <p className="max-w-3xl text-lg text-gray-300 leading-relaxed sm:text-xl">
          leesfield는 창작을 위한 몰입형 생성 인터페이스입니다. 캔버스처럼
          직관적인 UI와 강력한 모델을 결합해 아이디어를 즉시 시각화합니다.
        </p>
      </div>
    </section>
  );
}
