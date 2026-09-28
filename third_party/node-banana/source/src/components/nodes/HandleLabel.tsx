interface HandleLabelProps {
  label: string;
  side: "target" | "source";
  color: string;
  top?: string;
  visible: boolean;
  opacity?: number;
}

// Icon handles provide their own accessible names; legacy visual labels are redundant.
export function HandleLabel(_props: HandleLabelProps) {
  return null;
}
