import Link from "next/link";
import { AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/shared/ui/button";

export function ApiDocsAuthSection() {
  return (
    <section id="authentication" className="flex flex-col gap-8 scroll-mt-32">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
          <KeyRound className="h-5 w-5 text-primary" />
          인증
        </h2>
        <p className="text-gray-400 leading-relaxed">
          모든 요청은 API 키 인증이 필요합니다. 키는{" "}
          <Link href="/api-key" className="text-primary hover:underline">
            API 키 관리
          </Link>{" "}
          화면에서 확인할 수 있습니다.
        </p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-surface-dark shadow-lg">
        <div className="flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-300 font-mono">
            헤더 인증
          </span>
          <Button
            asChild
            variant="outline"
            className="h-8 rounded-full border-white/10 bg-surface-lighter px-3 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10"
          >
            <Link href="/api-key">API 키 보기</Link>
          </Button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-400">
            모든 요청에{" "}
            <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-primary">
              X-API-Key
            </code>{" "}
            헤더를 포함하세요.
          </p>
          <div className="mt-4 rounded-lg border border-white/5 bg-black/50 p-4 font-mono text-sm text-gray-300">
            <span className="text-accent-purple">curl</span>{" "}
            https://api.leesfield.ai/v1/models \
            <div className="pl-4 mt-1">
              -H{" "}
              <span className="text-green-400">
                &quot;X-API-Key: lf_live_...&quot;
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="text-xs text-gray-400">
              API 키는 외부에 노출되지 않도록 안전하게 보관하세요.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
