import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(
  resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

describe("global CSS boundaries", () => {
  it("uses the body sans family for general headings and scopes the legacy font", () => {
    const root = globalsCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(root).toContain("--font-heading: var(--font-body)");
    expect(root).not.toContain("serif");
    expect(globalsCss).not.toContain("body[data-legacy-spaces]");
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

  it("leaves application timelines to Motion", () => {
    expect(globalsCss).not.toContain("@keyframes");
    expect(globalsCss).not.toMatch(/animation:\s*lf-/);
  });

  it("keeps project scrollbar treatment available globally", () => {
    expect(globalsCss).toContain(".app-scrollbar");
    expect(globalsCss).toContain("*::-webkit-scrollbar-thumb");
    expect(globalsCss).toContain(
      "scrollbar-color: rgba(255, 255, 255, 0.18) transparent",
    );
  });
});
