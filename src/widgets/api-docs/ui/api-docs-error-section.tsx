import { AlertTriangle } from "lucide-react";
import { Badge } from "@/shared/ui/badge";

const errorCards = [
  {
    status: "400",
    title: "잘못된 요청",
    description: "요청 본문이 유효하지 않습니다.",
  },
  {
    status: "401",
    title: "인증 실패",
    description: "API 키가 없거나 올바르지 않습니다.",
  },
  {
    status: "403",
    title: "접근 거부",
    description: "키가 폐기되었거나 권한이 없습니다.",
  },
  {
    status: "500",
    title: "서버 오류",
    description: "서버에서 예기치 않은 오류가 발생했습니다.",
  },
];

const errorResponseSnippet = `{
  "message": "INVALID_REQUEST",
  "errors": [
    {
      "field": "prompt",
      "messages": ["필수 입력입니다."]
    }
  ]
}`;

export function ApiDocsErrorSection() {
  return (
    <section id="errors" className="flex flex-col gap-8 scroll-mt-32">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
          <AlertTriangle className="h-5 w-5 text-primary" />
          오류
        </h2>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          모든 오류 응답은 동일한 구조를 사용합니다.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {errorCards.map((card) => (
          <div
            key={card.status}
            className="rounded-2xl border border-white/5 bg-surface-dark p-5"
          >
            <div className="flex items-center gap-3">
              <Badge variant="muted" size="md" className="px-2.5 py-1 text-gray-300">
                {card.status}
              </Badge>
              <h3 className="text-sm font-bold text-white">{card.title}</h3>
            </div>
            <p className="mt-3 text-sm text-gray-400">{card.description}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/5 bg-black/60 p-6">
        <p className="text-xs font-mono uppercase tracking-wider text-gray-500">
          오류 응답 예시
        </p>
        <pre className="mt-3 overflow-x-auto text-sm text-gray-300">
          {errorResponseSnippet}
        </pre>
      </div>
    </section>
  );
}
