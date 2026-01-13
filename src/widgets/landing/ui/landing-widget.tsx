import Link from "next/link";
import {
  Boxes,
  History,
  Palette,
  Terminal,
  Zap,
} from "lucide-react";
import { Header } from "@/widgets/header/ui/header";
import { Button } from "@/shared/ui/button";

const featureCards = [
  {
    title: "캔버스 기반 생성",
    description:
      "무한 캔버스에서 생성 결과를 배치하고 비교하며 빠르게 반복할 수 있습니다.",
    icon: Palette,
  },
  {
    title: "생성 히스토리",
    description:
      "모든 프롬프트와 설정을 보관해 언제든 동일한 결과로 되돌릴 수 있습니다.",
    icon: History,
  },
  {
    title: "모델 관리",
    description:
      "이미지/비디오 모델을 상황에 맞게 전환하고 최적의 결과를 얻습니다.",
    icon: Boxes,
  },
  {
    title: "개발자 API",
    description:
      "REST API로 워크플로우를 자동화하고 자체 서비스에 생성 기능을 통합합니다.",
    icon: Terminal,
  },
];

const showcaseTiles = [
  "from-primary/20 via-transparent to-primary/40",
  "from-emerald-500/20 via-transparent to-emerald-500/40",
  "from-sky-400/20 via-transparent to-sky-400/40",
  "from-fuchsia-500/20 via-transparent to-fuchsia-500/40",
  "from-orange-400/20 via-transparent to-orange-400/40",
  "from-indigo-400/20 via-transparent to-indigo-400/40",
  "from-teal-400/20 via-transparent to-teal-400/40",
  "from-rose-400/20 via-transparent to-rose-400/40",
];

type LandingWidgetProps = {
  isAuthenticated: boolean;
  userEmail: string | null;
};

export function LandingWidget({
  isAuthenticated,
  userEmail,
}: LandingWidgetProps) {
  return (
    <div className="min-h-screen bg-background-dark text-white">
      <Header
        variant="public"
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
      />

      <main className="flex flex-col">
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
                  개인 AI 생성 플랫폼 // 시스템 온라인
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

        <section className="px-6 pb-20 pt-12 sm:px-10">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-16">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold uppercase tracking-widest text-white">
                핵심 기능
              </h2>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              {featureCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className="group rounded-2xl border border-white/5 bg-surface-dark p-6 transition-all duration-300 hover:border-primary/50 hover:bg-surface-lighter"
                  >
                    <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mb-2 text-lg font-bold text-white">
                      {card.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-400">
                      {card.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              <h2 className="text-xl font-bold uppercase tracking-widest text-white">
                커뮤니티 쇼케이스
              </h2>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {showcaseTiles.map((gradient, index) => (
                <div
                  key={`showcase-${gradient}-${index}`}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-white/5 bg-black"
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100`}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-bold uppercase">
                      프롬프트 보기
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-surface-dark/80 px-8 py-10">
              <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    지금 바로 leesfield로 시작하세요
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    강력한 생성 모델과 직관적인 워크플로우를 한 번에 경험할 수
                    있습니다.
                  </p>
                </div>
                <Button asChild size="lg" variant="hero">
                  <Link href="/login">대시보드로 이동</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
