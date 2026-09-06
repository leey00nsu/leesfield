import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpacePreferencesSession } from "../../hook/use-space-preferences";

import { CommentsNavigationIcon, NodeBananaHostedHeader, type NodeBananaHostedHeaderProps } from "@node-banana-runtime/runtime-entry";

function headerProps(overrides: Partial<NodeBananaHostedHeaderProps> = {}): NodeBananaHostedHeaderProps {
  return {
    title: "Campaign", graphs: [{ id: "graph-1", title: "Campaign" }], activeGraphId: "graph-1", saveLabel: "Saved",
    onTitleChange: vi.fn(), onSelectGraph: vi.fn(), onCreateGraph: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(),
    onCanvasSettingsChange: vi.fn(), onInlineParametersChange: vi.fn(),
    models: [{ id: "image-a", name: "Image A", mediaKind: "image" }, { id: "image-b", name: "Image B", mediaKind: "image" }],
    nodeDefaults: { image: "image-a" },
    renderModelPicker: (_kind, onSelect) => <button onClick={() => onSelect("image-b")}>Choose Image B</button>,
    ...overrides,
  };
}

function openDefaultsAndChooseImageB() {
  fireEvent.click(screen.getByRole("button", { name: "Space settings" }));
  fireEvent.click(screen.getByRole("tab", { name: "Node Defaults" }));
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose Image B" }));
}

