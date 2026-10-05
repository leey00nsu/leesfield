import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import { PromptPresetsScreen } from "./prompt-presets-screen";
import { builtinPromptPresets } from "@/shared/prompt-presets/builtin-prompt-presets";
import type { PromptPreset } from "@/shared/prompt-presets/prompt-preset-contract";

const p = builtinPromptPresets[0];
const builtin: PromptPreset = { ...p, revision: 3, prompt: "saved character text", builtinKey: p.key, builtinRevision: 1, defaultPrompt: p.prompt, isActive: true, isModified: true };
afterEach(() => vi.unstubAllGlobals());
describe("preset management", () => {
  it("searches localized names and preserves a modal draft when closing is cancelled", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [builtin] }))));
    const user = userEvent.setup();
    renderWithIntl(<PromptPresetsScreen />);
    const search = screen.getByRole("searchbox", { name: "프리셋 검색…" });
    await user.type(search, "캐릭터");
    const row = await screen.findByRole("button", { name: "캐릭터 시트" });
    await user.click(row);
    const dialog = screen.getByRole("dialog", { name: "캐릭터 시트" });
    expect(within(dialog).getByRole("button", { name: "I2I" })).toBeDisabled();
    expect(within(dialog).queryByRole("combobox", { name: "권장 화면 비율" })).toBeNull();
    expect(within(dialog).getByLabelText("이름")).toHaveValue("캐릭터 시트");
    await user.clear(within(dialog).getByLabelText("프롬프트"));
    await user.type(within(dialog).getByLabelText("프롬프트"), "unsaved modal draft");
    await user.keyboard("{Escape}");
    const discard = await screen.findByRole("dialog", { name: "저장하지 않은 내용을 버릴까요?" });
    await user.click(within(discard).getByRole("button", { name: "취소" }));
    expect(screen.getByLabelText("프롬프트")).toHaveValue("unsaved modal draft");
    await user.click(screen.getByRole("button", { name: "취소" }));
    await user.click(within(screen.getByRole("dialog", { name: "저장하지 않은 내용을 버릴까요?" })).getByRole("button", { name: "버리고 계속" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(row).toHaveFocus();
  });
  it("preserves edits on conflict and duplicates that draft as a new personal preset", async () => {
    const requests: Array<{ method: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ items: [builtin] }));
      const body = JSON.parse(String(init.body)); requests.push({ method: init.method, body });
      if (init.method === "PATCH") return new Response(JSON.stringify({ message: "PRESET_CONFLICT" }), { status: 409 });
      return new Response(JSON.stringify({ item: { ...body, revision: 1, builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false } }), { status: 201 });
    }));
    const user = userEvent.setup(); renderWithIntl(<PromptPresetsScreen />);
    await user.click(await screen.findByRole("button", { name: "캐릭터 시트" }));
    const editor = screen.getByRole("form", { name: "프리셋 관리" }), prompt = within(editor).getByLabelText("프롬프트");
    await user.clear(prompt); await user.type(prompt, "my unsaved work");
    await user.click(within(editor).getByRole("button", { name: "저장" }));
    await screen.findByText(/다른 곳에서 프리셋이 변경되었습니다/);
    expect(prompt).toHaveValue("my unsaved work");
    expect(requests[0].body).toMatchObject({ expectedRevision: 3, prompt: "my unsaved work" });
    await user.click(screen.getByRole("button", { name: "복제" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({ method: "POST", body: { prompt: "my unsaved work", modality: "image" } });
    expect(requests[1].body.key).not.toBe(builtin.key);
    expect(screen.queryByRole("button", { name: "저장본을 제공 원문으로 복원" })).toBeNull();
  });
  it("restores the saved builtin only after confirmation and uses the current revision", async () => {
    let item = builtin;
    const requests: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ items: [item] }));
      requests.push(JSON.parse(String(init.body)));
      if (url.endsWith("/restore")) item = { ...item, revision: 4, prompt: p.prompt, isModified: false };
      return new Response(JSON.stringify({ item }));
    }));
    const user = userEvent.setup(); renderWithIntl(<PromptPresetsScreen />);
    await user.click(await screen.findByRole("button", { name: "캐릭터 시트" }));
    await user.click(screen.getByRole("button", { name: "저장본을 제공 원문으로 복원" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(requests).toHaveLength(0);
    expect(screen.getByLabelText("프롬프트")).toHaveValue("saved character text");
    await user.click(screen.getByRole("button", { name: "저장본을 제공 원문으로 복원" }));
    await user.click(screen.getByRole("button", { name: "복원" }));
    await waitFor(() => expect(screen.getByLabelText("프롬프트")).toHaveValue(p.prompt));
    expect(requests).toEqual([{ expectedRevision: 3 }]);
    expect(screen.getByText("버전 4")).toBeInTheDocument();
  });
});

