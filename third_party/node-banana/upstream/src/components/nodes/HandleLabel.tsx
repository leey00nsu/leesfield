interface HandleLabelProps {
  label: string;
  side: "target" | "source";
  color: string;
  top?: string;
  visible: boolean;
  opacity?: number;
}

export function HandleLabel({ label, side, color, top = "calc(50% - 18px)", visible, opacity }: HandleLabelProps) {
  const positionStyle = side === "target"
    ? { right: "calc(100% + 8px)" }
    : { left: "calc(100% + 8px)" };

  return (
    <div
      className={`absolute text-[10px] font-medium whitespace-nowrap pointer-events-none${side === "target" ? " text-right" : ""}`}
      style={{
        ...positionStyle,
        top,
        color,
        zIndex: 10,
        opacity: visible ? (opacity ?? 1) : 0,
        transition: "opacity 150ms ease-in-out",
      }}
    >
      {label}
    </div>
  );
}
