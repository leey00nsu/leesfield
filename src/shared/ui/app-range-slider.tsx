"use client";
import { Slider } from "@base-ui/react/slider";
export function AppRangeSlider({
  value,
  onValueChange,
  min,
  max,
  step,
  disabled,
  labels,
}: {
  value: number[];
  onValueChange: (value: number[]) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  labels: string[];
}) {
  return (
    <Slider.Root
      className="nodrag w-full py-2 data-disabled:opacity-50"
      value={value}
      onValueChange={onValueChange}
      min={min}
      max={max}
      step={step}
      minStepsBetweenValues={value.length > 1 ? 1 : 0}
      disabled={disabled}
    >
      <Slider.Control className="relative flex h-5 w-full touch-none items-center">
        <Slider.Track className="h-1.5 w-full rounded-full bg-muted">
          <Slider.Indicator className="rounded-full bg-data-accent" />
          {value.map((_, index) => (
            <Slider.Thumb
              key={index}
              aria-label={labels[index]}
              className="size-4 rounded-full border border-border bg-background ring-data-accent/40 focus-within:ring-3"
            />
          ))}
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}
