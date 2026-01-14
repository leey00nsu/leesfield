import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ApiKeyManagementScreen } from "@/screens/api-key-management/ui/api-key-management-screen";

const fetchApiKeysMock = vi.fn();
const issueApiKeyMock = vi.fn();
const revokeApiKeyMock = vi.fn();

vi.mock("@/features/api-key-management/api/api-key-api", () => ({
  fetchApiKeys: () => fetchApiKeysMock(),
  issueApiKey: (label: string) => issueApiKeyMock(label),
  revokeApiKey: (id: string) => revokeApiKeyMock(id),
}));

const renderWithQueryClient = (ui: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe("ApiKeyManagementScreen", () => {
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

    const input = await screen.findByPlaceholderText("SEARCH_KEYS...");
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

    const labelInput = await screen.findByPlaceholderText("NEW_KEY_LABEL...");
    await user.type(labelInput, "NewKey");
    await user.click(screen.getByRole("button", { name: /generate new key/i }));

    await waitFor(() => {
      expect(issueApiKeyMock).toHaveBeenCalledWith("NewKey");
    });
    expect(screen.getByText("lf_live_test_key")).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: /revoked/i }));

    await waitFor(() => {
      expect(screen.queryByText("Production")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Legacy")).toBeInTheDocument();
  });
});
