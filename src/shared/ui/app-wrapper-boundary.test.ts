import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    const stats = statSync(filePath);
    if (stats.isDirectory()) return collectSourceFiles(filePath);
    return /\.(ts|tsx)$/.test(entry) ? [filePath] : [];
  });
}

const sourceFiles = collectSourceFiles(sourceRoot);
const legacyClassNames = [
  ["lf", "editorial", "panel"].join("-"),
  ["lf", "editorial", "card"].join("-"),
  ["lf", "editorial", "page"].join("-"),
  ["lf", "serif"].join("-"),
  ["lf", "eyebrow"].join("-"),
  ["lf", "outline", "map"].join("-"),
];
const rawCardModule = ["@", "shared", "ui", "card"].join("/");

describe("app-* design wrapper boundaries", () => {
  it("keeps project editorial styles out of legacy global utility classes", () => {
    const offenders = sourceFiles.flatMap((filePath) => {
      const contents = readFileSync(filePath, "utf8");
      return legacyClassNames.some((className) => contents.includes(className))
        ? [relative(process.cwd(), filePath)]
        : [];
    });

    expect(offenders).toEqual([]);
  });

  it("keeps project button variants behind AppButton", () => {
    const rawProjectButtonPattern =
      /<Button\b[\s\S]{0,320}variant=(?:"(?:hero|surface)"|\{[^}]*"surface")/;
    const offenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (relativePath.endsWith("src/shared/ui/app-button.tsx")) return [];

      const contents = readFileSync(filePath, "utf8");
      return rawProjectButtonPattern.test(contents) ? [relativePath] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("keeps project card surfaces behind AppCard", () => {
    const offenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (relativePath.endsWith("src/shared/ui/app-card.tsx")) return [];

      const contents = readFileSync(filePath, "utf8");
      return contents.includes(rawCardModule) ? [relativePath] : [];
    });

    expect(offenders).toEqual([]);
  });
});
