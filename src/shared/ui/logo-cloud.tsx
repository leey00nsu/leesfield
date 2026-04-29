import { cn } from "@/shared/lib/utils";
import { InfiniteSlider } from "@/shared/ui/infinite-slider";

type Logo = {
  label: string;
};

type LogoCloudProps = React.ComponentProps<"div"> & {
  logos: Logo[];
};

export function LogoCloud({ className, logos, ...props }: LogoCloudProps) {
  return (
    <div
      {...props}
      className={cn(
        "overflow-hidden py-4 [mask-image:linear-gradient(to_right,transparent,black,transparent)]",
        className,
      )}
    >
      <InfiniteSlider gap={42} reverse duration={42} durationOnHover={70}>
        {logos.map((logo) => (
          <span
            key={`logo-${logo.label}`}
            className="pointer-events-none select-none whitespace-nowrap text-lg font-black uppercase tracking-[0.18em] text-white/70 md:text-xl"
          >
            {logo.label}
          </span>
        ))}
      </InfiniteSlider>
    </div>
  );
}
