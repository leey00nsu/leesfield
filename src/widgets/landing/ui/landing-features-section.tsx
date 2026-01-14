import { Boxes, History, Palette, Terminal } from "lucide-react";

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

export function LandingFeaturesSection() {
  return (
    <>
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
    </>
  );
}
