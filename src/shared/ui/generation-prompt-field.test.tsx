vi.mock("@/shared/api/reference-file-upload", async importOriginal => ({
  ...await importOriginal<typeof import("@/shared/api/reference-file-upload")>(),
  uploadReferenceFiles: async (files: File[]) => files.map(file=>({id:file.name,url:"https://storage.example/"+file.name})),
}));
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { GradioFileField } from "./gradio-file-field";
import { GenerationPromptField, GenerationPromptSurface } from "@/shared/ui/generation-prompt-field";
import { AppPromptEditor } from "./app-prompt-editor";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationPromptField", () => {
  it("opens a local image in a new tab through a blob URL and keeps removal independent", async () => {
    const create = vi.fn((_blob: Blob | MediaSource) => "blob:http://localhost/attachment-preview"), revoke = vi.fn();
    const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    try {
      const change = vi.fn();
      const { unmount } = renderWithIntl(<GradioFileField label="Reference" value="data:image/png;base64,cG5n"
        field={{ name: "image", label: "Reference", media: "image", schema: {}, kind: "file", nullable: true, required: false }} onChange={change} />);
      const link = await screen.findByRole("link", { name: /참조 이미지/ });
      expect(link).toHaveAttribute("href", "blob:http://localhost/attachment-preview");
      expect(link).toHaveAttribute("target", "_blank"); expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect((create.mock.calls[0][0] as Blob).type).toBe("image/png");
      fireEvent.click(screen.getByRole("button", { name: "제거" }));
      expect(change).toHaveBeenCalledWith(null);
      unmount(); expect(revoke).toHaveBeenCalledWith("blob:http://localhost/attachment-preview");
    } finally { URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke; }
  });
  it("uses the same editorial form surface as the landing hero preview", () => {
    renderWithIntl(
      <GenerationPromptField
        ariaLabel="작업 입력"
        textarea={<textarea aria-label="Prompt" />}
        promptMeta={<span>0 chars</span>}
        footerLeft={<span>Attach</span>}
        footerRight={<span>Generate</span>}
      />,
    );

    const dock = screen.getByRole("region", {
      name: "작업 입력",
    });
    const surface = screen.getByTestId("shared-prompt-form-surface");

    expect(dock).toHaveAttribute("data-app-prompt-field");
    expect(dock).toHaveAttribute("data-app-card");
    expect(dock).toHaveAttribute("data-variant", "editorial-flat");
    expect(dock).toHaveAttribute("data-surface", "default");
    expect(dock).toHaveClass("border-0");
    expect(dock.className).toContain("bg-card");
    expect(dock.className).not.toContain("gradient");
    expect(surface).toHaveAttribute("data-app-card");
    expect(surface).toHaveAttribute("data-variant", "prompt");
    expect(surface).toHaveClass("relative");
    expect(surface).toHaveClass("rounded-xl");
    expect(surface).toHaveClass("bg-card");
    expect(surface).not.toHaveClass("bg-creative-surface");
    expect(screen.getByTestId("shared-prompt-meta")).toHaveTextContent(
      "0 chars",
    );
  });

  it("can wrap the inner prompt content without wrapping the outer prompt field surface", () => {
    renderWithIntl(
      <GenerationPromptField
        testId="prompt-field"
        textarea={<textarea aria-label="Prompt" />}
        contentWrapper={(children) => (
          <div data-testid="prompt-content-wrapper">{children}</div>
        )}
      />,
    );

    const field = screen.getByTestId("prompt-field");
    const wrapper = screen.getByTestId("prompt-content-wrapper");
    const surface = screen.getByTestId("shared-prompt-form-surface");

    expect(field).not.toBe(wrapper);
    expect(field).toContainElement(wrapper);
    expect(wrapper).toContainElement(surface);
  });

  it("renders feedback between the prompt textarea and footer controls", () => {
    renderWithIntl(
      <GenerationPromptField
        textarea={<textarea aria-label="Prompt" />}
        feedback={<p role="alert">Prompt is required</p>}
        footerLeft={<button type="button">Model</button>}
      />,
    );

    const surface = screen.getByTestId("shared-prompt-form-surface");
    const textarea = screen.getByRole("textbox", { name: "Prompt" });
    const feedback = screen.getByRole("alert");
    const footerControl = screen.getByRole("button", { name: "Model" });

    expect(surface).toContainElement(feedback);
    expect(
      textarea.compareDocumentPosition(feedback) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      feedback.compareDocumentPosition(footerControl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});


describe("Classic file drop", () => {
  afterEach(() => vi.unstubAllGlobals());
  function fixture(disabled = false, initial: string[] = [], limit = 2, media: "image" | "video" = "image", space = false, inline = false) {
    const changed = vi.fn();
    class Transfer {
      files: File[] = [];
      items = { add: (file: File) => { this.files.push(file); } };
    }
    vi.stubGlobal("DataTransfer", Transfer);
    function Form() {
      const [value, setValue] = useState(initial);
      const Surface = space ? GenerationPromptSurface : GenerationPromptField;
      return <Surface textarea={inline ? <AppPromptEditor aria-label="Prompt" value="original" onChange={vi.fn()} disabled={disabled} /> : <textarea aria-label="Prompt" defaultValue="original" />}
        footerLeft={<GradioFileField label="References" field={{ name: "refs", label: "References", schema: {}, kind: "files", media, required: false, nullable: true }} maxItems={limit}
          disabled={disabled} value={value} onChange={next => { changed(next); setValue(next as string[]); }} />} />;
    }
    renderWithIntl(<Form />);
    const input = screen.getByLabelText(media === "video" ? "참조 영상" : "참조 이미지") as HTMLInputElement;
    let files: File[] = [];
    Object.defineProperty(input, "files", { configurable: true, get: () => files, set: value => { files = value; } });
    return { changed, textarea: screen.getByRole("textbox"), input };
  }
  function drop(target: HTMLElement, files: File[]) {
    fireEvent.drop(target, { dataTransfer: { types: ["Files"], files } });
  }
  it.each([false, true])("pastes an image File over the prompt through the existing attachment reader once (Space: %s)", async space => {
    const { changed, textarea } = fixture(false, [], 2, "image", space, true);
    fireEvent.paste(textarea, { clipboardData: { files: [new File(["png"], "clipboard.png", { type: "image/png" })],
      getData: () => "<img src=clipboard>" } });
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(changed.mock.calls[0][0][0]).toBe("https://storage.example/clipboard.png");
    expect(textarea).toHaveTextContent("original");
    expect(textarea.querySelector("img")).toBeNull();
  });
  it("accepts a video File only when the current model exposes a video attachment", async () => {
    const { changed, textarea } = fixture(false, [], 2, "video");
    const file = new File(["mp4"], "clipboard.mp4", { type: "video/mp4" });
    fireEvent.paste(textarea, { clipboardData: { files: [], items: [{ kind: "file", getAsFile: () => file }] } });
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(changed.mock.calls[0][0][0]).toBe("https://storage.example/clipboard.mp4");
    expect(textarea).toHaveValue("original");
  });
  it.each([true, false])("rejects disabled or incompatible clipboard files without changing the prompt (disabled: %s)", disabled => {
    const { changed, textarea } = fixture(disabled);
    fireEvent.paste(textarea, { clipboardData: { files: [new File(["mp4"], "video.mp4", { type: "video/mp4" })] } });
    expect(changed).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("original");
  });
  it("lets ordinary text paste reach the editor and rejects an image batch over a single-file input", () => {
    const { changed, textarea } = fixture(false, [], 1);
    const text = vi.fn(); textarea.addEventListener("paste", text);
    fireEvent.paste(textarea, { clipboardData: { files: [], items: [], getData: () => "text" } });
    expect(text).toHaveBeenCalledTimes(1);
    fireEvent.paste(textarea, { clipboardData: { files: [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })] } });
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("파일 한 개");
  });
  it("routes a file dropped over the editor through the existing attachment reader once", async () => {
    const { changed, textarea } = fixture();
    drop(textarea, [new File(["png"], "reference.PNG", { type: "" })]);
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(changed.mock.calls[0][0][0]).toBe("https://storage.example/reference.PNG");
    expect(textarea).toHaveValue("original");
  });
  it.each([["notes.txt", "text/plain"], ["picture.svg", "image/svg+xml"], ["sound.mp3", "audio/mpeg"], ["fake.png", "video/mp4"]])("rejects unsupported or incompatible files without changing text or attachments: %s", (name, type) => {
    const file = new File(["test"], name, { type });
    const { changed, textarea } = fixture(); drop(textarea, [file]);
    expect(changed).not.toHaveBeenCalled(); expect(textarea).toHaveValue("original");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  it("preserves the existing maximum-count rejection for a batch", async () => {
    const { changed, textarea } = fixture(false, ["data:image/png;base64,cG5n"]);
    drop(textarea, [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })]);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("최대 2개"));
    expect(changed).not.toHaveBeenCalled();
  });
  it("does not bypass disabled attachment fields", () => {
    const { changed, textarea } = fixture(true); drop(textarea, [new File(["a"], "a.png", { type: "image/png" })]);
    expect(changed).not.toHaveBeenCalled();
  });
  it("rejects a multi-file drop onto a single-file input instead of silently using the first file", () => {
    const { changed, textarea } = fixture(false, [], 1);
    drop(textarea, [new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.png", { type: "image/png" })]);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("파일 한 개");
  });
});
