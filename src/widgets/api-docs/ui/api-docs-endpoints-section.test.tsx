import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";
import type { ApiSection } from "@/features/api-docs/model/openapi-helpers";
import { renderWithIntl } from "@/test-utils/intl";

const appToastCopiedMock = vi.hoisted(() => vi.fn());
const appToastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/ui/app-toast", () => ({
  appToast: {
    copied: appToastCopiedMock,
    error: appToastErrorMock,
  },
}));

const originalClipboard = window.navigator.clipboard;

const apiSections: ApiSection[] = [
  {
    id: "images",
    title: "Images",
    operations: [
      {
        id: "post-image",
        method: "POST",
        path: "/api/external/generations",
        description: "Creates an image generation request.",
        request: {
          schema: null,
          properties: [],
          contentType: "application/json",
        },
        responses: [
          {
            status: "200",
            description: "OK",
            schema: null,
            example: { ok: true },
          },
          {
            status: "400",
            description: "Invalid request",
            schema: null,
            example: { message: "INVALID_REQUEST" },
          },
          {
            status: "204",
            description: "No content",
            schema: null,
          },
        ],
      },
    ],
  },
];

describe("ApiDocsEndpointsSection", () => {
  afterEach(() => {
    appToastCopiedMock.mockClear(); appToastErrorMock.mockClear();
    if (originalClipboard) {
      Object.defineProperty(window.navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
      });
    } else {
      // @ts-expect-error - cleanup optional test stub
      delete window.navigator.clipboard;
    }
  });

  it("스니펫 복사를 수행하고 상태를 표시한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const user = userEvent.setup();
    renderWithIntl(
      <ApiDocsEndpointsSection
        apiSections={apiSections}
        openApiDocument={null}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "JavaScript" }));
    expect(screen.getByRole("tab", { name: "JavaScript" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel").textContent).toContain("fetch(");

    expect(
      screen
        .getByRole("tab", { name: "JavaScript" })
        .closest("[data-slot=tabs]"),
    ).toHaveAttribute("data-horizontal");

    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {writeText} });
    const copyButton = screen.getByRole("button", { name: "코드 복사" });
    await user.click(copyButton);

    await waitFor(() => expect(appToastCopiedMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "복사됨" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코드 복사" })).toBe(copyButton);
    await user.click(copyButton);
    await waitFor(() => expect(appToastCopiedMock).toHaveBeenCalledTimes(2));
    expect(appToastCopiedMock).toHaveBeenCalledWith("복사됨");
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[0][0]).toBe(writeText.mock.calls[1][0]);
    expect(writeText.mock.calls[0][0]).toContain("/api/external/generations");
  });

  it("reports a rejected snippet copy through toast and leaves its label unchanged", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {configurable:true, value:{writeText:vi.fn().mockRejectedValue(new Error("denied"))}});
    renderWithIntl(<ApiDocsEndpointsSection apiSections={apiSections} openApiDocument={null} />);
    await user.click(screen.getByRole("button", {name:"코드 복사"}));
    await waitFor(() => expect(appToastErrorMock).toHaveBeenCalledWith("복사하지 못했습니다."));
    expect(screen.getByRole("button", {name:"코드 복사"})).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(appToastCopiedMock).not.toHaveBeenCalled();
  });
  it("성공 예제를 기본으로 열고 오류 예제를 펼쳐 볼 수 있다", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ApiDocsEndpointsSection
        apiSections={apiSections}
        openApiDocument={null}
      />,
    );

    const success = screen.getByText("200").closest("details")!;
    const failure = screen.getByText("400").closest("details")!;
    expect(success).toHaveAttribute("open");
    expect(success.textContent).toContain('"ok": true');
    expect(failure).not.toHaveAttribute("open");
    await user.click(failure.querySelector("summary")!);
    expect(failure).toHaveAttribute("open");
    expect(failure.textContent).toContain("INVALID_REQUEST");
    expect(screen.getByText("204").closest("details")!.querySelector("pre")).toBeNull();
  });
});
