import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("editorial surface CSS", () => {
  it("uses the original footer gradient geometry for shared card and panel surfaces", () => {
    const panelBlock = globalsCss.match(
      /\.lf-editorial-panel\s*{[\s\S]*?}\n/,
    )?.[0];
    const cardBlock = globalsCss.match(
      /\.lf-editorial-card\s*{[\s\S]*?}\n/,
    )?.[0];

    expect(globalsCss).toMatch(
      /\.lf-editorial-panel\s*{[\s\S]*?radial-gradient/,
    );
    expect(globalsCss).toMatch(
      /\.lf-editorial-card\s*{[\s\S]*?radial-gradient/,
    );
    expect(panelBlock).toContain("circle at 50% 0%");
    expect(panelBlock).toContain("transparent 28rem");
    expect(panelBlock).toContain("linear-gradient");
    expect(panelBlock).toContain("180deg");
    expect(cardBlock).toContain("circle at 50% 0%");
    expect(cardBlock).toContain("transparent 28rem");
    expect(cardBlock).toContain("linear-gradient");
    expect(cardBlock).toContain("180deg");
    expect(panelBlock).toContain("rgba(212, 240, 50, 0.052)");
    expect(cardBlock).toContain("rgba(212, 240, 50, 0.052)");
    expect(panelBlock).not.toContain("rgba(212, 240, 50, 0.075)");
    expect(cardBlock).not.toContain("rgba(212, 240, 50, 0.075)");
    expect(panelBlock).toContain("rgba(15, 17, 12, 0.84)");
    expect(panelBlock).toContain("rgba(5, 6, 4, 0.9)");
    expect(cardBlock).toContain("rgba(15, 17, 12, 0.84)");
    expect(cardBlock).toContain("rgba(5, 6, 4, 0.9)");
    expect(panelBlock).not.toMatch(/radial-gradient\([^)]*oklch/);
    expect(cardBlock).not.toMatch(/radial-gradient\([^)]*oklch/);
  });

  it("keeps the legacy shader keyframes available without relying on hero wrapper CSS", () => {
    expect(globalsCss).toContain("@keyframes lf-shader-fade");
    expect(globalsCss).not.toContain(".lf-hero-shader-fade");
  });

  it("adds a decorative topographic pattern to the landing CTA outline map", () => {
    const outlineBlock = globalsCss.match(
      /\.lf-outline-map\s*{[\s\S]*?}\n/,
    )?.[0];
    const patternBlock = globalsCss.match(
      /\.lf-outline-map::before\s*{[\s\S]*?}\n/,
    )?.[0];
    const overlayBlock = globalsCss.match(
      /\.lf-outline-map::after\s*{[\s\S]*?}\n/,
    )?.[0];

    expect(outlineBlock).toContain("isolation: isolate");
    expect(outlineBlock).toContain("linear-gradient");
    expect(patternBlock).toContain("data:image/svg+xml");
    expect(patternBlock).toContain("stroke-dasharray");
    expect(patternBlock).toContain("pointer-events: none");
    expect(overlayBlock).toContain("radial-gradient");
    expect(overlayBlock).toContain("pointer-events: none");
  });
});
