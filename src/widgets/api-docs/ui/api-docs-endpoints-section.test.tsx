import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";
import type {
  ApiSection,
} from "@/features/api-docs/model/openapi-helpers";
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
        path: "/api/external/image-generation",
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
        apiVersion="v1"
        openApiDocument={null}
      />,
    );

    const copyButton = screen.getByRole("button", { name: "코드 복사" });
    await user.click(copyButton);

    expect(await screen.findByRole("button", { name: "복사됨" })).toBeTruthy();
    expect(appToastCopiedMock).toHaveBeenCalledWith("복사됨");
  });

  it("200 응답과 오류 응답을 같은 카드 UI로 표시한다", () => {
    renderWithIntl(
      <ApiDocsEndpointsSection
        apiSections={apiSections}
        apiVersion="v1"
        openApiDocument={null}
      />,
    );

    const responseCards = screen.getAllByTestId("api-response-card");

    expect(responseCards).toHaveLength(2);
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("400")).toBeTruthy();
    expect(responseCards[0].className).toBe(responseCards[1].className);
  });
});
