"use client";

// Shared SVG gradient definitions for all edge types.
// Rendered once inside the React Flow SVG layer to avoid duplicating
// <defs>/<linearGradient> in every edge component.

const EDGE_COLORS: Record<string, string> = {
  image: "#0d9668",
  prompt: "#2563eb",
  default: "#64748b",
  pause: "#ea580c",
  reference: "#52525b",
  video: "#ec4899",
  audio: "#f97316",
  text: "#2563eb",
  "3d": "#06b6d4",
  easeCurve: "#f59e0b",
  loop: "#d946ef",
};

const SELECTION_STATES = ["active", "dimmed"] as const;

function gradientStops(color: string, active: boolean) {
  return (
    <>
      <stop offset="0%" stopColor={color} stopOpacity={active ? 1 : 0.25} />
      <stop offset="50%" stopColor={color} stopOpacity={active ? 0.55 : 0.1} />
      <stop offset="100%" stopColor={color} stopOpacity={active ? 1 : 0.25} />
    </>
  );
}

export function getSharedGradientId(colorKey: string, selectionKey: "active" | "dimmed") {
  return `edge-grad-${colorKey}-${selectionKey}`;
}

export function SharedEdgeGradients() {
  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        {Object.entries(EDGE_COLORS).flatMap(([colorKey, color]) =>
          SELECTION_STATES.map((sel) => (
            <linearGradient
              key={`${colorKey}-${sel}`}
              id={getSharedGradientId(colorKey, sel)}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              {gradientStops(color, sel === "active")}
            </linearGradient>
          ))
        )}
      </defs>
    </svg>
  );
}
