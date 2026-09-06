import { renderWithIntl as render } from "@/test-utils/intl";
import enMessages from "@/shared/i18n/messages/en.json";
import { screen, within } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: "스페이스" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "스페이스" })).toHaveClass("sr-only");
    expect(screen.getByText("첫 스페이스를 만들어 보세요")).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("creates a named space only after explicit confirmation", async () => {
    const user = userEvent.setup(); mocks.create.mockResolvedValue(space); render(<SpacesScreen />);
    await user.click(screen.getByRole("button", { name: "새 스페이스" }));
    const dialog = screen.getByRole("dialog");
    await user.clear(within(dialog).getByRole("textbox", { name: "스페이스 이름" }));
    await user.type(within(dialog).getByRole("textbox"), "My Space");
    await user.click(within(dialog).getByRole("button", { name: "저장" }));
    expect(mocks.create).toHaveBeenCalledWith("My Space"); expect(mocks.push).toHaveBeenCalledWith("/spaces/one");
  });
  it("copies into the list and requires confirmation before deleting", async () => {
    const user = userEvent.setup(); mocks.list.mockReturnValue({ data: [space] }); mocks.copy.mockResolvedValue({ ...space, id: "two" });
    render(<SpacesScreen />);
    expect(screen.getByRole("link", { name: /First Space/ })).toHaveAttribute("href", "/spaces/one");
    await user.click(screen.getByRole("button", { name: "First Space 복제" }));
    expect(mocks.copy).toHaveBeenCalledWith("one"); expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ id: "two" }));
    await user.click(screen.getByRole("button", { name: "First Space 삭제" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByText(/생성 기록은 유지됩니다/)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }));
    expect(mocks.remove).toHaveBeenCalledWith("one");
  });
});

 it("filters names, resets no results, and orders without mutating cached data", async () => {
  const user = userEvent.setup();
  const items = [
    { ...space, id: "a", title: "Alpha", updatedAt: "2026-09-01", createdAt: "2026-09-06" },
    { ...space, id: "b", title: "Beta", updatedAt: "2026-09-07", createdAt: "2026-09-01" },
  ];
  mocks.list.mockReturnValue({ data: items });
  render(<SpacesScreen />);
  const names = () => screen.getAllByRole("listitem").map((row) => within(row).getByRole("link").textContent);
  expect(names()).toEqual(["Beta", "Alpha"]);
  await user.click(screen.getByRole("combobox", { name: "스페이스 정렬" }));
  await user.click(await screen.findByRole("option", { name: "최근 생성순" }));
  expect(names()).toEqual(["Alpha", "Beta"]);
  const input = screen.getByRole("searchbox", { name: "스페이스 이름 검색" });
  await user.type(input, " BETA ");
  expect(names()).toEqual(["Beta"]);
  await user.clear(input);
  await user.type(input, "missing");
  expect(screen.getByText(/검색 결과가 없습니다/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "검색 초기화" }));
  expect(names()).toEqual(["Alpha", "Beta"]);
  expect(items.map((item) => item.id)).toEqual(["a", "b"]);
});

it("localizes the list, counts and dialog in English without translating user names", async () => {
  mocks.list.mockReturnValue({ data: [space] });
  render(<SpacesScreen />, { locale: "en", messages: enMessages });
  expect(screen.getByRole("heading", { name: "Spaces" })).toBeInTheDocument();
  expect(screen.getByText("1 space")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: space.title })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Rename First Space" }));
  expect(screen.getByRole("textbox", { name: "Space name" })).toHaveValue(space.title);
  expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
});
