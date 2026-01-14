import { Badge } from "@/shared/ui/badge";

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

export function LandingShowcaseSection() {
  return (
    <>
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
              className={`absolute inset-0 bg-linear-to-br ${gradient} opacity-80 transition-transform duration-700 group-hover:scale-105 group-hover:opacity-100`}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Badge variant="overlay" size="md" className="px-4 py-2">
                프롬프트 보기
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
