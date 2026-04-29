import type React from "react";
import { useId } from "react";
import { cn } from "@/shared/lib/utils";

type FeatureType = {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
};

type FeatureCardProps = React.ComponentProps<"div"> & {
  feature: FeatureType;
  patternSeed?: number;
};

export function FeatureCard({
  feature,
  patternSeed = 0,
  className,
  ...props
}: FeatureCardProps) {
  const squares = getPattern(patternSeed);
  const Icon = feature.icon;

  return (
    <div className={cn("relative overflow-hidden p-6", className)} {...props}>
      <div className="pointer-events-none absolute left-1/2 top-0 -ml-20 -mt-2 h-full w-full opacity-60">
        <div className="absolute inset-0">
          <GridPattern
            width={20}
            height={20}
            x="-12"
            y="4"
            squares={squares}
            className="absolute inset-0 h-full w-full fill-white/5 stroke-white/20 mix-blend-overlay"
          />
        </div>
      </div>
      <Icon
        className="relative z-10 h-6 w-6 text-primary/90"
        strokeWidth={1.5}
        aria-hidden
      />
      <h3 className="relative z-10 mt-10 text-sm font-semibold text-white md:text-base">
        {feature.title}
      </h3>
      <p className="relative z-10 mt-2 text-xs leading-5 text-gray-400">
        {feature.description}
      </p>
    </div>
  );
}

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  ...props
}: React.ComponentProps<"svg"> & {
  width: number;
  height: number;
  x: string;
  y: string;
  squares?: number[][];
}) {
  const patternId = useId();

  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern
          id={patternId}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      {squares ? (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([squareX, squareY], index) => (
            <rect
              strokeWidth="0"
              key={`${squareX}-${squareY}-${index}`}
              width={width + 1}
              height={height + 1}
              x={squareX * width}
              y={squareY * height}
            />
          ))}
        </svg>
      ) : null}
    </svg>
  );
}

function getPattern(seed: number): number[][] {
  const base = [
    [7, 1],
    [9, 2],
    [8, 4],
    [10, 5],
    [7, 6],
  ];

  return base.map(([x, y], index) => [
    x + ((seed + index) % 2),
    y + ((seed + index) % 3 === 0 ? 1 : 0),
  ]);
}
