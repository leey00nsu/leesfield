import type { ComponentProps } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/shared/ui/card";
import { cn } from "@/shared/lib/utils";

type AppCardVariant =
  | "editorial"
  | "editorial-flat"
  | "outline-map"
  | "prompt"
  | "result"
  | "plain";

type AppCardProps = ComponentProps<typeof Card> & {
  variant?: AppCardVariant;
  padding?: "none" | "sm" | "md" | "lg";
  radius?: "md" | "lg" | "xl";
};

const editorialBackground =
  "[background:radial-gradient(circle_at_50%_0%,rgba(212,240,50,0.052),transparent_28rem),linear-gradient(180deg,rgba(15,17,12,0.84),rgba(5,6,4,0.9))]";

const variantClasses: Record<AppCardVariant, string> = {
  editorial: cn(
    "border-white/14 text-white shadow-[0_34px_110px_oklch(0_0_0_/_0.45)]",
    editorialBackground,
  ),
  "editorial-flat": cn("border-white/14 text-white", editorialBackground),
  "outline-map":
    "isolate overflow-hidden border-white/19 bg-[linear-gradient(135deg,#1c1c19_0%,#11110f_48%,#191916_100%)] text-white shadow-[0_44px_120px_rgba(0,0,0,0.72)]",
  prompt: cn(
    "border-white/12 bg-black/18 text-white transition-colors focus-within:border-primary/45",
  ),
  result: "border-white/10 bg-background/40 text-white",
  plain: "border-white/10 bg-transparent text-white shadow-none",
};

const appCardPaddingClassNames: Record<NonNullable<AppCardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const appCardRadiusClassNames: Record<NonNullable<AppCardProps["radius"]>, string> = {
  md: "rounded-[1rem]",
  lg: "rounded-[1.1rem]",
  xl: "rounded-[1.6rem]",
};

const outlinePatternSvg =
  "url(\"data:image/svg+xml,%3Csvg width='1200' height='460' viewBox='0 0 1200 460' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.22' stroke-width='1' stroke-linecap='round' stroke-dasharray='5 6'%3E%3Cpath d='M-70 68 C 48 -48, 158 -14, 204 104 C 248 213, 211 307, 371 395 C 499 465, 696 506, 760 356 C 820 216, 640 151, 452 26'/%3E%3Cpath d='M34 504 C 147 385, 141 264, 98 151 C 61 52, 5 17, 104 -55'/%3E%3Cpath d='M355 -44 C 500 104, 663 91, 794 160 C 897 215, 964 338, 924 506'/%3E%3Cpath d='M650 -36 C 752 42, 892 46, 995 156 C 1083 250, 1089 307, 1250 373'/%3E%3Cpath d='M1082 -42 C 1093 91, 1092 153, 1138 211 C 1178 260, 1218 300, 1283 318'/%3E%3Cpath d='M-92 211 C 57 231, 31 404, 167 517'/%3E%3Cpath d='M-30 -20 C 62 42, 82 92, 94 147 C 117 253, 120 338, 213 424 C 292 497, 348 518, 455 531'/%3E%3Cpath d='M692 -54 C 744 -6, 815 9, 892 31 C 1004 64, 1059 134, 1106 228 C 1138 292, 1196 338, 1266 372'/%3E%3C/g%3E%3C/svg%3E\")";

export function AppCard({
  variant = "editorial",
  padding = "none",
  radius,
  className,
  children,
  ...props
}: AppCardProps) {
  const isOutlineMap = variant === "outline-map";

  return (
    <Card
      data-app-card=""
      data-variant={variant}
      className={cn(
        "relative gap-0 overflow-hidden py-0",
        variantClasses[variant],
        radius ? appCardRadiusClassNames[radius] : null,
        appCardPaddingClassNames[padding],
        className,
      )}
      {...props}
    >
      {isOutlineMap ? (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 opacity-45 [background-position:center] [background-repeat:no-repeat] [background-size:100%_100%]"
            style={{ backgroundImage: outlinePatternSvg }}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,transparent_0_42%,rgba(0,0,0,0.34)_100%),linear-gradient(to_bottom,rgba(255,255,255,0.045),transparent_32%,rgba(0,0,0,0.18))]"
          />
          <div className="relative z-10">{children}</div>
        </>
      ) : (
        children
      )}
    </Card>
  );
}

export function AppCardHeader({
  className,
  ...props
}: ComponentProps<typeof CardHeader>) {
  return (
    <CardHeader
      data-app-card-header=""
      className={cn("px-0", className)}
      {...props}
    />
  );
}

export function AppCardContent({
  className,
  ...props
}: ComponentProps<typeof CardContent>) {
  return (
    <CardContent
      data-app-card-content=""
      className={cn("px-0", className)}
      {...props}
    />
  );
}

export function AppCardFooter({
  className,
  ...props
}: ComponentProps<typeof CardFooter>) {
  return (
    <CardFooter
      data-app-card-footer=""
      className={cn("px-0", className)}
      {...props}
    />
  );
}
