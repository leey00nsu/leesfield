import { ImageResponse } from "next/og";
export const alt = "Leesfield — AI inference platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0a0a0a",
        color: "#fafafa",
        width: "100%",
        height: "100%",
        padding: "64px",
      }}
    >
      <div style={{ display: "flex", fontSize: 32, color: "#8bc1f6" }}>
        leesfield
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 64, letterSpacing: -3 }}>
          Multiple AI models.
        </div>
        <div style={{ fontSize: 64, letterSpacing: -3, color: "#347ff4" }}>
          One execution environment.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: "#a3a3a3" }}>
        Runtime catalog · Async jobs · External API · Monitoring
      </div>
    </div>,
    size,
  );
}
