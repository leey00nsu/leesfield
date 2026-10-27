import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { CanvasProviders } from "@/shared/ui/canvas-providers";
import { settledBounds } from "@/test-utils/browser-layout";
import { intl, mountSpace, node } from "@/test-utils/space-browser";
import { SpaceWorkspaceHeader } from "./space-workspace-header";

test.each([390, 1440])("L01 workspace brand alignment and Spaces dialog layout at %ipx", async width => {
  await page.viewport(width, 844);
  render(intl(<CanvasProviders><SpaceWorkspaceHeader
    title="Component space" brand={<AppBrandLogo size="sm" />} saveLabel="Saved"
    graphs={[{ id: "active", title: "Component space" }, { id: "second", title: "Another space with a longer title" }]}
    activeGraphId="active" onTitleChange={() => {}} onSelectGraph={() => {}} onCreateGraph={() => {}}
    onSave={() => {}} onDelete={() => {}} />
  </CanvasProviders>));
  const header = document.querySelector("[data-space-workspace-header]")!;
  const headerBox = await settledBounds(header);
  const mark = await settledBounds(header.querySelector("[data-app-brand-logo] > span:first-child")!);
  expect(Math.abs((mark.y - headerBox.y) - (headerBox.bottom - mark.bottom))).toBeLessThanOrEqual(2);
  expect(page.getByText("|", { exact: true }).query()).toBeNull();

  await page.getByRole("button", { name: "Open space", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Spaces", exact: true });
  await expect.element(dialog).toBeVisible();
  const popup = dialog.element(), bounds = await settledBounds(popup);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(width);
  expect(popup.scrollWidth).toBeLessThanOrEqual(popup.clientWidth);
  const buttons = popup.querySelectorAll("footer button");
  expect(buttons.length).toBe(3);
  for (let index = 1; index < buttons.length; index += 1) {
    const previous = buttons[index - 1].getBoundingClientRect(), next = buttons[index].getBoundingClientRect();
    expect(next.y >= previous.bottom || next.x >= previous.right + 4).toBe(true);
  }
});

test.each([390, 1440])("L02 Prompt Constructor default layout width at %ipx", async width => {
  await page.viewport(width, 844);
  await mountSpace({ nodes: [node("constructor", "process.promptConstructor", { template: "A prompt" })] });
  await expect.poll(() => {
    const constructor = document.querySelector('.react-flow__node[data-id="constructor"]');
    return constructor ? getComputedStyle(constructor).width : null;
  }).toBe("340px");
});
