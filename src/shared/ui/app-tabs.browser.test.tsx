import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { AppTabs } from "./app-tabs";

test("native keyboard focus preserves manual panel activation", async () => {
  render(<AppTabs ariaLabel="Details" items={[
    { value: "general", label: "General", content: "General content" },
    { value: "disabled", label: "Unavailable", disabled: true, content: "Unavailable content" },
    { value: "attempts", label: "Attempts (2)", content: "Attempt content" },
  ]} />);
  const first = page.getByRole("tab", { name: "General", exact: true });
  const next = page.getByRole("tab", { name: "Attempts (2)", exact: true });
  await first.click();
  await userEvent.keyboard("{ArrowRight}");
  // Base UI keeps disabled tabs discoverable to keyboard users, but never
  // activates their panel. A second arrow reaches the next enabled tab.
  await expect.element(page.getByRole("tab", { name: "Unavailable" })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(first).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(next).toHaveFocus();
  await expect.element(first).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{Enter}");
  await expect.element(next).toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByRole("tabpanel")).toHaveTextContent("Attempt content");
});

test.each([390, 1440])("detail tab labels fit their shared rail at %ipx", async width => {
  await page.viewport(width, 844);
  render(<div style={{ width: "min(100%, 420px)" }}>
    <AppTabs ariaLabel="Job detail" listClassName="w-full h-auto" triggerClassName="min-w-0 flex-auto px-2 py-2 text-xs whitespace-normal" items={[
      { value: "general", label: "일반", content: "General" },
      { value: "attempts", label: "실행 시도 (2)", content: "Attempts" },
      { value: "failures", label: "실패 이력 (1)", content: "Failures" },
      { value: "actions", label: "관리자 조치 (1)", content: "Actions" },
    ]} />
  </div>);
  const list = page.getByRole("tablist").element();
  const bounds = list.getBoundingClientRect();
  expect(bounds.width).toBeGreaterThan(300);
  expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth + 1);
  for (const tab of list.querySelectorAll('[role="tab"]')) {
    const box = tab.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(20);
    expect(box.left).toBeGreaterThanOrEqual(bounds.left);
    expect(box.right).toBeLessThanOrEqual(bounds.right);
    const range = document.createRange(); range.selectNodeContents(tab);
    expect(range.getBoundingClientRect().width).toBeLessThanOrEqual(box.width);
  }
});
