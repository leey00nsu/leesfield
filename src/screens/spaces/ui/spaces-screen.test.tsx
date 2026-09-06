import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpacesScreen } from "./spaces-screen";
import { restoreSpaceListScroll } from "@/features/node-studio/model/space-navigation";

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), remove: vi.fn(), copy: vi.fn(), sync: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/features/node-studio/hook/use-generation-graphs", () => ({
  useGenerationGraphList: mocks.list,
  useCreateGenerationGraph: () => ({ mutateAsync: mocks.create }),
  useDeleteGenerationGraph: () => ({ mutateAsync: mocks.remove }),
  useSyncGenerationGraphCache: () => mocks.sync,
}));
vi.mock("@/features/node-studio/api/generation-graph-api", () => ({ copyGenerationGraph: mocks.copy, getGenerationGraph: vi.fn(), updateGenerationGraph: vi.fn() }));
const space = { id: "one", title: "First Space", updatedAt: "2026-09-05T00:00:00.000Z" };
describe("Spaces list", () => {
  it("consumes the return scroll position so later cache updates cannot jump the list", () => {
    const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    window.history.replaceState({ spaceListScroll: 300, retained: true }, "");
    restoreSpaceListScroll();
    restoreSpaceListScroll();
    expect(scroll).toHaveBeenCalledExactlyOnceWith(0, 300);
    expect(window.history.state).toEqual({ retained: true });
    scroll.mockRestore();
  });
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, ""); mocks.list.mockReturnValue({ data: [], isLoading: false, isError: false }); });
  it("does not create or open a Space on an empty list visit", () => {
    render(<SpacesScreen />);
    expect(screen.getByRole("heading", { name: "Spaces" })).toBeInTheDocument();
    expect(screen.getByTestId("generation-studio-intro")).toBeInTheDocument();
    expect(screen.getByText("Your first space starts here")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("creates a named space only after explicit confirmation", async () => {
    const user = userEvent.setup(); mocks.create.mockResolvedValue(space); render(<SpacesScreen />);
    await user.click(screen.getByRole("button", { name: "New Space" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByRole("textbox", { name: "Space name" }));
    await user.type(within(dialog).getByRole("textbox"), "My Space");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(mocks.create).toHaveBeenCalledWith("My Space"); expect(mocks.push).toHaveBeenCalledWith("/spaces/one");
  });
  it("copies into the list and requires confirmation before deleting", async () => {
    const user = userEvent.setup(); mocks.list.mockReturnValue({ data: [space] }); mocks.copy.mockResolvedValue({ ...space, id: "two" });
    render(<SpacesScreen />);
    expect(screen.getByRole("link", { name: /First Space/ })).toHaveAttribute("href", "/spaces/one");
    await user.click(screen.getByRole("button", { name: "Copy First Space" }));
    expect(mocks.copy).toHaveBeenCalledWith("one"); expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ id: "two" }));
    await user.click(screen.getByRole("button", { name: "Delete First Space" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/generation history will be kept/)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(mocks.remove).toHaveBeenCalledWith("one");
  });
});
