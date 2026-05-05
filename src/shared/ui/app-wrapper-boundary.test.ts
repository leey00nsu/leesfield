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
    expect(appFilterToolbar).toContain("appSearchFieldSurfaceClassName");
    expect(appFilterToolbar).toContain("data-app-search-surface");
    expect(appFilterToolbar).toContain("data-app-search-input");
    expect(appFilterToolbar).toContain("dark:bg-transparent");
    expect(appFilterToolbar).not.toContain("<AppInput");
    expect(appFilterToolbar).not.toContain("appInputSurfaceClassName");
    expect(apiDocsSidebar).not.toMatch(
      /<AppSearchField[^>]*(containerClassName|className)=/,
    );
  });

  it("keeps modal surfaces behind AppDialog variants", () => {
    const offenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (relativePath.endsWith("src/shared/ui/app-dialog.tsx")) return [];
      if (relativePath.endsWith("src/shared/ui/app-dialog.stories.tsx")) return [];

      const contents = readFileSync(filePath, "utf8");
      const localSurfaceOverride =
        /<AppDialogContent[^>]*className=["'][^"']*(?:max-w-|rounded-|border-|bg-|shadow-|p-\d|p-0)/.test(
          contents,
        );
      return localSurfaceOverride ? [relativePath] : [];
    });

    const appDialog = readFileSync(
      join(sourceRoot, "shared/ui/app-dialog.tsx"),
      "utf8",
    );
    const allowedDirectRoleDialogs = [
      "src/shared/ui/generation-model-section.tsx",
      "src/screens/generation-history/ui/generation-history-screen.tsx",
    ];
    const directRoleDialogOffenders = sourceFiles.flatMap((filePath) => {
      const relativePath = relative(process.cwd(), filePath);
      if (relativePath.endsWith("src/shared/ui/app-wrapper-boundary.test.ts")) {
        return [];
      }
      const contents = readFileSync(filePath, "utf8");
      if (!contents.includes('role="dialog"')) return [];
      return allowedDirectRoleDialogs.includes(relativePath) ? [] : [relativePath];
    });

    expect(appDialog).toContain("size?: AppDialogSize");
    expect(appDialog).toContain("surface?: AppDialogSurface");
    expect(appDialog).toContain("padding?: AppDialogPadding");
    expect(appDialog).toContain("AppDialogActionButton");
    expect(appDialog).toContain("AppDialogCancelButton");
    expect(appDialog).toContain("AppDialogDangerButton");
    expect(appDialog).toContain("AppDialogIconButton");
    expect(offenders).toEqual([]);
    expect(directRoleDialogOffenders).toEqual([]);
  });

  it("keeps feature dialog footer actions behind AppDialog action buttons", () => {
    const apiKeyModal = readFileSync(
      join(sourceRoot, "features/api-key-management/ui/api-key-edit-modal.tsx"),
      "utf8",
    );
    const modelScreen = readFileSync(
      join(sourceRoot, "screens/model-management/ui/model-management-screen.tsx"),
      "utf8",
    );

    expect(apiKeyModal).toContain("AppDialogActionButton");
    expect(apiKeyModal).toContain("AppDialogCancelButton");
    expect(apiKeyModal).toContain("AppDialogDangerButton");
    expect(apiKeyModal).toContain("AppDialogIconButton");
    expect(apiKeyModal).not.toContain("rounded-full border border-white/10");
    expect(apiKeyModal).not.toContain("hover:bg-white/6");
    expect(apiKeyModal).not.toContain("hover:bg-primary");

    expect(modelScreen).toContain("AppDialogActionButton");
    expect(modelScreen).toContain("AppDialogCancelButton");
    expect(modelScreen).toContain("AppDialogDangerButton");
    expect(modelScreen).toContain("AppDialogIconButton");
  });

  it("keeps repeated form and action surfaces behind app wrapper variants", () => {
    const apiKeyToolbar = readFileSync(
      join(sourceRoot, "features/api-key-management/ui/api-key-toolbar.tsx"),
      "utf8",
    );
    const apiKeyCard = readFileSync(
      join(sourceRoot, "features/api-key-management/ui/api-key-card.tsx"),
      "utf8",
    );
    const loginForm = readFileSync(
      join(sourceRoot, "features/auth/login/ui/login-form.tsx"),
      "utf8",
    );
    const appButton = readFileSync(
      join(sourceRoot, "shared/ui/app-button.tsx"),
      "utf8",
    );
    const appInput = readFileSync(
      join(sourceRoot, "shared/ui/app-input.tsx"),
      "utf8",
    );
    const appFormControl = readFileSync(
      join(sourceRoot, "shared/ui/app-form-control.tsx"),
      "utf8",
    );
    const appSelect = readFileSync(
      join(sourceRoot, "shared/ui/app-select.tsx"),
      "utf8",
    );

    expect(appButton).toContain("surface-muted");
    expect(appButton).toContain("auth:");
    expect(appInput).toContain('type AppInputSurface = "default"');
    expect(appInput).toContain('"toolbar"');
    expect(appInput).toContain('"auth"');
    expect(appInput).not.toContain('"profile"');
    expect(appFormControl).toContain('type AppTextareaSurface = "default"');
    expect(appFormControl).not.toContain('"profile"');
    expect(appSelect).toContain("AppSelectTriggerSurface");

    expect(apiKeyToolbar).toContain('surface="toolbar"');
    expect(apiKeyToolbar).toContain('size="toolbar"');
    expect(apiKeyToolbar).not.toContain("rounded-[1.5rem] border-white/10 bg-black/45");

    expect(apiKeyCard).toContain('variant="surface-muted"');
    expect(apiKeyCard).toContain('size="pill-md"');
    expect(apiKeyCard).not.toContain("hover:bg-white/6");

    expect(loginForm).toContain('surface="auth"');
    expect(loginForm).toContain('variant="auth"');
    expect(loginForm).not.toContain("bg-[#111417]");
    expect(loginForm).not.toContain("bg-[#22262c]");
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

  it("keeps selected calendar dates readable on the primary surface", () => {
    const appCalendar = readFileSync(
      join(sourceRoot, "shared/ui/app-calendar.tsx"),
      "utf8",
    );

    expect(appCalendar).toContain("data-app-calendar");
    expect(appCalendar).toContain("!bg-primary");
    expect(appCalendar).toContain("[&_button]:!text-black");
  });
});
