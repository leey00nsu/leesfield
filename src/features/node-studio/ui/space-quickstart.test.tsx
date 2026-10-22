import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import enMessages from "@/shared/i18n/messages/en.json";
import { SpaceQuickstart } from "./space-quickstart";

const render = (ui: Parameters<typeof renderWithIntl>[0]) => renderWithIntl(ui, { locale: "en", messages: enMessages });
describe("SpaceQuickstart", () => {
  it("opens a tutorial Space or the existing Space browser", async () => {
    const create = vi.fn().mockResolvedValue(undefined), close = vi.fn(), browse = vi.fn();
    render(<SpaceQuickstart onCreate={create} onClose={close} onBrowse={browse} />);
    fireEvent.click(screen.getByRole("button", { name: /Browse your Spaces/ }));
    expect(browse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Learn the basics/ }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledExactlyOnceWith(null, true);
  });
  it("searches translated templates and creates only the chosen canonical template", async () => {
    const user = userEvent.setup(), create = vi.fn().mockResolvedValue(undefined), close = vi.fn();
    render(<SpaceQuickstart onCreate={create} onClose={close} onBrowse={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Pre-built workflows/ }));
    expect(screen.getAllByRole("button", { name: "Use workflow" })).toHaveLength(6);
    await user.type(screen.getByRole("textbox", { name: "Search templates..." }), "Background Swap");
    expect(screen.getAllByRole("button", { name: "Use workflow" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Use workflow" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]).toMatchObject([{ id: "background-swap", schemaVersion: 3, title: "Background Swap", groups: [] }, false]);
    expect(create.mock.calls[0][0].nodes.every((node: { selectedOutputAssetId: string | null }) => node.selectedOutputAssetId === null)).toBe(true);
  });
  it("keeps the same creation choice after failure and blocks duplicate submission or close while saving", async () => {
    const user = userEvent.setup(), close = vi.fn();
    let finish!: () => void;
    const create = vi.fn().mockRejectedValueOnce(new Error("Save conflict"))
      .mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<SpaceQuickstart onCreate={create} onClose={close} onBrowse={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Start an empty Space/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save conflict");
    await user.click(screen.getByRole("button", { name: /Start an empty Space/ }));
    expect(screen.getByRole("button", { name: "Close Quickstart" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(create.mock.calls).toEqual([[null, false], [null, false]]);
    await act(async () => finish());
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});
