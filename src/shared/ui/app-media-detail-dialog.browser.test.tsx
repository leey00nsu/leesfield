import { useState } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { AppDialogTitle } from "./app-dialog";
import { AppMediaDetailBackdrop, AppMediaDetailDialog, useMediaDetailDialog } from "./app-media-detail-dialog";

function Detail() {
  const [open, setOpen] = useState(true);
  const controller = useMediaDetailDialog(() => setOpen(false));
  return <AppMediaDetailDialog controller={controller} open={open}>
    <AppMediaDetailBackdrop style={{ height: "100%", padding: 40 }}>
      <span>Background</span>
      <section data-app-media-detail-content="" style={{ width: 240, background: "#222", padding: 20 }}>
        <AppDialogTitle>Asset detail</AppDialogTitle>
        <label>Title<input onChange={() => controller.setDirty(true)} /></label>
      </section>
    </AppMediaDetailBackdrop>
  </AppMediaDetailDialog>;
}
function mount() {
  render(<NextIntlClientProvider locale="en" messages={{ assets: {
    unsavedTitle: "Unsaved changes", unsavedDescription: "Discard draft?", keepEditing: "Keep editing", discardChanges: "Discard",
  } }}><Detail /></NextIntlClientProvider>);
}

test("native background click dismisses a clean detail", async () => {
  mount();
  await page.getByText("Background", { exact: true }).click();
  await expect.element(page.getByRole("dialog", { name: "Asset detail" })).not.toBeInTheDocument();
});

test("dirty detail confirms background and Escape dismissal before discarding", async () => {
  mount();
  await page.getByRole("textbox", { name: "Title" }).fill("Draft title");
  await page.getByText("Background", { exact: true }).click();
  await expect.element(page.getByRole("alertdialog", { name: "Unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect.element(page.getByRole("textbox", { name: "Title" })).toHaveValue("Draft title");
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("alertdialog", { name: "Unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect.element(page.getByRole("dialog", { name: "Asset detail" })).not.toBeInTheDocument();
});
