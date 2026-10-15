import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl";
import { describe, expect, it, vi } from "vitest";
import { GenerationAssetReferenceBridge } from "./generation-asset-reference-bridge";
import { GenerationQueryContext } from "@/shared/lib/generation/query-context";
import type { GradioField } from "@/shared/model-catalog/gradio-contract";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("../hook/use-media-assets", () => ({ useMediaAsset: () => ({ data: { id: "stable", name: "Cafe", type: "image", status: "completed", mimeType: "image/png", url: "https://storage.example/new.png" } }) }));
const field: GradioField = { name: "refs", label: "References", kind: "files", media: "image", schema: { type: "array", items: { type: "string" }, maxItems: 2 }, required: false, nullable: false };
describe("explicit library reference bridge", () => {
  it("preserves prompt/options/current references and attaches only after a user action", () => {
    const attached = vi.fn();
    function Draft() { const [values, setValues] = useState({ prompt: "existing draft", seed: 0, flag: false, refs: ["old"] }); return <><GenerationAssetReferenceBridge fields={[field]} values={values} disabled={false} onAttach={(name, value) => { const next = { ...values, [name]: value }; attached(next); setValues(next as typeof values); }} /><p>{values.prompt}</p></>; }
    renderWithIntl(<GenerationQueryContext.Provider value={new URLSearchParams({ assetId: "stable" })}><Draft /></GenerationQueryContext.Provider>);
    expect(attached).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "업로드" }));
    expect(attached).toHaveBeenCalledWith({ prompt: "existing draft", seed: 0, flag: false, refs: ["old", "https://storage.example/new.png"] });
    expect(screen.getByText("existing draft")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "업로드" })).not.toBeInTheDocument();
  });
  it("does not route an asset into a full or incompatible role", () => { renderWithIntl(<GenerationQueryContext.Provider value={new URLSearchParams({ assetId: "stable" })}><GenerationAssetReferenceBridge fields={[field]} values={{ refs: ["a", "b"] }} disabled={false} onAttach={vi.fn()} /></GenerationQueryContext.Provider>); expect(screen.queryByRole("button", { name: "업로드" })).not.toBeInTheDocument(); expect(screen.getByText("호환되는 참조 입력이 있는 모델을 선택하세요.")).toBeInTheDocument(); });
});