describe("NodeBananaHostedHeader", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("preserves the immutable upstream Header shell, supported icon order, and keeps platform management in the selector", () => {
    const upstream = readFileSync("third_party/node-banana/upstream/src/components/Header.tsx", "utf8");
    const shell = upstream.match(/<header className="([^"]+)"/)![1];
    const { container } = render(<NodeBananaHostedHeader {...headerProps()} />);
    const header = container.querySelector("header")!;
    expect(header.className).toBe(shell);
    expect(within(header).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Save space", "Open space", "Space settings", "Keyboard shortcuts"]);
    for (const path of header.querySelectorAll("svg path")) expect(upstream).toContain(path.getAttribute("d"));
    expect(within(header).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "New space" })).not.toBeInTheDocument();
    expect(within(header).queryByRole("button", { name: "Delete space" })).not.toBeInTheDocument();
  });
  it("submits default and inline edits together and keeps the dialog when the atomic save fails", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Settings unavailable")).mockResolvedValueOnce(undefined);
    const props = headerProps({ onSaveSettings: save, onSaveNodeDefaults: vi.fn() });
    render(<NodeBananaHostedHeader {...props} />);
    openDefaultsAndChooseImageB();
    fireEvent.click(screen.getByRole("tab", { name: "Space" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show model settings on nodes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Settings unavailable");
    expect(props.onSaveNodeDefaults).not.toHaveBeenCalled();
    expect(props.onInlineParametersChange).not.toHaveBeenCalled();
    expect(props.onTitleChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(save.mock.calls).toEqual([[{ defaults: { image: "image-b" }, inlineParametersEnabled: false }], [{ defaults: { image: "image-b" }, inlineParametersEnabled: false }]]);
  });
  it("opens Space Settings and saves Leesfield-backed canvas preferences", () => {
    const onTitleChange = vi.fn();
    const onCanvasSettingsChange = vi.fn();
    render(
      <NodeBananaHostedHeader
        title="Campaign"
        graphs={[{ id: "graph-1", title: "Campaign" }]}
        activeGraphId="graph-1"
        saveLabel="Saved"
        canvasSettings={{ panMode: "middleMouse", zoomMode: "scroll", selectionMode: "click" }}
        onCanvasSettingsChange={onCanvasSettingsChange}
        onTitleChange={onTitleChange}
        onSelectGraph={vi.fn()}
        onCreateGraph={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Space settings" }));
    expect(screen.getByRole("dialog", { name: "Space Settings" })).toHaveAttribute(
      "data-node-banana-component",
      "ProjectSetupModal",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Space + Drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Alt + Scroll" }));
    fireEvent.click(screen.getByRole("button", { name: "Shift + Drag" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onTitleChange).toHaveBeenCalledWith("Campaign");
    expect(onCanvasSettingsChange).toHaveBeenCalledWith({
      panMode: "space",
      zoomMode: "altScroll",
      selectionMode: "shiftDrag",
    });
  });

  it("retains selected defaults and the modal after an async failure, then retries the same draft", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Preferences changed; retry")).mockResolvedValueOnce(undefined);
    render(<NodeBananaHostedHeader {...headerProps({ onSaveNodeDefaults: save })} />);
    openDefaultsAndChooseImageB();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Preferences changed; retry");
    expect(screen.getByRole("dialog", { name: "Space Settings" })).toBeInTheDocument();
    expect(screen.getByText("Image B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Space Settings" })).not.toBeInTheDocument());
    expect(save.mock.calls).toEqual([[{ image: "image-b" }], [{ image: "image-b" }]]);
  });

  it("preserves unsaved model choice when a background preference response replaces props", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const props = headerProps({ onSaveNodeDefaults: save });
    const view = render(<NodeBananaHostedHeader {...props} />);
    openDefaultsAndChooseImageB();
    view.rerender(<NodeBananaHostedHeader {...props} nodeDefaults={{}} nodeDefaultsLoading />);
    view.rerender(<NodeBananaHostedHeader {...props} nodeDefaults={{ image: "image-a" }} nodeDefaultsLoading={false} />);
    expect(screen.getByText("Image B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ image: "image-b" }));
  });

  it("loads delayed inline preferences without overwriting them on an unrelated settings save", async () => {
    const props = headerProps({ inlineParametersEnabled: false, nodeDefaultsLoading: true });
    const view = render(<NodeBananaHostedHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Space settings" }));
    view.rerender(<NodeBananaHostedHeader {...props} inlineParametersEnabled nodeDefaultsLoading={false} />);
    const toggle = screen.getByRole("switch", { name: "Show model settings on nodes" });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(props.onInlineParametersChange).not.toHaveBeenCalled();
  });

  it("saves name, inline parameters, Canvas and defaults edited across tabs", async () => {
    const props = headerProps({ onSaveNodeDefaults: vi.fn().mockResolvedValue(undefined) });
    render(<NodeBananaHostedHeader {...props} />);
    openDefaultsAndChooseImageB();
    fireEvent.click(screen.getByRole("tab", { name: "Space" }));
    const dialog = screen.getByRole("dialog", { name: "Space Settings" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Space name" }), { target: { value: "New campaign" } });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Show model settings on nodes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Always On" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.onTitleChange).toHaveBeenCalledWith("New campaign"));
    expect(props.onSaveNodeDefaults).toHaveBeenCalledWith({ image: "image-b" });
    expect(props.onInlineParametersChange).toHaveBeenCalledWith(false);
    expect(props.onCanvasSettingsChange).toHaveBeenCalledWith({ panMode: "always", zoomMode: "altScroll", selectionMode: "click" });
  });

  it("opens the original grouped Help dialog and dismisses with Escape", () => {
    render(<NodeBananaHostedHeader {...headerProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const dialog = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
    expect(within(dialog).getByText("Layout (select 2+ nodes first)")).toBeInTheDocument();
    expect(within(dialog).getByText("Stack selected vertically")).toBeInTheDocument();
    expect(within(dialog).getByText("Paste nodes / image / text")).toBeInTheDocument();
    expect(within(dialog).queryByText("Add ComfyUI App node")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("awaits changed inline preference persistence before applying local edits or closing, and retains drafts for retry", async () => {
    let completeRetry: (() => void) | undefined;
    const saveInline = vi.fn().mockRejectedValueOnce(new Error("Inline preference unavailable"))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { completeRetry = resolve; }));
    const props = headerProps({ onInlineParametersChange: saveInline });
    render(<NodeBananaHostedHeader {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Space settings" }));
    const dialog = screen.getByRole("dialog", { name: "Space Settings" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Space name" }), { target: { value: "Retained name" } });
    fireEvent.click(screen.getByRole("switch", { name: "Show model settings on nodes" }));
    fireEvent.click(screen.getByRole("tab", { name: "Canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Always On" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Inline preference unavailable");
    expect(props.onCanvasSettingsChange).not.toHaveBeenCalled();
    expect(props.onTitleChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Space Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveInline.mock.calls).toEqual([[false], [false]]);
    expect(props.onCanvasSettingsChange).not.toHaveBeenCalled();
    expect(props.onTitleChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog", { name: "Space Settings" }).parentElement!);
    expect(screen.getByRole("dialog", { name: "Space Settings" })).toBeInTheDocument();
    completeRetry?.();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Space Settings" })).not.toBeInTheDocument());
    expect(props.onTitleChange).toHaveBeenCalledWith("Retained name");
    expect(props.onCanvasSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ panMode: "always" }));
  });

  it("shows the original comment badge, delegates navigation, and hides empty navigation", () => {
    const onNavigate = vi.fn();
    const view = render(<CommentsNavigationIcon count={14} unreadCount={12} onNavigate={onNavigate} />);
    const button = screen.getByRole("button", { name: "Navigate comments" });
    expect(button).toHaveAttribute("title", "12 unviewed comments (14 total)");
    expect(within(button).getByText("9+")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledOnce();
    view.rerender(<CommentsNavigationIcon count={14} unreadCount={0} onNavigate={onNavigate} />);
    expect(screen.getByRole("button", { name: "Navigate comments" })).not.toHaveTextContent("9+");
    view.rerender(<CommentsNavigationIcon count={0} unreadCount={0} onNavigate={onNavigate} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("blocks stale defaults after a real preference conflict until reopening, preserving another session's video change", async () => {
    const initial = { schemaVersion: 1, revision: 1, recentModelKeys: [], defaults: { image: { modelKey: "image-a", parameters: {} } } };
    const latest = { ...initial, revision: 2, defaults: { ...initial.defaults, video: { modelKey: "video-b", parameters: { steps: 8 } } } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preferences: initial }) })
      .mockResolvedValueOnce({ ok: false, status: 409 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preferences: latest }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ preferences: { ...latest, revision: 3, defaults: { ...latest.defaults, image: { modelKey: "image-b", parameters: {} } } } }) });
    vi.stubGlobal("fetch", fetchMock);
    function IntegratedHeader() {
      const preferences = useSpacePreferencesSession("graph-1");
      return <NodeBananaHostedHeader {...headerProps({
        models: [{ id: "image-a", name: "Image A", mediaKind: "image" }, { id: "image-b", name: "Image B", mediaKind: "image" }, { id: "video-b", name: "Video B", mediaKind: "video" }],
        nodeDefaults: Object.fromEntries(Object.entries(preferences.data?.defaults ?? {}).map(([kind, value]) => [kind, value.modelKey])),
        nodeDefaultsLoading: !preferences.data || preferences.saving,
        onSaveNodeDefaults: (defaults) => preferences.saveDefaults(Object.fromEntries(Object.entries(defaults).map(([kind, modelKey]) => {
          const previous = preferences.data?.defaults[kind as "image" | "video" | "audio"];
          return [kind, { modelKey, parameters: previous?.modelKey === modelKey ? previous.parameters : {} }];
        }))),
      })} />;
    }
    render(<IntegratedHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Space settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Node Defaults" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Change" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose Image B" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Close and reopen Settings");
    expect(screen.getByText("Image B")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Space settings" }));
    fireEvent.click(screen.getByRole("tab", { name: "Node Defaults" }));
    expect(screen.getByText("Image A")).toBeInTheDocument();
    expect(screen.getByText("Video B")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Change" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Choose Image B" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const savedBody = JSON.parse(fetchMock.mock.calls[3]![1].body);
    expect(savedBody).toEqual({ action: "defaults", expectedRevision: 2, defaults: { image: { modelKey: "image-b", parameters: {} }, video: { modelKey: "video-b", parameters: { steps: 8 } } } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Space Settings" })).not.toBeInTheDocument());
  });
});
