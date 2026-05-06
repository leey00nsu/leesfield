import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { AppButton } from "@/shared/ui/app-button";
import { AppCard } from "@/shared/ui/app-card";
import { AppHeading } from "@/shared/ui/app-typography";

type CtaCardProps = React.ComponentProps<"div"> & {
  title: string;
  buttonText: string;
  href: string;
};

export function CtaCard({ className, title, buttonText, href, ...props }: CtaCardProps) {
  return (
    <AppCard
      variant="outline-map"
      className={cn(
        "w-full rounded-[2rem] text-center",
        className,
      )}
      {...props}
    >
      <div className="relative z-10 flex min-h-[34rem] flex-col items-center justify-center gap-8 p-8 md:p-12 lg:p-16">
        <AppHeading as="h2" size="section" className="max-w-4xl text-[clamp(3.5rem,6vw,7rem)] leading-[0.95]">
          {title}
        </AppHeading>
        <AppButton
          asChild
          size="xl"
          className="rounded-full px-12 text-lg"
        >
          <Link href={href}>
            {buttonText}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </AppButton>
      </div>
    </AppCard>
  );
}
