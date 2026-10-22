import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpaceNodeMenu } from "@/features/node-studio/ui/space-node-menu";
import { renderWithIntl } from "@/test-utils/intl";
import { useCanvasTranslation } from "./use-canvas-translation";
import enMessages from "./messages/en.json";

function Copy({ content, modelId }: { content: string; modelId: string }) {
  const tc = useCanvasTranslation();
  return <><span>{tc("Run node")}</span><p>{content}</p><code>{modelId}</code><span>{tc("Unlisted UI copy")}</span></>;
}

describe("native canvas application locale", () => {
  it.each(["ko", "en"] as const)("translates UI copy in %s while retaining user content and model identifiers", locale => {
    renderWithIntl(<Copy content="Run node" modelId="vendor/Image Input" />,
      locale === "en" ? { locale, messages: enMessages } : undefined);
    expect(screen.getByText(locale === "ko" ? "노드 실행" : "Run node", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Run node", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("vendor/Image Input", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("Unlisted UI copy")).toBeInTheDocument();
  });

  it("searches translated labels and chooses the canonical node kind", () => {
    const onChoose = vi.fn();
    renderWithIntl(<SpaceNodeMenu position={{ x: 0, y: 0 }} onClose={vi.fn()} onChoose={onChoose}
      kinds={["input.image", "input.video"]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "노드 검색" }), { target: { value: "이미지" } });
    expect(screen.queryByRole("option", { name: "비디오 입력" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "이미지 입력" }));
    expect(onChoose).toHaveBeenCalledWith("input.image");
  });
});
