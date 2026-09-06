import type { ComponentProps } from "react";
import { Card, CardHeader, CardContent, CardFooter } from "@/shared/ui/card";
type Props = ComponentProps<typeof Card> & {
  variant?:
    | "editorial"
    | "editorial-flat"
    | "outline-map"
    | "prompt"
    | "result"
    | "plain";
  padding?: "none" | "sm" | "md" | "lg";
  radius?: "md" | "lg" | "xl";
};
export function AppCard({
  variant = "editorial",
  padding,
  radius,
  ...props
}: Props) {
  void radius;
  return (
    <Card data-app-card="" data-variant={variant} {...props}>
      {padding && padding !== "none" ? (
        <CardContent>{props.children}</CardContent>
      ) : (
        props.children
      )}
    </Card>
  );
}
export {
  CardHeader as AppCardHeader,
  CardContent as AppCardContent,
  CardFooter as AppCardFooter,
};
