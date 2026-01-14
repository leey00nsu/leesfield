import { BookOpen, ShieldCheck, Zap } from "lucide-react";

const highlightCards = [
  {
    title: "낮은 지연",
    description: "최적화된 추론 파이프라인으로 빠르게 생성합니다.",
    icon: Zap,
  },
  {
    title: "보안",
    description: "스코프된 API 키로 안전하게 보호합니다.",
    icon: ShieldCheck,
  },
  {
    title: "RESTful",
    description: "일관된 REST 구조로 쉽게 연동할 수 있습니다.",
    icon: BookOpen,
  },
];

interface ApiDocsIntroSectionProps {
  introTitle: string;
  introDescription: string;
  apiVersion: string;
}

export function ApiDocsIntroSection({
  introTitle,
  introDescription,
  apiVersion,
}: ApiDocsIntroSectionProps) {
  return (
    <section id="introduction" className="flex flex-col gap-6 scroll-mt-32">
      <div>
        <h2 className="text-4xl font-black uppercase leading-tight tracking-[-0.033em] text-white sm:text-5xl">
          <span className="text-white">API</span>{" "}
          <span className="text-primary">문서</span>
        </h2>
        <p className="mt-2 text-xs font-mono uppercase tracking-widest text-gray-500">
          {introTitle} · {apiVersion}
        </p>
        <p className="mt-4 text-lg text-gray-400 leading-relaxed max-w-3xl">
          {introDescription}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {highlightCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="rounded-2xl border border-white/5 bg-surface-dark p-5 transition-colors hover:border-primary/30"
            >
              <div className="mb-3 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-white">{card.title}</h3>
              <p className="mt-2 text-sm text-gray-500">{card.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
