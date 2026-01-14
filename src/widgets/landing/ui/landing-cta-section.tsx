import Link from "next/link";
import { Button } from "@/shared/ui/button";

export function LandingCtaSection() {
  return (
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
  );
}
