import { ApiKeyEditModal } from "@/features/api-key-management/ui/api-key-edit-modal";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ApiKeyManagementScreen } from "@/screens/api-key-management/ui/api-key-management-screen";
import { renderWithIntl } from "@/test-utils/intl";
import { standardApiKeyPermissions } from "@/shared/api/platform-permissions";

const toast21 = vi.hoisted(() => ({ copied: vi.fn(), error: vi.fn() }));
vi.mock("@/shared/ui/app-toast", () => ({ appToast: toast21 }));
const copyTextMock = vi.fn();
vi.mock("@/shared/lib/clipboard", () => ({ copyTextToClipboard: (value: string) => copyTextMock(value) }));

const fetchApiKeysMock = vi.fn();
const issueApiKeyMock = vi.fn();
const revokeApiKeyMock = vi.fn();

vi.mock("@/features/api-key-management/api/api-key-api", () => ({
  fetchApiKeys: () => fetchApiKeysMock(),
  issueApiKey: (...args: unknown[]) => issueApiKeyMock(...args),
  revokeApiKey: (id: string) => revokeApiKeyMock(id),
}));

const renderWithQueryClient = (ui: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const rendered = renderWithIntl(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
  return { ...rendered, queryClient };
};

describe("ApiKeyManagementScreen", () => {
  beforeEach(() => {
    fetchApiKeysMock.mockReset();
    issueApiKeyMock.mockReset();
    revokeApiKeyMock.mockReset();
    copyTextMock.mockReset();
    toast21.copied.mockReset(); toast21.error.mockReset();
  });
  it("발급 모달 취소는 요청하지 않고 성공한 키는 복사 후 닫을 때 지운다", async () => {
    fetchApiKeysMock.mockResolvedValue({ items: [] });
    issueApiKeyMock.mockResolvedValue({ apiKey: "lf_live_once", record: { id: "once", label: "Once", maskedKey: "lf_live_...once", status: "active", lastUsedAt: null, createdAt: "2026-01-10T00:00:00Z", revokedAt: null, permissions: [...standardApiKeyPermissions] } });
    copyTextMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const user = userEvent.setup();
    const { queryClient } = renderWithQueryClient(<ApiKeyManagementScreen />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(issueApiKeyMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    await user.type(screen.getByPlaceholderText("예: Production"), "Once");
    await user.click(screen.getByRole("button", { name: "생성" }));
    expect(await screen.findByDisplayValue("lf_live_once")).toBeInTheDocument();
    expect(JSON.stringify(queryClient.getMutationCache().getAll().map(mutation => mutation.state.data))).not.toContain("lf_live_once");
    await user.click(screen.getByRole("button", { name: "키 복사" }));
    await waitFor(() => expect(toast21.error).toHaveBeenCalledWith("복사하지 못했습니다. 키를 선택해 직접 복사해주세요."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "키 복사" }));
    expect(copyTextMock).toHaveBeenLastCalledWith("lf_live_once");
    await waitFor(() => expect(toast21.copied).toHaveBeenCalledWith("복사됨"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "키 복사" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue("lf_live_once")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    expect(screen.getByPlaceholderText("예: Production")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "생성 요청" })).toBeChecked();
    expect(screen.queryByDisplayValue("lf_live_once")).not.toBeInTheDocument();
  });

  it("ignores a copy completion after the one-time key modal was closed", async () => {
    fetchApiKeysMock.mockResolvedValue({ items: [] });
    issueApiKeyMock.mockResolvedValue({ apiKey: "lf_live_delayed", record: { id: "delayed", label: "Delayed", maskedKey: "lf_live_...delayed", status: "active", createdAt: "2026-01-10T00:00:00Z", permissions: [...standardApiKeyPermissions] } });
    let finish!: (value: boolean) => void;
    copyTextMock.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);
    await user.click(screen.getByRole("button", {name: "새 키 발급"}));
    await user.click(screen.getByRole("button", {name: "생성"}));
    await screen.findByDisplayValue("lf_live_delayed");
    await user.click(screen.getByRole("button", {name: "키 복사"}));
    await user.click(screen.getByRole("button", {name: "닫기"}));
    await act(async () => { finish(true); });
    await waitFor(() => expect(screen.queryByDisplayValue("lf_live_delayed")).not.toBeInTheDocument());
    expect(toast21.copied).not.toHaveBeenCalled();
    expect(toast21.error).not.toHaveBeenCalled();
  });
  it("생성 중에는 중복 제출과 모달 닫기를 막는다", async () => {
    fetchApiKeysMock.mockResolvedValue({ items: [] });
    let resolveIssue!: (value: unknown) => void;
    issueApiKeyMock.mockImplementationOnce(() => new Promise(resolve => { resolveIssue = resolve; }));
    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);
    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    await user.dblClick(screen.getByRole("button", { name: "생성" }));
    expect(issueApiKeyMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "생성 중…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    resolveIssue({ apiKey: "lf_live_busy", record: { id: "busy", label: "Busy", maskedKey: "lf_live_...busy", status: "active", lastUsedAt: null, createdAt: "2026-01-10T00:00:00Z", revokedAt: null } });
    expect(await screen.findByDisplayValue("lf_live_busy")).toBeInTheDocument();
  });
  it("검색 필터가 동작한다", async () => {
    fetchApiKeysMock.mockResolvedValue({
      items: [
        {
          id: "key-1",
          label: "Production",
          maskedKey: "lf_live_aaaa...bbbb",
          status: "active",
          lastUsedAt: null,
          createdAt: "2026-01-10T00:00:00Z",
          revokedAt: null,
        },
        {
          id: "key-2",
          label: "Legacy",
          maskedKey: "lf_live_cccc...dddd",
          status: "revoked",
          lastUsedAt: null,
          createdAt: "2026-01-09T00:00:00Z",
          revokedAt: "2026-01-10T00:00:00Z",
        },
      ],
    });

    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);

    await user.click(screen.getByRole("button", { name: "검색" }));
    const input = await screen.findByPlaceholderText("검색…");
    await user.type(input, "Legacy");

    await waitFor(() => {
      expect(screen.queryByText("Production")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Legacy")).toBeInTheDocument();
  });

  it("API 키 발급 동작을 호출한다", async () => {
    fetchApiKeysMock.mockResolvedValue({ items: [] });
    issueApiKeyMock.mockResolvedValue({
      apiKey: "lf_live_test_key",
      record: {
        id: "key-3",
        label: "NewKey",
        maskedKey: "lf_live_test...key",
        status: "active",
        lastUsedAt: null,
        createdAt: "2026-01-10T00:00:00Z",
        revokedAt: null,
      },
    });

    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);

    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    const labelInput = await screen.findByPlaceholderText("예: Production");
    await user.type(labelInput, "NewKey");
    await user.click(screen.getByRole("button", { name: "생성" }));

    await waitFor(() => {
      expect(issueApiKeyMock).toHaveBeenCalledWith("NewKey", [...standardApiKeyPermissions]);
    });
    expect(screen.getByDisplayValue("lf_live_test_key")).toBeInTheDocument();
  });

  it("revoked 필터가 동작한다", async () => {
    fetchApiKeysMock.mockResolvedValue({
      items: [
        {
          id: "key-1",
          label: "Production",
          maskedKey: "lf_live_aaaa...bbbb",
          status: "active",
          lastUsedAt: null,
          createdAt: "2026-01-10T00:00:00Z",
          revokedAt: null,
        },
        {
          id: "key-2",
          label: "Legacy",
          maskedKey: "lf_live_cccc...dddd",
          status: "revoked",
          lastUsedAt: null,
          createdAt: "2026-01-09T00:00:00Z",
          revokedAt: "2026-01-10T00:00:00Z",
        },
      ],
    });

    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);

    await user.click(screen.getByRole("button", { name: "필터" }));
    await user.click(await screen.findByRole("button", { name: "폐기됨" }));

    await waitFor(() => {
      expect(screen.queryByText("Production")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Legacy")).toBeInTheDocument();
  });

  it("발급 실패를 표시하고 라벨과 권한을 유지한 채 재시도한다", async () => {
    fetchApiKeysMock.mockResolvedValue({ items: [] });
    const permissions = [...standardApiKeyPermissions].filter(permission => permission !== "generations:create");
    issueApiKeyMock.mockRejectedValueOnce(new Error('{"message":"INTERNAL_SERVER_ERROR"}'));
    issueApiKeyMock.mockResolvedValueOnce({
      apiKey: "lf_live_retry",
      record: { id: "retry", label: "RetryKey", maskedKey: "lf_live_...retry", status: "active",
        lastUsedAt: null, createdAt: "2026-01-10T00:00:00Z", revokedAt: null, permissions },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);
    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    const label = await screen.findByPlaceholderText("예: Production");
    await user.type(label, "RetryKey");
    await user.click(screen.getByRole("checkbox", { name: "생성 요청" }));
    await user.click(screen.getByRole("button", { name: "생성" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("API 키를 발급하지 못했습니다.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("INTERNAL_SERVER_ERROR");
    expect(label).toHaveValue("RetryKey");
    expect(issueApiKeyMock).toHaveBeenLastCalledWith("RetryKey", permissions);
    await user.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(await screen.findByDisplayValue("lf_live_retry")).toBeInTheDocument();
    expect(issueApiKeyMock).toHaveBeenLastCalledWith("RetryKey", permissions);
    expect(screen.queryByRole("button", { name: "생성" })).not.toBeInTheDocument();
  });

  it("선택한 기능별 권한을 키 발급 요청에 전달한다", async () => {
    fetchApiKeysMock.mockResolvedValue({ items: [] });
    issueApiKeyMock.mockResolvedValue({
      apiKey: "lf_live_read",
      record: { id: "read", label: "Read", maskedKey: "lf_live_...read", status: "active",
        lastUsedAt: null, createdAt: "2026-01-10T00:00:00Z", revokedAt: null, permissions: [...standardApiKeyPermissions].filter(permission => permission !== "generations:create") },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<ApiKeyManagementScreen />);
    await user.click(screen.getByRole("button", { name: "새 키 발급" }));
    await user.type(await screen.findByPlaceholderText("예: Production"), "Read");
    await user.click(screen.getByRole("checkbox", { name: "생성 요청" }));
    await user.click(screen.getByRole("button", { name: "생성" }));
    await waitFor(() => expect(issueApiKeyMock).toHaveBeenCalledWith("Read", [...standardApiKeyPermissions].filter(permission => permission !== "generations:create")));
  });
});

it("API 키 편집은 공통 닫기 버튼 하나만 표시한다", async()=> {
 const close=vi.fn();const user=userEvent.setup();
 renderWithIntl(<ApiKeyEditModal open apiKey={{id:"key",createdAtLabel:"2026-01-10",lastUsedLabel:"—",label:"Test",maskedKey:"lf_...test",status:"active",lastUsedAt:null,createdAt:"2026-01-10T00:00:00Z",revokedAt:null}} label="Test" error={null} isSaving={false} isRevoking={false} onLabelChange={vi.fn()} onClose={close} onSave={vi.fn()} onRevoke={vi.fn()}/>);
 expect(screen.getAllByRole("button",{name:"닫기"})).toHaveLength(1);
 const button=screen.getByRole("button",{name:"닫기"});expect(button).toHaveClass("rounded-md");expect(button.querySelectorAll("svg")).toHaveLength(1);
 await user.click(button);expect(close).toHaveBeenCalledOnce();
});
