import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedAssetClose } from "../hook/use-unsaved-asset-close";
import { renderWithIntl } from "@/test-utils/intl";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { MediaAssetApiError } from "../api/media-asset-api";
import { MediaAssetDetailPanel } from "./media-asset-detail-panel";
import { AppDialog, AppDialogContent, AppDialogTitle } from "@/shared/ui/app-dialog";
const copyFeedback = vi.hoisted(() => ({copy: vi.fn(), copied: vi.fn(), error: vi.fn()}));
vi.mock("@/shared/lib/clipboard", () => ({copyTextToClipboard: copyFeedback.copy}));
vi.mock("@/shared/ui/app-toast", () => ({appToast: {copied: copyFeedback.copied, error: copyFeedback.error}}));
const mocks = vi.hoisted(() => ({ asset: vi.fn(), patch: vi.fn(), projects: vi.fn(), retry: vi.fn() }));
vi.mock("../hook/use-media-assets", () => ({
  useMediaAsset: (...args: unknown[]) => mocks.asset(...args),
  useAssetProjects: () => mocks.projects(),
  usePatchAssetMetadata: () => ({ mutateAsync: mocks.patch, isPending: false }),
}));
const asset: MediaAssetDto = { id: "file-stable", version: 7, displayName: "Original", type: "image", origin: "upload", status: "completed", url: "/image.png", mimeType: "image/png", bytes: "512", width: 100, height: 100, durationMs: null, sourceOperationId: null, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" };
const projects = [{ id: "project", name: "Cafe", parentId: null }, { id: "child", name: "Portrait", parentId: "project" }, { id: "other", name: "Street", parentId: null }];
beforeEach(() => {
  copyFeedback.copy.mockReset(); copyFeedback.copied.mockReset(); copyFeedback.error.mockReset();
  mocks.asset.mockReturnValue({ data: asset }); mocks.patch.mockReset().mockImplementation(async body => ({ ...asset, ...body, version: body.expectedVersion + 1 }));
  mocks.retry.mockReset(); mocks.projects.mockReturnValue({ data: projects, isLoading: false, isError: false, refetch: mocks.retry });
});

describe("shared asset detail editor", () => {
  it("copies draft IDs with only toast feedback and keeps existing form errors and unsaved values", async () => {
    const user = userEvent.setup();
    copyFeedback.copy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    mocks.patch.mockRejectedValueOnce(new MediaAssetApiError(409, "MEDIA_ASSET_VERSION_CONFLICT"));
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Asset ID" }), { target: { value: "DRAFT_ID" } });
    await user.click(screen.getByRole("button", { name: "저장" }));
    const originalAlert = await screen.findByRole("alert");
    const errorText = originalAlert.textContent;
    const button = screen.getByRole("button", { name: "ID 복사" });
    await user.click(button);
    expect(copyFeedback.copy).toHaveBeenCalledWith("DRAFT_ID");
    await waitFor(() => expect(copyFeedback.copied).toHaveBeenCalledWith("저장되지 않은 Asset ID를 복사했습니다."));
    await user.click(button);
    await waitFor(() => expect(copyFeedback.error).toHaveBeenCalledWith("복사하지 못했습니다. 위 ID를 선택해 복사하세요."));
    expect(originalAlert.textContent).toBe(errorText);
    expect(screen.getByRole("textbox", { name: "Asset ID" })).toHaveValue("DRAFT_ID");
    expect(mocks.patch).toHaveBeenCalledOnce();
    expect(button).toHaveAccessibleName("ID 복사");
    expect(screen.queryByText("저장되지 않은 Asset ID를 복사했습니다.")).not.toBeInTheDocument();
  });

  it("protects an edited draft on close and Escape, allows cancellation and discards only on confirmation", async () => {
    const user = userEvent.setup(), close = vi.fn();
    function GuardedDetail() {
      const guard = useUnsavedAssetClose(close, false);
      return <><AppDialog open onOpenChange={open => {if (!open) guard.requestClose();}}><AppDialogContent showCloseButton={false} aria-describedby={undefined}>
        <AppDialogTitle>Draft detail</AppDialogTitle><MediaAssetDetailPanel assetId={asset.id} onClose={guard.requestClose} onDirtyChange={guard.setDirty} />
      </AppDialogContent></AppDialog>{guard.confirmation}</>;
    }
    renderWithIntl(<GuardedDetail />);
    expect(screen.getByRole("button", {name:"저장"})).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", {name:"이름"}), {target:{value:"Unsaved draft"}});
    await user.click(screen.getByRole("button", {name:"닫기"}));
    const confirm = within(await screen.findByRole("alertdialog"));
    expect(close).not.toHaveBeenCalled();
    await user.click(confirm.getByRole("button", {name:"계속 편집"}));
    expect(screen.getByRole("textbox", {name:"이름"})).toHaveValue("Unsaved draft");
    await user.keyboard("{Escape}");
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", {name:"변경 버리기"}));
    expect(close).toHaveBeenCalledTimes(1);
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it("does not mark an immediate favorite write as an unsaved metadata change", async () => {
    const user = userEvent.setup(), dirty = vi.fn();
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} onDirtyChange={dirty} />);
    await user.click(screen.getByRole("button", {name:"즐겨찾기 추가"}));
    await screen.findByText("즐겨찾기를 저장했습니다.");
    expect(screen.getByRole("button", {name:"저장"})).toBeDisabled();
    expect(dirty).not.toHaveBeenCalledWith(true);
  });

  it("saves all editable fields from the footer after changing tabs and edits the reference ID without changing file identity", async () => {
    const user = userEvent.setup();
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Asset ID" })).not.toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Asset ID" })).toHaveValue(asset.id);
    await user.clear(screen.getByRole("textbox", { name: "이름" }));
    await user.type(screen.getByRole("textbox", { name: "이름" }), "Edited");
    await user.type(screen.getByRole("textbox", { name: "버전" }), "v2");
    await user.type(screen.getByRole("textbox", { name: "설명" }), "Front view");
    await user.click(screen.getByRole("combobox", { name: "분류" }));
    await user.click(await screen.findByRole("option", { name: "소품" }));
    await user.click(screen.getByRole("combobox", { name: "관리 상태" }));
    await user.click(await screen.findByRole("option", { name: "활성" }));
    await user.clear(screen.getByRole("textbox", { name: "Asset ID" }));
    await user.type(screen.getByRole("textbox", { name: "Asset ID" }), "HERO_01");
    await user.click(screen.getByRole("button", { name: "프로젝트 선택" }));
    const projectDialog = within(await screen.findByRole("dialog", { name: "프로젝트 선택" }));
    await user.click(projectDialog.getByRole("checkbox", { name: "Cafe" }));
    await user.click(projectDialog.getByRole("button", { name: "선택 완료" }));
    await user.click(screen.getByRole("tab", { name: "파일" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith({ id: asset.id, expectedVersion: 7, displayName: "Edited", classification: "prop", displayVersion: "v2", description: "Front view", managementStatus: "active", projectIds: ["project"], referenceId: "HERO_01" }));
    expect(screen.queryByRole("tab", { name: "정리" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "일반" }));
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("Edited");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "설명" }), {target:{value:"Updated after save"}});
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 8 })));
  });
  it("preserves the draft across background refresh and requires explicit reload after a version conflict", async () => {
    const user = userEvent.setup();
    const props = { assetId: asset.id, onClose: vi.fn() };
    const view = renderWithIntl(<MediaAssetDetailPanel {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: "Local draft" } });
    mocks.asset.mockReturnValue({ data: { ...asset, version: 9, displayName: "Remote edit" } });
    view.rerender(<MediaAssetDetailPanel {...props} />);
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("Local draft");
    mocks.patch.mockRejectedValueOnce(new MediaAssetApiError(409, "ASSET_VERSION_CONFLICT"));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByRole("alert");
    expect(mocks.patch).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 7 }));
    await user.click(screen.getByRole("button", { name: "새로고침" }));
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("Remote edit");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: {value:"After reload"} });
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 9 })));
  });
  it("does not offer an active save for read-only or missing result files", () => {
    const view = renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} writable={false} />);
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ID 복사" })).toBeEnabled();
    mocks.asset.mockReturnValue({ data: undefined });
    view.rerender(<MediaAssetDetailPanel assetId={null} onClose={vi.fn()} />);
    expect(screen.getByText("편집할 결과 파일이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });
  it("saves only the star immediately and preserves draft fields for a subsequent CAS save", async () => {
    const user = userEvent.setup();
    mocks.patch.mockResolvedValueOnce({ ...asset, version: 8, starred: true });
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: "Unsaved name" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Asset ID" }), { target: { value: "HERO_01" } });
    await user.click(screen.getByRole("button", { name: "즐겨찾기 추가" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith({ id: asset.id, expectedVersion: 7, starred: true }));
    expect(screen.getByRole("button", { name: "즐겨찾기 해제" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("Unsaved name");
    expect(screen.getByRole("textbox", { name: "Asset ID" })).toHaveValue("HERO_01");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 8, displayName: "Unsaved name", referenceId: "HERO_01" })));
    expect(mocks.patch.mock.calls.at(-1)?.[0]).not.toHaveProperty("starred");
  });
  it("keeps the star and all unsaved fields unchanged when the immediate star write fails", async () => {
    const user = userEvent.setup();
    mocks.patch.mockRejectedValueOnce(new MediaAssetApiError(500, "DB_SAVE_FAILED"));
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "설명" }), { target: { value: "Unsaved description" } });
    await user.click(screen.getByRole("button", { name: "즐겨찾기 추가" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "즐겨찾기 추가" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("textbox", { name: "설명" })).toHaveValue("Unsaved description");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenLastCalledWith(expect.objectContaining({ expectedVersion: 7, description: "Unsaved description" })));
  });
  it("shows a specific duplicate Asset ID error without clearing the draft", async () => {
    const user = userEvent.setup();
    mocks.patch.mockRejectedValueOnce(new MediaAssetApiError(409, "ASSET_ID_CONFLICT"));
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Asset ID" }), { target: { value: "TAKEN_ID" } });
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 사용 중인 Asset ID");
    expect(screen.getByRole("textbox", { name: "Asset ID" })).toHaveValue("TAKEN_ID");
  });
  it("discards cancelled selections and only persists completed independent parent/child choices with the detail save", async () => {
    const user = userEvent.setup();
    mocks.asset.mockReturnValue({ data: { ...asset, projectIds: ["project"] } });
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "이름" }), { target: { value: "Keep this draft" } });
    const open = async () => {
      await user.click(screen.getByRole("button", { name: "프로젝트 변경" }));
      return within(await screen.findByRole("dialog", { name: "프로젝트 선택" }));
    };
    let dialog = await open();
    await user.click(dialog.getByRole("checkbox", { name: "Cafe" }));
    await user.click(dialog.getByRole("checkbox", { name: "Street" }));
    await user.click(dialog.getByRole("button", { name: "취소" }));
    dialog = await open();
    expect(dialog.getByRole("checkbox", { name: "Cafe" })).toBeChecked();
    expect(dialog.getByRole("checkbox", { name: "Street" })).not.toBeChecked();
    await user.click(dialog.getByRole("button", { name: "프로젝트 펼치기: Cafe" }));
    expect(dialog.getByRole("checkbox", { name: "Cafe / Portrait" })).not.toBeChecked();
    await user.click(dialog.getByRole("checkbox", { name: "Cafe / Portrait" }));
    await user.click(dialog.getByRole("checkbox", { name: "Cafe" }));
    await user.type(dialog.getByRole("textbox", { name: "프로젝트 검색" }), "street");
    await user.click(dialog.getByRole("checkbox", { name: "Street" }));
    await user.clear(dialog.getByRole("textbox", { name: "프로젝트 검색" }));
    expect(dialog.getByRole("checkbox", { name: "Cafe / Portrait" })).toBeChecked();
    expect(dialog.getByRole("checkbox", { name: "Cafe" })).not.toBeChecked();
    await user.click(dialog.getByRole("button", { name: "선택 완료" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "이름" })).toHaveValue("Keep this draft");
    dialog = await open();
    expect(dialog.getByRole("checkbox", { name: "Cafe / Portrait" })).toBeChecked();
    await user.click(dialog.getByRole("button", { name: "취소" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Keep this draft", projectIds: ["child", "other"] })));
  });
  it("closes only the nested project chooser with Escape, restores focus and permits explicit clearing without a premature write", async () => {
    const user = userEvent.setup(), outerClose = vi.fn();
    mocks.asset.mockReturnValue({ data: { ...asset, projectIds: ["project"] } });
    renderWithIntl(<AppDialog open onOpenChange={outerClose}><AppDialogContent aria-describedby={undefined} showCloseButton={false}>
      <AppDialogTitle>Asset detail</AppDialogTitle><MediaAssetDetailPanel assetId={asset.id} onClose={outerClose} />
    </AppDialogContent></AppDialog>);
    await user.click(screen.getByRole("button", { name: "프로젝트 변경" }));
    let dialog = within(await screen.findByRole("dialog", { name: "프로젝트 선택" }));
    await user.click(dialog.getByRole("checkbox", { name: "Cafe" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "프로젝트 선택" })).not.toBeInTheDocument());
    expect(outerClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "프로젝트 변경" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "프로젝트 변경" }));
    dialog = within(await screen.findByRole("dialog", { name: "프로젝트 선택" }));
    expect(dialog.getByRole("checkbox", { name: "Cafe" })).toBeChecked();
    await user.click(dialog.getByRole("button", { name: "선택 해제" }));
    await user.click(dialog.getByRole("button", { name: "선택 완료" }));
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(screen.getByText("프로젝트 미포함")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ projectIds: [] })));
  });
  it("blocks completing loading/error choices, retries and keeps the selection across empty search results", async () => {
    const user = userEvent.setup();
    mocks.projects.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: mocks.retry });
    const view = renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "프로젝트 선택" }));
    let dialog = within(await screen.findByRole("dialog", { name: "프로젝트 선택" }));
    expect(dialog.getByRole("button", { name: "선택 완료" })).toBeDisabled();
    mocks.projects.mockReturnValue({ data: projects, isLoading: false, isError: true, refetch: mocks.retry });
    view.rerender(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    expect(dialog.getByRole("button", { name: "선택 완료" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: "다시 시도" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    mocks.projects.mockReturnValue({ data: projects, isLoading: false, isError: false, refetch: mocks.retry });
    view.rerender(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    dialog = within(screen.getByRole("dialog", { name: "프로젝트 선택" }));
    await user.click(dialog.getByRole("checkbox", { name: "Cafe" }));
    await user.type(dialog.getByRole("textbox", { name: "프로젝트 검색" }), "no-such-project");
    expect(dialog.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "선택 완료" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith(expect.objectContaining({ projectIds: ["project"] })));
  });
  it("preserves unavailable memberships and enforces the existing 100-project limit while allowing deselection", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 101 }, (_, i) => ({ id: "p" + i, name: "Project " + i, parentId: null }));
    mocks.projects.mockReturnValue({ data: many, refetch: mocks.retry });
    mocks.asset.mockReturnValue({ data: { ...asset, projectIds: ["unavailable", ...many.slice(0, 99).map(item => item.id)] } });
    renderWithIntl(<MediaAssetDetailPanel assetId={asset.id} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "프로젝트 변경" }));
    const dialog = within(await screen.findByRole("dialog", { name: "프로젝트 선택" }));
    expect(dialog.getByRole("checkbox", { name: "Project 99" })).toBeDisabled();
    expect(dialog.getByRole("checkbox", { name: "unavailable" })).toBeChecked();
    await user.click(dialog.getByRole("checkbox", { name: "Project 0" }));
    await user.click(dialog.getByRole("checkbox", { name: "Project 99" }));
    await user.click(dialog.getByRole("button", { name: "선택 완료" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    const ids = mocks.patch.mock.calls[0][0].projectIds;
    expect(ids).toHaveLength(100); expect(ids).toContain("unavailable"); expect(ids).toContain("p99"); expect(ids).not.toContain("p0");
  });
});
