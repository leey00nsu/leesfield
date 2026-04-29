import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type CtaCardProps = React.ComponentProps<"div"> & {
  title: string;
  buttonText: string;
  href: string;
};

export function CtaCard({ className, title, buttonText, href, ...props }: CtaCardProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0d1114] text-white shadow-2xl shadow-black/30",
        className,
      )}
      {...props}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(212,240,50,0.24),transparent_32%),radial-gradient(circle_at_82%_65%,rgba(55,183,178,0.2),transparent_34%),linear-gradient(135deg,#11161a,#050607)]" />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.08),transparent)]" />
      <div className="relative z-10 flex flex-col items-start justify-between gap-8 p-8 md:flex-row md:items-center md:p-12 lg:p-16">
        <h2 className="max-w-3xl text-4xl font-black uppercase leading-[0.95] md:text-6xl">
          {title}
        </h2>
        <Button asChild variant="hero" size="lg" className="rounded-full px-7">
          <Link href={href}>
            {buttonText}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