describe("preset input types and modal actions", () => {
  it("saves video I2V/T2V requirements and preserves hidden existing recommendations", async () => {
    let item: PromptPreset = { ...builtin, key: "personal-video", name: "Video preset", modality: "video", builtinKey: null, builtinRevision: null, defaultPrompt: null, requiredInputs: { referenceImageCount: 0 }, recommendedParameters: { aspectRatio: "16:9" } };
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ items: [item] }));
      const body = JSON.parse(String(init.body)); requests.push(body);
      const values = { ...body }; delete values.expectedRevision;
      item = { ...item, ...values, revision: item.revision + 1 };
      return new Response(JSON.stringify({ item }));
    }));
    const user = userEvent.setup(); renderWithIntl(<PromptPresetsScreen />);
    await user.click(await screen.findByRole("button", { name: "Video preset" }));
    const form = screen.getByRole("form", { name: "프리셋 관리" });
    expect(within(form).queryByRole("combobox", { name: "권장 화면 비율" })).toBeNull();
    expect(within(form).queryByRole("checkbox", { name: /참고 이미지/ })).toBeNull();
    expect(within(form).getByRole("button", { name: "T2V" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(form).getByRole("button", { name: "I2V" }));
    expect(within(form).getByText("시작 이미지 1개를 필수로 받아 비디오 생성")).toBeInTheDocument();
    const footer = form.querySelector('[data-app-dialog-footer]')!;
    expect(Array.from(footer.querySelectorAll('button')).map(b => b.textContent)).toEqual(["복제", "삭제", "취소", "저장"]);
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ expectedRevision: 3, modality: "video", requiredInputs: { referenceImageCount: 1 }, recommendedParameters: { aspectRatio: "16:9" } });
    await waitFor(() => expect(within(form).getByRole("button", { name: "저장" })).toBeEnabled());
    await user.click(within(form).getByRole("button", { name: "T2V" }));
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({ expectedRevision: 4, requiredInputs: { referenceImageCount: 0 } });
  });
  it("resets image requirements for audio and creates a preset without ratio", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return new Response(JSON.stringify({ items: [] }));
      const body = JSON.parse(String(init.body)); requests.push(body);
      return new Response(JSON.stringify({ item: { ...body, revision: 1, builtinKey: null, builtinRevision: null, defaultPrompt: null, isActive: true, isModified: false } }));
    }));
    const user = userEvent.setup(); renderWithIntl(<PromptPresetsScreen />);
    await user.click(screen.getByRole("button", { name: "프리셋 추가" }));
    await user.type(screen.getByLabelText("이름"), "Audio preset");
    await user.type(screen.getByLabelText("프롬프트"), "Generate a melody");
    await user.click(screen.getByRole("button", { name: "I2I" }));
    await user.click(screen.getByRole("combobox", { name: "매체" }));
    await user.click(await screen.findByRole("option", { name: "오디오" }));
    const form = screen.getByRole("form", { name: "프리셋 관리" });
    expect(within(form).getByRole("button", { name: "T2A" })).toHaveAttribute("aria-pressed", "true");
    expect(within(form).queryByRole("button", { name: "I2I" })).toBeNull();
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({ modality: "audio", requiredInputs: { referenceImageCount: 0 }, recommendedParameters: {} });
  });
  it("places destructive confirmation after cancel and makes no request on cancellation", async () => {
    const personal: PromptPreset = { ...builtin, key: "personal", name: "Personal", builtinKey: null, builtinRevision: null, defaultPrompt: null };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [personal] })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); renderWithIntl(<PromptPresetsScreen />);
    await user.click(await screen.findByRole("button", { name: "Personal" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    const dialog = screen.getByRole("dialog", { name: "프리셋을 삭제할까요?" });
    const footer = dialog.querySelector('[data-app-dialog-footer]')!;
    expect(Array.from(footer.querySelectorAll('button')).map(b => b.textContent)).toEqual(["취소", "삭제"]);
    expect(within(dialog).getByRole("button", { name: "삭제" })).toHaveAttribute("data-app-dialog-danger-button");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(screen.getByLabelText("프롬프트")).toHaveValue(builtin.prompt);
  });
});
