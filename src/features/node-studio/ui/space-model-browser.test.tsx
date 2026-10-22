import { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "@/shared/i18n/messages/en.json";
import { SpaceModelBrowser, type SpaceBrowserModel, type SpaceModelBrowserProps } from "./space-model-browser";

const image: SpaceBrowserModel = {
  type: "image", key: "image:canonical", label: "Canvas Image", vendor: "Image Lab", provider: "hf_space",
  parameters: {}, meta: { max_input_images: 2 }, isActive: true, isDefault: false,
};
const video: SpaceBrowserModel = {
  type: "video", key: "video:canonical", label: "Cinema Video", vendor: "Video Lab", provider: "modal_comfyui",
  parameters: {}, meta: { t2v_model_id: "text-video", supports_init_image: true }, isActive: true, isDefault: false,
};
const audio: SpaceBrowserModel = {
  type: "audio", key: "audio:canonical", label: "Clear Voice", vendor: "Voice Lab", provider: "hf_space",
  parameters: {}, meta: { supports_input_audio: true }, isActive: true, isDefault: false,
};
const vision: SpaceBrowserModel = {
  type: "llm", key: "llm:canonical", label: "Creative Assistant", vendor: "Creative API", provider: "openai_compatible",
  providerConfig: { base_url: "https://private-provider.example/v1", model_id: "provider-vision-id", supports_images: true },
  isActive: true, isDefault: false,
};
const text: SpaceBrowserModel = {
  ...vision, key: "text:canonical", label: "Writing Assistant", vendor: "Writing API",
  providerConfig: { ...vision.providerConfig, model_id: "provider-text-id", supports_images: false },
};
const models: readonly SpaceBrowserModel[] = [image, video, audio, vision, text, { ...image, key: "inactive", label: "Inactive Model", isActive: false }];

function Wrapper({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>;
}
function mount(overrides: Partial<SpaceModelBrowserProps> = {}) {
  let props: SpaceModelBrowserProps = { open: true, models, onSelect: vi.fn(), onOpenChange: vi.fn(), ...overrides };
  const view = render(<SpaceModelBrowser {...props} />, { wrapper: Wrapper });
  return { ...view, onSelect: props.onSelect, onOpenChange: props.onOpenChange,
    redraw: (patch: Partial<SpaceModelBrowserProps>) => { props = { ...props, ...patch }; view.rerender(<SpaceModelBrowser {...props} />); } };
}
function mainList() { return screen.getByRole("list", { name: "All models" }); }
function mainCard(name: string) { return within(mainList()).getByRole("button", { name }); }
async function openSearch() {
  await userEvent.click(screen.getByRole("button", { name: "Search" }));
  return screen.findByRole("searchbox", { name: "Search models" });
}
async function openFilters() { await userEvent.click(screen.getByRole("button", { name: "Filter" })); }
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SpaceModelBrowser", () => {
  it("shows active runtime models, their real capabilities, selected state, and the result count", () => {
    mount({ selectedKey: vision.key });
    expect(screen.getByRole("dialog", { name: "All models" })).toBeInTheDocument();
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("Inactive Model")).not.toBeInTheDocument();
    expect(mainCard(vision.label)).toHaveAttribute("aria-pressed", "true");
    const visionCard = within(mainCard(vision.label).closest("li")!);
    for (const label of ["Text", "Image", "Video", "Creative API", "provider-vision-id"]) expect(visionCard.getByText(label)).toBeInTheDocument();
    const textCard = within(mainCard(text.label).closest("li")!);
    expect(textCard.getByText("Text")).toBeInTheDocument();
    expect(textCard.queryByText("Image")).not.toBeInTheDocument();
    expect(textCard.queryByText("Video")).not.toBeInTheDocument();
    for (const [name, badges] of [[image.label, ["T2I", "I2I"]], [video.label, ["T2V", "I2V"]], [audio.label, ["T2A", "A2A"]]] as const) {
      const card = within(mainCard(name).closest("li")!);
      for (const badge of badges) expect(card.getByText(badge)).toBeInTheDocument();
    }
    expect(screen.getByText("5 models found")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh models & schemas" })).toBeDisabled();
    expect(document.body.innerHTML).not.toContain("private-provider.example");
  });

  it("searches names, provider labels, canonical keys, and LLM provider IDs without selecting implicitly", async () => {
    const view = mount();
    const input = await openSearch();
    await waitFor(() => expect(input).toHaveFocus());
    for (const [query, names] of [["cAnVaS", [image.label]], ["Hugging Face", [image.label, audio.label]], ["text:canonical", [text.label]], ["PROVIDER-VISION-ID", [vision.label]]] as const) {
      fireEvent.change(input, { target: { value: query } });
      await waitFor(() => expect(within(mainList()).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(names));
    }
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.onSelect).not.toHaveBeenCalled();
    expect(screen.getByText("1 models found")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "no-matching-model" } });
    expect(await screen.findByText("No models found")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ models found$/)).not.toBeInTheDocument();
  });

  it("filters the global inventory by provider and each type and resets both filters", async () => {
    mount();
    await openFilters();
    const types = screen.getByRole("group", { name: "Model capability" });
    expect(within(types).getAllByRole("button")).toHaveLength(5);
    for (const [label, count] of [["Image", 1], ["Video", 1], ["Audio", 1], ["LLM", 2], ["All Types", 5]] as const) {
      await userEvent.click(within(types).getByRole("button", { name: label }));
      expect(within(mainList()).getAllByRole("listitem")).toHaveLength(count);
    }
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "Hugging Face" } });
    expect(within(mainList()).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([image.label, audio.label]);
    await userEvent.click(within(types).getByRole("button", { name: "Video" }));
    expect(screen.getByText("No models found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(5);
  });

  it.each(["image", "video", "audio", "llm"] as const)("keeps the %s picker restricted to its initial type", async initialType => {
    mount({ initialType });
    expect(screen.getByRole("dialog", { name: "Browse Models" })).toBeInTheDocument();
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(initialType === "llm" ? 2 : 1);
    await openFilters();
    const buttons = within(screen.getByRole("group", { name: "Model capability" })).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  });

  it("matches recent canonical keys in order, deduplicates them, and removes unavailable entries", async () => {
    const view = mount({ recentKeys: ["provider-vision-id", "inactive", video.key, vision.key, vision.key, image.key] });
    const recent = screen.getByRole("region", { name: "Recently Used" });
    expect(within(recent).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual([video.label, vision.label, image.label]);
    view.redraw({ models: models.filter(model => model.key !== video.key) });
    expect(within(screen.getByRole("region", { name: "Recently Used" })).getAllByRole("button")).toHaveLength(2);
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "Creative" } });
    expect(screen.queryByRole("region", { name: "Recently Used" })).not.toBeInTheDocument();
    await waitFor(() => expect(within(mainList()).getAllByRole("button")).toHaveLength(1));
  });

  it("selects a canonical key and its actual type once, including from the recent section", () => {
    const view = mount({ recentKeys: [vision.key] });
    const button = within(screen.getByRole("region", { name: "Recently Used" })).getByRole("button", { name: vision.label });
    fireEvent.click(button); fireEvent.click(button);
    expect(view.onSelect).toHaveBeenCalledExactlyOnceWith(vision.key, "llm");
    expect(view.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([image, video, audio])("returns the canonical key and $type type for a media choice", model => {
    const view = mount({ initialType: model.type });
    fireEvent.click(mainCard(model.label));
    expect(view.onSelect).toHaveBeenCalledExactlyOnceWith(model.key, model.type);
    expect(view.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("preserves provider variant names and source pages without changing the selected key", () => {
    const variant = { ...image, key: "studio/video/effects", label: "Studio", provider: "fal" };
    const view = mount({ models: [variant] });
    expect(screen.getByRole("link", { name: /Studio - effects/ })).toHaveAttribute("href", "https://fal.ai/models/studio/video/effects");
    fireEvent.click(mainCard("Studio - effects"));
    expect(view.onSelect).toHaveBeenCalledExactlyOnceWith(variant.key, "image");
  });

  it("clears a provider that leaves the catalog instead of silently reapplying it later", async () => {
    const view = mount();
    await openFilters();
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), { target: { value: "Creative API" } });
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(1);
    view.redraw({ models: [image] });
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("");
    view.redraw({ models });
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveValue("");
  });

  it("disables selection in the main and recent lists and hides selection during loading and errors", () => {
    const view = mount({ disabled: true, recentKeys: [image.key] });
    for (const button of screen.getAllByRole("button", { name: image.label })) {
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(view.onSelect).not.toHaveBeenCalled();
    view.redraw({ disabled: false, loading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading models...");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    view.redraw({ loading: false, error: "Catalog unavailable" });
    expect(screen.getByRole("alert")).toHaveTextContent("Catalog unavailable");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("refreshes without duplicate requests, reports a safe error, and retries successfully", async () => {
    const pending = deferred();
    const onRefresh = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    mount({ onRefresh });
    const refresh = screen.getByRole("button", { name: "Refresh models & schemas" });
    fireEvent.click(refresh); fireEvent.click(refresh);
    expect(refresh).toBeDisabled(); expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new Error("https://user:secret@provider.example/?api_key=secret")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load models.");
    expect(document.body.innerHTML).not.toContain("secret");
    await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(5);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("ignores refresh failures from a closed session and resets search and filters on reopen", async () => {
    const pending = deferred();
    const view = mount({ onRefresh: () => pending.promise });
    await openFilters();
    await userEvent.click(screen.getByRole("button", { name: "LLM" }));
    const input = await openSearch();
    fireEvent.change(input, { target: { value: "Writing" } });
    await waitFor(() => expect(within(mainList()).getAllByRole("listitem")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Refresh models & schemas" }));
    view.redraw({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.redraw({ open: true });
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(5);
    await act(async () => pending.reject(new Error("late failure")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh models & schemas" })).toBeEnabled();
  });

  it("does not let an old refresh clear the pending state or error of a replacement catalog", async () => {
    const first = deferred(), second = deferred();
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = mount({ onRefresh: refresh });
    fireEvent.click(screen.getByRole("button", { name: "Refresh models & schemas" }));
    view.redraw({ models: [image] });
    fireEvent.click(screen.getByRole("button", { name: "Refresh models & schemas" }));
    await act(async () => first.reject(new Error("old catalog failure")));
    expect(screen.getByRole("button", { name: "Refresh models & schemas" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => second.resolve());
    expect(screen.getByRole("button", { name: "Refresh models & schemas" })).toBeEnabled();
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(1);
  });

  it("allows safe public source links independently of selection and rejects unsafe URL metadata", async () => {
    const publicModel: SpaceBrowserModel = { ...image, meta: { coverImage: "http://catalog.example/cover.png", pageUrl: "https://catalog.example/model" } };
    const unsafeModel: SpaceBrowserModel = { ...video, meta: { coverImage: "javascript:alert(1)", pageUrl: "https://username:password@catalog.example/secret" } };
    const dataModel: SpaceBrowserModel = { ...audio, meta: { coverImage: "data:image/svg+xml,test", pageUrl: "javascript:alert(1)" } };
    const credentialModel: SpaceBrowserModel = { ...image, key: "private-page", meta: { coverImage: "https://catalog.example/cover?token=secret", pageUrl: "https://catalog.example/model?api_key=secret" } };
    const view = mount({ models: [publicModel, unsafeModel, dataModel, credentialModel, vision] });
    const link = screen.getByRole("link", { name: /Canvas Image/ });
    expect(link).toHaveAttribute("href", "https://catalog.example/model");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelector("img")).toHaveAttribute("src", "http://catalog.example/cover.png");
    expect(document.body.innerHTML).not.toContain("secret");
    fireEvent.click(link);
    expect(view.onSelect).not.toHaveBeenCalled(); expect(view.onOpenChange).not.toHaveBeenCalled();
  });

  it("keeps IME confirmation and Escape out of canvas shortcuts and postpones search until composition ends", async () => {
    const canvasKey = vi.fn(), choose = vi.fn(), close = vi.fn();
    render(<div onKeyDown={canvasKey}><SpaceModelBrowser open models={models} onSelect={choose} onOpenChange={close} /></div>, { wrapper: Wrapper });
    const input = await openSearch();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "Creative" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });
    expect(within(mainList()).getAllByRole("listitem")).toHaveLength(5);
    expect(choose).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(canvasKey).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(within(mainList()).getAllByRole("listitem")).toHaveLength(1));
    fireEvent.keyDown(input, { key: "Escape", keyCode: 229 });
    expect(close).not.toHaveBeenCalled();
  });

  it("contains keyboard focus, dismisses nested search before the dialog, and restores opening focus", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Open browser</button><SpaceModelBrowser open={open} onOpenChange={setOpen} models={[image]} onSelect={vi.fn()} /></>;
    }
    render(<Harness />, { wrapper: Wrapper });
    const trigger = screen.getByRole("button", { name: "Open browser" });
    await userEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toHaveFocus());
    for (let index = 0; index < 8; index++) {
      await userEvent.tab();
      await waitFor(() => expect(screen.getByRole("dialog", { name: "All models" })).toContainElement(document.activeElement as HTMLElement));
    }
    await openSearch();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "All models" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "All models" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Close models" }));
    expect(screen.queryByRole("dialog", { name: "All models" })).not.toBeInTheDocument();
  });
});
