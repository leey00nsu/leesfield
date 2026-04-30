import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("editorial surface CSS", () => {
  it("uses one subtle gradient treatment for shared card and panel surfaces", () => {
    expect(globalsCss).toMatch(
      /\.lf-editorial-panel\s*{[\s\S]*?radial-gradient/,
    );
    expect(globalsCss).toMatch(
      /\.lf-editorial-card\s*{[\s\S]*?radial-gradient/,
    );
  });

  it("animates the hero shader in while respecting reduced motion", () => {
    expect(globalsCss).toContain(".lf-hero-shader-fade");
    expect(globalsCss).toContain("@keyframes lf-hero-shader-fade-in");
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalsCss).toMatch(
      /\.lf-hero-shader-fade\s*{[\s\S]*?animation:\s*none/,
    );
  });
});
