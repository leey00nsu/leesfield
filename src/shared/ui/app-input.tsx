import type { ComponentProps } from "react";
import { Input } from "@/shared/ui/input";
type Props = Omit<ComponentProps<typeof Input>, "size"> & {
  surface?: "default" | "toolbar" | "auth" | "transparent";
  inputSize?: "md" | "lg";
};
export const appInputShellClassName =
  "h-10 rounded-md border border-input bg-background px-3 py-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";
export const appInputSurfaceClassName =
  "w-full disabled:cursor-not-allowed disabled:opacity-60";
export function AppInput({ surface = "default", inputSize, ...props }: Props) {
  void inputSize;
  return <Input data-app-input="" data-surface={surface} {...props} />;
}
