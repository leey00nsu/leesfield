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
        "lf-editorial-panel lf-outline-map relative w-full overflow-hidden rounded-[2rem] text-center text-white",
        className,
      )}
      {...props}
    >
      <div className="relative z-10 flex min-h-[34rem] flex-col items-center justify-center gap-8 p-8 md:p-12 lg:p-16">
        <h2 className="lf-serif max-w-4xl text-[clamp(3.5rem,6vw,7rem)] leading-[0.95]">
          {title}
        </h2>
        <Button
          asChild
          variant="hero"
          className="h-16 rounded-full px-12 text-lg normal-case tracking-normal"
        >
          <Link href={href}>
            {buttonText}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
