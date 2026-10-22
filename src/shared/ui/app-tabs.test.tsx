import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppTabs } from "./app-tabs";

afterEach(cleanup);
const choices = [{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }];

describe("AppTabs", () => {
  it("keeps content tabs associated with their panels and uses manual keyboard activation", async () => {
    const user = userEvent.setup();
    render(<AppTabs ariaLabel="Settings" items={[
      { value: "space", label: "Space", content: "Space settings" },
      { value: "canvas", label: "Canvas", content: "Canvas settings" },
    ]} />);
    const list = screen.getByRole("tablist", { name: "Settings" });
    const space = within(list).getByRole("tab", { name: "Space" });
    const canvas = within(list).getByRole("tab", { name: "Canvas" });
    expect(space).toHaveAttribute("aria-controls", screen.getByRole("tabpanel", { name: "Space" }).id);
    act(() => space.focus()); await user.keyboard("{ArrowRight}");
    expect(canvas).toHaveFocus(); expect(space).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("tabpanel", { name: "Canvas" })).toHaveTextContent("Canvas settings");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("uses radio semantics and commits arrow navigation without exposing phantom panels", async () => {
    const user = userEvent.setup(), change = vi.fn();
    render(<AppTabs selectionOnly ariaLabel="Image fit" onValueChange={change} items={choices} />);
    const group = screen.getByRole("radiogroup", { name: "Image fit" });
    const cover = within(group).getByRole("radio", { name: "Cover", checked: true });
    const contain = within(group).getByRole("radio", { name: "Contain", checked: false });
    for (const radio of [cover, contain]) {
      expect(radio).not.toHaveAttribute("aria-selected"); expect(radio).not.toHaveAttribute("aria-controls");
    }
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    act(() => cover.focus()); await user.keyboard("{ArrowDown}");
    expect(contain).toHaveFocus(); expect(contain).toBeChecked();
    expect(change).toHaveBeenLastCalledWith("contain");
    await user.keyboard("{ArrowRight}"); expect(cover).toHaveFocus(); expect(cover).toBeChecked();
    await user.keyboard("{End}"); expect(contain).toBeChecked();
    await user.keyboard("{Home}"); expect(cover).toBeChecked();
    await user.keyboard("{ArrowUp}"); expect(contain).toHaveFocus(); expect(contain).toBeChecked();
    await user.keyboard(" "); expect(contain).toBeChecked();
  });

  it("preserves controlled values, skips disabled radios, and ignores IME navigation", async () => {
    const user = userEvent.setup(), change = vi.fn();
    const items = [choices[0], { value: "disabled", label: "Unavailable", disabled: true }, choices[1]];
    const view = render(<AppTabs selectionOnly ariaLabel="Image fit" value="cover" onValueChange={change} items={items} />);
    const cover = screen.getByRole("radio", { name: "Cover" });
    const contain = screen.getByRole("radio", { name: "Contain" });
    act(() => cover.focus());
    fireEvent.keyDown(cover, { key: "ArrowRight", isComposing: true, keyCode: 229 });
    expect(cover).toHaveFocus(); expect(change).not.toHaveBeenCalled();
    await user.keyboard("{ArrowRight}");
    expect(contain).toHaveFocus(); expect(change).toHaveBeenLastCalledWith("contain");
    expect(cover).toBeChecked(); expect(contain).not.toBeChecked();
    view.rerender(<AppTabs selectionOnly ariaLabel="Image fit" value="contain" onValueChange={change} items={items} />);
    expect(contain).toBeChecked();
    change.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: "Unavailable" }));
    expect(change).not.toHaveBeenCalled();
  });

  it("does not change a disabled selection through pointer or keyboard input", async () => {
    const user = userEvent.setup(), change = vi.fn();
    render(<AppTabs selectionOnly ariaLabel="Read-only fit" value="cover" onValueChange={change} items={choices.map(item => ({ ...item, disabled: true }))} />);
    const cover = screen.getByRole("radio", { name: "Cover" });
    fireEvent.click(screen.getByRole("radio", { name: "Contain" }));
    act(() => cover.focus()); await user.keyboard("{ArrowRight}{End} ");
    expect(cover).toBeChecked(); expect(change).not.toHaveBeenCalled();
  });
});
