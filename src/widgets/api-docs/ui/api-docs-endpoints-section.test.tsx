import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";
import type { ApiSection } from "@/features/api-docs/model/openapi-helpers";
import { renderWithIntl } from "@/test-utils/intl";

const appToastCopiedMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/ui/app-toast", () => ({
  appToast: {
    copied: appToastCopiedMock,
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
    appToastCopiedMock.mockClear();
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

    const copyButton = screen.getByRole("button", { name: "코드 복사" });
    await user.click(copyButton);

    expect(await screen.findByRole("button", { name: "복사됨" })).toBeTruthy();
    expect(appToastCopiedMock).toHaveBeenCalledWith("복사됨");
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
