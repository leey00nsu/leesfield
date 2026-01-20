import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiDocsEndpointsSection } from "@/widgets/api-docs/ui/api-docs-endpoints-section";
import type {
  ApiSection,
} from "@/features/api-docs/model/openapi-helpers";
import { renderWithIntl } from "@/test-utils/intl";

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
        ],
      },
    ],
  },
];

describe("ApiDocsEndpointsSection", () => {
  afterEach(() => {
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

    expect(
      await screen.findByRole("button", { name: "복사됨" }),
    ).toBeInTheDocument();
  });
});
