import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("global CSS boundaries", () => {
  it("keeps Nanum Myeongjo as the display point font fallback", () => {
    expect(globalsCss).toContain(
      '--font-heading: "Nanum Myeongjo", Georgia, "Times New Roman", serif;',
    );
  });

  it("does not keep project editorial surface recipes in global CSS", () => {
    const legacyClassNames = [
      [".lf", "editorial", "panel"].join("-"),
      [".lf", "editorial", "card"].join("-"),
      [".lf", "editorial", "page"].join("-"),
      [".lf", "serif"].join("-"),
      [".lf", "eyebrow"].join("-"),
      [".lf", "outline", "map"].join("-"),
    ];

    for (const className of legacyClassNames) {
      expect(globalsCss).not.toContain(className);
    }
  });

  it("keeps the legacy shader keyframes available without relying on hero wrapper CSS", () => {
    expect(globalsCss).toContain("@keyframes lf-shader-fade");
    expect(globalsCss).not.toContain(".lf-hero-shader-fade");
  });

  it("keeps motion helpers global because keyframes and pseudo selectors are global concerns", () => {
    expect(globalsCss).toContain(".lf-text-generate-word");
    expect(globalsCss).toContain(".lf-motion-card-a");
    expect(globalsCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps project scrollbar treatment available globally", () => {
    expect(globalsCss).toContain(".app-scrollbar");
    expect(globalsCss).toContain("*::-webkit-scrollbar-thumb");
    expect(globalsCss).toContain("scrollbar-color: rgba(255, 255, 255, 0.18) transparent");
  });
});
