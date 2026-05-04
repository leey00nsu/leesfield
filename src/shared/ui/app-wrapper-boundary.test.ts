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
const rawUiModules = [
  "avatar",
  "badge",
  "button",
  "chart",
  "checkbox",
  "dialog",
  "dropdown-menu",
  "form",
  "input",
  "label",
  "popover",
  "select",
  "textarea",
];
const rawUiImportPattern = new RegExp(
  `from\\s+["']@/shared/ui/(${rawUiModules.join("|")})["']`,
);

function isAllowedRawUiImportFile(relativePath: string) {
  if (!relativePath.startsWith("src/shared/ui/")) return false;
  const fileName = relativePath.split("/").at(-1) ?? "";

  if (fileName.startsWith("app-")) return true;
  if (["alert-dialog.tsx", "calendar.tsx"].includes(fileName)) return true;
  return rawUiModules.some((moduleName) => fileName === `${moduleName}.tsx`);
}

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

  it("keeps base shadcn primitives behind app-* wrappers outside the base layer", () => {
    const offenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (isAllowedRawUiImportFile(relativePath)) return [];

      const contents = readFileSync(filePath, "utf8");
      return rawUiImportPattern.test(contents) ? [relativePath] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("keeps project input fields behind the dedicated AppInput wrapper", () => {
    const offenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (relativePath.endsWith("src/shared/ui/app-form-control.tsx")) return [];

      const contents = readFileSync(filePath, "utf8");
      const importsFormControlInput =
        /import\s+\{[^}]*\bAppInput\b[^}]*\}\s+from\s+["']@\/shared\/ui\/app-form-control["']/.test(
          contents,
        );
      return importsFormControlInput ? [relativePath] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("keeps expandable text surfaces on the wrapper instead of the body slot", () => {
    const offenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      const contents = readFileSync(filePath, "utf8");
      return /bodyClassName=["'][^"']*\brounded-/.test(contents)
        ? [relativePath]
        : [];
    });

    expect(offenders).toEqual([]);
  });

  it("keeps search fields on the shared AppInput surface", () => {
    const appInput = readFileSync(
      join(sourceRoot, "shared/ui/app-input.tsx"),
      "utf8",
    );
    const appFilterToolbar = readFileSync(
      join(sourceRoot, "shared/ui/app-filter-toolbar.tsx"),
      "utf8",
    );
    const apiDocsSidebar = readFileSync(
      join(sourceRoot, "widgets/api-docs/ui/api-docs-sidebar.tsx"),
      "utf8",
    );

    expect(appInput).toContain("appInputSurfaceClassName");
    expect(appFilterToolbar).toContain("appInputSurfaceClassName");
    expect(appFilterToolbar).toContain("data-app-search-input");
    expect(appFilterToolbar).toContain("dark:bg-transparent");
    expect(appFilterToolbar).not.toContain("<AppInput");
    expect(apiDocsSidebar).not.toMatch(
      /<AppSearchField[^>]*(containerClassName|className)=/,
    );
  });

  it("keeps model management modal surfaces behind app wrappers", () => {
    const modelScreen = readFileSync(
      join(sourceRoot, "screens/model-management/ui/model-management-screen.tsx"),
      "utf8",
    );
    const forbiddenImports = [
      '@/shared/ui/button',
      '@/shared/ui/dialog',
      '@/shared/ui/alert-dialog',
      '@/shared/ui/input',
      '@/shared/ui/label',
      '@/shared/ui/textarea',
    ];
    const forbiddenJsx = [
      "<Button",
      "<Dialog",
      "<DialogContent",
      "<DialogTitle",
      "<DialogDescription",
      "<DialogFooter",
      "<AlertDialog",
      "<AlertDialogContent",
      "<AlertDialogAction",
      "<AlertDialogCancel",
      "<Input",
      "<Textarea",
      "<Label",
      "<select",
      "AppSelectNative",
      'type="checkbox"',
    ];

    expect(forbiddenImports.filter((value) => modelScreen.includes(value))).toEqual([]);
    expect(forbiddenJsx.filter((value) => modelScreen.includes(value))).toEqual([]);
    expect(modelScreen).toContain("@/shared/ui/app-dialog");
    expect(modelScreen).toContain("@/shared/ui/app-confirm-dialog");
    expect(modelScreen).toContain("@/shared/ui/app-input");
    expect(modelScreen).toContain("@/shared/ui/app-form-control");
  });
});
