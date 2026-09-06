import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const konva = vi.hoisted(() => ({
  drag: { x: 30, y: 40 },
  pointer: { x: 10, y: 20 },
  transform: { x: 7, y: 8, scaleX: 2, scaleY: 1.5 },
}));
const imageLoader = vi.hoisted(() => ({ fail: false, sources: [] as string[] }));
const operation = vi.hoisted(() => ({
  process: vi.fn().mockResolvedValue({
    outputs: [{
      blob: new Blob(["annotated"], { type: "image/png" }),
      fileName: "node-banana-01.png",
      mimeType: "image/png",
      sortOrder: 0,
      width: 100,
      height: 100,
    }],
  }),
}));

vi.mock("@node-banana-runtime/runtime-entry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@node-banana-runtime/runtime-entry")>()),
  processImageOperation: operation.process,
}));

vi.mock("react-konva", async () => {
  const React = await import("react");
  const Stage = React.forwardRef(function Stage(
    props: {
      children?: ReactNode;
      onMouseDown?: (event: unknown) => void;
      onMouseMove?: () => void;
      onMouseUp?: () => void;
    },
    ref,
  ) {
    const stage = React.useMemo(() => ({
      container: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
      findOne: () => null,
      getPointerPosition: () => konva.pointer,
    }), []);
    React.useImperativeHandle(ref, () => stage);
    const event = { target: { getClassName: () => "Stage", getStage: () => stage } };
    return React.createElement("div", {
      role: "img",
      "aria-label": "Annotation canvas",
      onMouseDown: () => props.onMouseDown?.(event),
      onMouseMove: props.onMouseMove,
      onMouseUp: props.onMouseUp,
    }, props.children);
  });
  const Transformer = React.forwardRef(function Transformer(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      getLayer: () => ({ batchDraw: () => undefined }),
      nodes: () => undefined,
    }));
    return null;
  });
  function Primitive(props: {
    id?: string;
    children?: ReactNode;
    onClick?: () => void;
    onDragEnd?: (event: { target: { x: () => number; y: () => number } }) => void;
    onTransformEnd?: (event: {
      target: {
        x: () => number;
        y: () => number;
        scaleX: (value?: number) => number;
        scaleY: (value?: number) => number;
      };
    }) => void;
  }) {
    return React.createElement("div", {
      "data-annotation-shape": props.id ?? "primitive",
      onClick: props.onClick,
      onDragEnd: () => props.onDragEnd?.({
        target: {
          x: () => konva.drag.x,
          y: () => konva.drag.y,
        },
      }),
      onDoubleClick: () => props.onTransformEnd?.({
        target: {
          x: () => konva.transform.x,
          y: () => konva.transform.y,
          scaleX: (value?: number) => value ?? konva.transform.scaleX,
          scaleY: (value?: number) => value ?? konva.transform.scaleY,
        },
      }),
    }, props.children);
  }
  return {
    Arrow: Primitive,
    Ellipse: Primitive,
    Image: Primitive,
    Layer: Primitive,
    Line: Primitive,
    Rect: Primitive,
    Stage,
    Text: Primitive,
    Transformer,
  };
});

import type { AnnotationShape } from "@node-banana-runtime/runtime-entry";
import { NodeBananaAnnotationEditor } from "./node-banana-annotation-editor";

class MockImage {
  crossOrigin: string | null = null;
  naturalHeight = 100;
  naturalWidth = 100;
  onerror: null | (() => void) = null;
  onload: null | (() => void) = null;
  private value = "";

  set src(value: string) {
    this.value = value;
    if (!value) return;
    imageLoader.sources.push(value);
    queueMicrotask(() => {
      if (imageLoader.fail) this.onerror?.();
      else this.onload?.();
    });
  }

  get src() {
    return this.value;
  }
}

function Editor(props: Partial<ComponentProps<typeof NodeBananaAnnotationEditor>> = {}) {
  return (
    <NodeBananaAnnotationEditor
      open
      sourceUrl="/api/media-assets/asset-1/content"
      initialShapes={[]}
      onClose={vi.fn()}
      onSave={vi.fn()}
      {...props}
    />
  );
}

