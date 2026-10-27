import { render } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { SpaceModelBrowser } from "./space-model-browser";
import { intl, mountSpace, node, imageModel, audioModel, videoModel, llm } from "@/test-utils/space-browser";
import { settledBounds } from "@/test-utils/browser-layout";

const el = (selector: string) => { document.querySelector(selector)!.setAttribute("data-testid", selector); return page.getByTestId(selector); };

test.each([imageModel, audioModel, videoModel])("B10 $type model browsing preserves local prompt under a connected source", async model => {
  await page.viewport(1440, 844);
  const { session } = await mountSpace({ inline: true, selected: "generation", nodes: [
    node("source", "input.prompt", { text: "connected prompt wins" }),
    node("generation", "generate." + model.type as "generate.image", { prompt: "durable local prompt", modelKey: model.key, parameters: {} }, 600),
  ], edges: [{ id: "prompt", sourceNodeId: "source", sourcePortId: "text", targetNodeId: "generation", targetPortId: "prompt", sortOrder: 0 }] });
  const before = session.getDocument().nodes.find(item => item.id === "generation")!.config;
  const body = el('[data-space-node-id="generation"]');
  const prompt = body.getByRole("textbox", { name: "Prompt", exact: true });
  await expect.element(prompt).toBeDisabled();
  await expect.element(prompt).toHaveTextContent("connected prompt wins");
  await body.getByRole("button", { name: "Browse models", exact: true }).click();
  const browser = page.getByRole("dialog", { name: "Browse Models", exact: true });
  await expect.element(browser).toBeVisible();
  await browser.getByRole("button", { name: model.label, exact: true }).first().click();
  await expect.element(browser).not.toBeInTheDocument();
  expect(session.getDocument().nodes.find(item => item.id === "generation")!.config).toMatchObject({ prompt: "durable local prompt", modelKey: model.key });
  expect(session.getDocument().edges).toHaveLength(1);
  expect(before).toMatchObject({ prompt: "durable local prompt" });
});

test.each([false, true].flatMap(inline => [imageModel, videoModel].map(model => ({ inline, model }))))(
  "B11 legacy $model.type camera edits upgrade without changing prompt/model/parameters (inline $inline)", async ({ inline, model }) => {
    await page.viewport(1440, 844);
    const { session } = await mountSpace({ inline, selected: "cinema", nodes: [node("cinema", "generate." + model.type as "generate.image", {
      prompt: "Keep this authored camera prompt", modelKey: model.key, parameters: { seed: 0 },
      cinema: { schemaVersion: 1, focalLength: "35", shootingEnabled: false, lighting: "window" },
    })] });
    await el(inline ? '[data-space-node-id="cinema"]' : '[data-space-node-inspector]').getByRole("button", { name: /^Camera:/ }).click();
    const dialog = page.getByRole("dialog", { name: "Camera", exact: true });
    const camera = dialog.getByRole("spinbutton", { name: "Camera", exact: true });
    (camera.element() as HTMLElement).focus(); await userEvent.keyboard("{Home}{ArrowDown}");
    const cameraName = camera.element().getAttribute("aria-valuetext");
    const lens = dialog.getByRole("spinbutton", { name: "Lens", exact: true });
    (lens.element() as HTMLElement).focus(); await userEvent.keyboard("{ArrowDown}");
    const config = session.getDocument().nodes[0].config as Record<string, unknown>;
    expect(config).toMatchObject({ prompt: "Keep this authored camera prompt", modelKey: model.key, parameters: { seed: 0 },
      cinema: { schemaVersion: 2 } });
    expect(config.cinema).not.toHaveProperty("focalLength"); expect(config.cinema).not.toHaveProperty("shootingEnabled");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await el(inline ? '[data-space-node-id="cinema"]' : '[data-space-node-inspector]').getByRole("button", { name: /^Camera:/ }).click();
    await expect.element(page.getByRole("dialog", { name: "Camera", exact: true }).getByRole("spinbutton", { name: "Camera", exact: true }))
      .toHaveAttribute("aria-valuetext", cameraName!);
  });

test.each([390, 1440])("B18 active/recent LLM catalog, provider and id search, refresh and canonical selection at %ipx", async width => {
  await page.viewport(width, 844);
  const second = { ...llm, key: "second-llm", label: "Second LLM", vendor: "Second Provider", providerConfig: { ...llm.providerConfig, model_id: "second-provider-id" } };
  const refresh = vi.fn(), selected = vi.fn();
  function Fixture() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Browse</button><SpaceModelBrowser open={open} onOpenChange={setOpen}
      models={[llm, second, { ...llm, key: "inactive", label: "Inactive LLM", isActive: false }, imageModel, audioModel, videoModel]}
      initialType="llm" selectedKey={llm.key} recentKeys={[second.key, "inactive"]} onRefresh={refresh} onSelect={key => { selected(key); setOpen(false); }} /></>;
  }
  render(intl(<Fixture />));
  const trigger = page.getByRole("button", { name: "Browse", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Browse Models", exact: true });
  const initial = await settledBounds(dialog.element());
  expect(initial.x).toBeGreaterThanOrEqual(0); expect(initial.right).toBeLessThanOrEqual(width + 1);
  expect(dialog.getByText("Inactive LLM", { exact: true }).query()).toBeNull();
  await expect.element(dialog.getByRole("heading", { name: "Recently Used", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOptions("Second Provider");
  await expect.element(dialog.getByRole("list", { name: "All models", exact: true })).toHaveTextContent("Second LLM");
  expect(dialog.getByRole("list", { name: "All models", exact: true }).getByText(llm.label, { exact: true }).query()).toBeNull();
  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOptions("");
  await userEvent.keyboard("{Escape}");
  await dialog.getByRole("button", { name: "Refresh models & schemas", exact: true }).click();
  expect(refresh).toHaveBeenCalledTimes(1);
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search models", exact: true });
  await expect.element(search).toHaveFocus(); await search.fill(llm.providerConfig.model_id);
  await expect.poll(() => dialog.getByRole("list", { name: "All models", exact: true }).element().querySelectorAll("li").length).toBe(1);
  await userEvent.keyboard("{Escape}");
  await dialog.getByRole("button", { name: llm.label, exact: true }).first().click();
  expect(selected).toHaveBeenCalledWith(llm.key);
  await expect.element(trigger).toHaveFocus();
  await trigger.click();
  await expect.element(dialog.getByRole("button", { name: llm.label, exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  const reopened = await settledBounds(dialog.element());
  expect(Math.abs(reopened.height - initial.height)).toBeLessThan(2);
  await userEvent.keyboard("{Escape}"); await expect.element(trigger).toHaveFocus();
});
