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
    expect(panelBlock).toContain("rgba(");
    expect(cardBlock).toContain("rgba(");
    expect(panelBlock).not.toMatch(/radial-gradient\([^)]*oklch/);
    expect(cardBlock).not.toMatch(/radial-gradient\([^)]*oklch/);
  });

  it("keeps the legacy shader keyframes available without relying on hero wrapper CSS", () => {
    expect(globalsCss).toContain("@keyframes lf-shader-fade");
    expect(globalsCss).not.toContain(".lf-hero-shader-fade");
  });
});
