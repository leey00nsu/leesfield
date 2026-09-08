import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, it, expect, vi } from "vitest";
import ko from "@/shared/i18n/messages/ko.json";
import { HistoryRequestSettings } from "./history-request-settings";
vi.mock("@/shared/ui/app-code-block", () => ({
  AppCodeSnippet: ({ code }: { code: string }) => <pre>{code}</pre>,
}));
afterEach(cleanup);
function show(parameters: Record<string, unknown> | null) {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <HistoryRequestSettings parameters={parameters} />
    </NextIntlClientProvider>,
  );
}
describe("history submission settings", () => {
  it("shows persisted zero, false and file summaries without a catalog", () => {
    show({ seed: 0, enhance: false, reference: "[file]" });
    expect(screen.getByText("seed")).toBeVisible();
    expect(document.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("0", { selector: "dd" })).toBeVisible();
    expect(
      screen.getByText(ko.history.detail.parameterFalse, { selector: "dd" }),
    ).toBeVisible();
    expect(
      screen.getByText(ko.history.detail.parameterFile, { selector: "dd" }),
    ).toBeVisible();
  });
  it('shows older data only as raw JSON, without guessing which width was used',()=>{show({width:1024,dynamicParams:{'hf:width':768}});expect(screen.queryByText(/이전 기록에는/)).not.toBeInTheDocument();expect(document.querySelectorAll('dd')).toHaveLength(0);});
  it('uses the stored label instead of exposing an internal namespace',()=>{show({width:768});expect(screen.getByText('width')).toBeVisible();expect(document.querySelector('pre')?.textContent).toBe(JSON.stringify({width:768},null,2));expect(screen.getByText('768',{selector:'dd'})).toBeVisible();});
  it("explains missing snapshots without rendering inferred settings", () => {
    show(null);
    expect(screen.getByText(ko.history.detail.settingsMissing)).toBeVisible();
    expect(
      screen.queryByText(ko.history.detail.settingsJson),
    ).not.toBeInTheDocument();
  });
});
