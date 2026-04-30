import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("editorial surface CSS", () => {
  it("uses one subtle gradient treatment for shared card and panel surfaces", () => {
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