describe("NodeBananaAnnotationEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageLoader.fail = false;
    imageLoader.sources = [];
    konva.pointer = { x: 360, y: 270 };
    vi.stubGlobal("Image", MockImage);
  });

  it("names and describes the dialog, loads its same-origin image, and restores every supported shape", async () => {
    const onSave = vi.fn();
    const view = render(<Editor onSave={onSave} />);

    const dialog = screen.getByRole("dialog", { name: "Annotation editor" });
    expect(dialog).toHaveAccessibleDescription("Add, edit, or remove visual annotations from the connected image.");
    expect(screen.getByRole("status")).toHaveTextContent("Loading image");
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());
    expect(imageLoader.sources).toEqual(["/api/media-assets/asset-1/content"]);

    fireEvent.click(screen.getByRole("button", { name: "Rect" }));
    const canvas = screen.getByRole("img", { name: "Annotation canvas" });
    fireEvent.mouseDown(canvas);
    konva.pointer = { x: 410, y: 330 };
    fireEvent.mouseMove(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Circle" }));
    konva.pointer = { x: 370, y: 280 };
    fireEvent.mouseDown(canvas);
    konva.pointer = { x: 430, y: 340 };
    fireEvent.mouseMove(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Arrow" }));
    konva.pointer = { x: 380, y: 290 };
    fireEvent.mouseDown(canvas);
    konva.pointer = { x: 440, y: 350 };
    fireEvent.mouseMove(canvas);
    fireEvent.mouseUp(canvas);

    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    konva.pointer = { x: 400, y: 300 };
    fireEvent.mouseDown(canvas);
    fireEvent.change(screen.getByRole("textbox", { name: "Annotation text" }), {
      target: { value: "Review" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Annotation text" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as AnnotationShape[];
    expect(saved.map((shape) => shape.type)).toEqual(["rectangle", "circle", "arrow", "text"]);
    expect(saved[0]).toEqual(expect.objectContaining({ x: 10, y: 20, width: 50, height: 60 }));
    expect(saved[1]).toEqual(expect.objectContaining({ x: 50, y: 60, radiusX: 30, radiusY: 30 }));
    expect(saved[2]).toEqual(expect.objectContaining({ points: [30, 40, 90, 100] }));
    expect(saved[3]).toEqual(expect.objectContaining({ x: 50, y: 50, text: "Review" }));
    expect(operation.process).toHaveBeenCalledWith({
      kind: "edit.image.annotation",
      inputUrls: ["/api/media-assets/asset-1/content"],
      parameters: { shapes: saved },
    });
    expect(onSave.mock.calls[0][1]).toEqual(expect.objectContaining({
      fileName: "node-banana-01.png",
      mimeType: "image/png",
      width: 100,
      height: 100,
    }));

    view.unmount();
    render(<Editor initialShapes={saved} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());
    for (const shape of saved) {
      expect(document.querySelector(`[data-annotation-shape="${shape.id}"]`)).toBeInTheDocument();
    }
  });

  it("persists drag edits and keyboard deletion", async () => {
    const onSave = vi.fn();
    const initialShapes: AnnotationShape[] = [
      { id: "rect-1", type: "rectangle", x: 1, y: 2, width: 30, height: 40, fill: null, stroke: "#ef4444", strokeWidth: 4, opacity: 1 },
      { id: "circle-1", type: "circle", x: 20, y: 20, radiusX: 10, radiusY: 10, fill: null, stroke: "#ef4444", strokeWidth: 4, opacity: 1 },
    ];
    render(<Editor initialShapes={initialShapes} onSave={onSave} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());

    const rectangle = document.querySelector('[data-annotation-shape="rect-1"]');
    const circle = document.querySelector('[data-annotation-shape="circle-1"]');
    expect(rectangle).toBeInTheDocument();
    expect(circle).toBeInTheDocument();
    fireEvent.click(rectangle!);
    fireEvent.dragEnd(rectangle!);
    fireEvent.click(circle!);
    fireEvent.keyDown(window, { key: "Delete" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "rect-1", x: 30, y: 40 })],
      expect.objectContaining({ fileName: "node-banana-01.png" }),
    ));
  });

  it("persists visual transformer edits into the flattened shape contract", async () => {
    const onSave = vi.fn();
    const initialShapes: AnnotationShape[] = [
      { id: "rect-1", type: "rectangle", x: 1, y: 2, width: 30, height: 40, fill: null, stroke: "#ef4444", strokeWidth: 4, opacity: 1 },
    ];
    render(<Editor initialShapes={initialShapes} onSave={onSave} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());

    const rectangle = document.querySelector('[data-annotation-shape="rect-1"]');
    expect(rectangle).toBeInTheDocument();
    fireEvent.doubleClick(rectangle!);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      [expect.objectContaining({
        id: "rect-1",
        x: 7,
        y: 8,
        width: 60,
        height: 60,
      })],
      expect.objectContaining({ fileName: "node-banana-01.png" }),
    ));
  });

  it("shows a recoverable failure instead of a blank canvas", async () => {
    imageLoader.fail = true;
    render(<Editor />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the connected image.");
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    imageLoader.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Done" })).toBeEnabled());
    expect(imageLoader.sources).toHaveLength(2);
  });
});
