import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import ko from "./messages/ko.json";
import en from "./messages/en.json";
import canvas from "./canvas-ko.json";

function flatten(value: object, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, item]) => typeof item === "string" ? [[prefix + key, item] as [string, string]] : flatten(item, prefix + key + "."));
}
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sources(path) : /\.tsx?$/.test(path) && !/\.(test|stories)\./.test(path) ? [path] : [];
  });
}
describe("UI copy contract", () => {
  it("keeps locale keys and interpolation parameters aligned", () => {
    const korean = Object.fromEntries(flatten(ko));
    const english = Object.fromEntries(flatten(en));
    expect(Object.keys(korean).sort()).toEqual(Object.keys(english).sort());
    const parameters = (value: string) => [...new Set([...value.matchAll(/\{(\w+)[,}]/g)].map(match => match[1]))].sort();
    for (const key of Object.keys(korean)) expect(parameters(korean[key]), key).toEqual(parameters(english[key]));
  });
  it("uses the same terminology in the host and canvas", () => {
    expect([ko.model.card.meta.provider, ko.model.admin.fields.provider, canvas.Provider]).toEqual(["제공업체", "제공업체", "제공업체"]);
    expect([ko.generation.modelPicker.all, ko.monitoringDashboard.filters.allModels, canvas["All models"]]).toEqual(["전체 모델", "전체 모델", "전체 모델"]);
    expect([ko.nodeStudio.save.dirty, ko.nodeStudio.host.dirty, canvas["Unsaved changes"]]).toEqual(["저장하지 않은 변경 사항", "저장하지 않은 변경 사항", "저장하지 않은 변경 사항"]);
    expect(ko.common.actions.reset).toBe("초기화");
    expect(ko.common.actions.clear).toBe("비우기");
    expect(ko.common.actions.remove).toBe("제거");
    expect(ko.common.labels.durationSec).toBe("재생 시간");
    expect(ko.history.detail.duration).toBe("소요 시간");
  });
  it("keeps audited page copy out of JSX literals", () => {
    const files = ["src/screens/spaces/ui/spaces-screen.tsx", "src/app/error.tsx", "src/app/not-found.tsx", "src/app/(protected)/spaces/[spaceId]/loading.tsx", "src/screens/auth/login/ui/login-screen.tsx", "src/widgets/api-docs/ui/api-docs-intro-section.tsx", "src/widgets/landing/ui/landing-hero.tsx"];
    const violations: string[] = [];
    for (const path of files) {
      const source = ts.createSourceFile(path, readFileSync(resolve(path), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) && /[a-z가-힣]/i.test(node.text.trim()) && node.text.trim() !== "API") violations.push(path + ": " + node.text.trim());
        if (ts.isJsxAttribute(node) && ["title", "aria-label", "placeholder", "description", "label"].includes(node.name.getText(source)) && node.initializer && ts.isStringLiteral(node.initializer)) violations.push(path + ": " + node.initializer.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });
  it("has Korean translations for literal canvas translation calls", () => {
    const missing: string[] = [];
    for (const path of [...sources(resolve("src")), ...sources(resolve(".generated/node-banana-runtime/src"))]) {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ["tc", "translate"].includes(node.expression.getText(source)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && !Object.hasOwn(canvas, node.arguments[0].text)) missing.push(path + ": " + node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(missing).toEqual([]);
  });
});
