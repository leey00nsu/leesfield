"use client";

import { useCanvasTranslation } from "@/shared/i18n/use-canvas-translation";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Arrow, Ellipse, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";

import {
  processImageOperation,
  type AnnotationShape,
  type ImageOperationResultItem,
} from "@node-banana-runtime/runtime-entry";
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogTitle,
} from "@/shared/ui/app-dialog";

type Tool = "select" | "rectangle" | "circle" | "arrow" | "freehand" | "text";
type EditorShape = AnnotationShape;

const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#000000", "#ffffff"];
const STROKE_WIDTHS = [2, 4, 8];
const TOOLS: Array<{ type: Tool; label: string }> = [
  { type: "select", label: "Select" },
  { type: "rectangle", label: "Rect" },
  { type: "circle", label: "Circle" },
  { type: "arrow", label: "Arrow" },
  { type: "freehand", label: "Draw" },
  { type: "text", label: "Text" },
];

export function NodeBananaAnnotationEditor({
  open,
  sourceUrl,
  initialShapes,
  onClose,
  onSave,
}: {
  open: boolean;
  sourceUrl: string | null;
  initialShapes: readonly AnnotationShape[];
  onClose: () => void;
  onSave: (shapes: AnnotationShape[], preview: ImageOperationResultItem) => void;
}) {
  if (!open) return null;

  return (
    <NodeBananaAnnotationEditorSession
      key={sourceUrl ?? "missing-source"}
      sourceUrl={sourceUrl}
      initialShapes={initialShapes}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function NodeBananaAnnotationEditorSession({
  sourceUrl,
  initialShapes,
  onClose,
  onSave,
}: {
  sourceUrl: string | null;
  initialShapes: readonly AnnotationShape[];
  onClose: () => void;
  onSave: (shapes: AnnotationShape[], preview: ImageOperationResultItem) => void;
}) {
  const tc = useCanvasTranslation();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<"loading" | "ready" | "error">(
    sourceUrl ? "loading" : "error",
  );
  const [imageLoadAttempt, setImageLoadAttempt] = useState(0);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fill, setFill] = useState(false);
  const [shapes, setShapes] = useState<EditorShape[]>(() => [...initialShapes]);
  const [undoStack, setUndoStack] = useState<EditorShape[][]>([]);
  const [redoStack, setRedoStack] = useState<EditorShape[][]>([]);
  const [drawing, setDrawing] = useState<EditorShape | null>(null);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState<{ x: number; y: number; screenX: number; screenY: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");

  useEffect(() => {
    if (!sourceUrl) return;
    let active = true;
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!active) return;
      setImage(nextImage);
      setImageStatus("ready");
    };
    nextImage.onerror = () => {
      if (!active) return;
      setImage(null);
      setImageStatus("error");
    };
    nextImage.src = sourceUrl;
    return () => {
      active = false;
      nextImage.onload = null;
      nextImage.onerror = null;
      nextImage.src = "";
    };
  }, [imageLoadAttempt, sourceUrl]);

  useLayoutEffect(() => {
    if (!containerElement || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (containerElement.clientWidth && containerElement.clientHeight) {
        setContainerSize((current) => (
          current.width === containerElement.clientWidth && current.height === containerElement.clientHeight
            ? current
            : { width: containerElement.clientWidth, height: containerElement.clientHeight }
        ));
      }
    };
    measure();
    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(containerElement);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [containerElement]);

  const fit = useMemo(() => {
    if (!image) return { scale: 1, x: 0, y: 0, width: 0, height: 0 };
    const scale = Math.min(containerSize.width / image.naturalWidth, containerSize.height / image.naturalHeight, 1) * zoom;
    return {
      scale,
      x: (containerSize.width - image.naturalWidth * scale) / 2,
      y: (containerSize.height - image.naturalHeight * scale) / 2,
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }, [containerSize, image, zoom]);

  const checkpoint = useCallback((next: EditorShape[]) => {
    setShapes((current) => {
      setUndoStack((history) => [...history.slice(-49), current]);
      setRedoStack([]);
      return next;
    });
  }, []);

  const updateShape = useCallback((id: string, update: (shape: EditorShape) => EditorShape) => {
    checkpoint(shapes.map((shape) => shape.id === id ? update(shape) : shape));
  }, [checkpoint, shapes]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const selected = selectedId ? stage.findOne(`#${selectedId}`) : null;
    transformer.nodes(selected && tool === "select" ? [selected] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, shapes, tool]);

  const pointer = useCallback(() => {
    const point = stageRef.current?.getPointerPosition();
    if (!point) return { x: 0, y: 0 };
    return { x: (point.x - fit.x) / fit.scale, y: (point.y - fit.y) / fit.scale };
  }, [fit]);

  const onMouseDown = useCallback((event: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool === "select") {
      if (event.target === event.target.getStage() || event.target.getClassName() === "Image") setSelectedId(null);
      return;
    }
    const point = pointer();
    setStart(point);
    const id = `annotation-${crypto.randomUUID()}`;
    if (tool === "text") {
      const box = stageRef.current?.container().getBoundingClientRect();
      if (box) setTextInput({ x: point.x, y: point.y, screenX: box.left + fit.x + point.x * fit.scale, screenY: box.top + fit.y + point.y * fit.scale });
      return;
    }
    const base = { id, x: 0, y: 0, stroke: color, strokeWidth, opacity: 1 };
    if (tool === "rectangle") setDrawing({ ...base, type: "rectangle", x: point.x, y: point.y, width: 0, height: 0, fill: fill ? color : null });
    if (tool === "circle") setDrawing({ ...base, type: "circle", x: point.x, y: point.y, radiusX: 0, radiusY: 0, fill: fill ? color : null });
    if (tool === "arrow") setDrawing({ ...base, type: "arrow", points: [point.x, point.y, point.x, point.y] });
    if (tool === "freehand") setDrawing({ ...base, type: "freehand", points: [point.x, point.y] });
  }, [color, fill, fit, pointer, strokeWidth, tool]);

  const onMouseMove = useCallback(() => {
    if (!drawing) return;
    const point = pointer();
    if (drawing.type === "rectangle") {
      setDrawing({ ...drawing, x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) });
    } else if (drawing.type === "circle") {
      setDrawing({ ...drawing, x: (start.x + point.x) / 2, y: (start.y + point.y) / 2, radiusX: Math.abs(point.x - start.x) / 2, radiusY: Math.abs(point.y - start.y) / 2 });
    } else if (drawing.type === "arrow") {
      setDrawing({ ...drawing, points: [start.x, start.y, point.x, point.y] });
    } else if (drawing.type === "freehand") {
      setDrawing({ ...drawing, points: [...drawing.points, point.x, point.y] });
    }
  }, [drawing, pointer, start]);

  const onMouseUp = useCallback(() => {
    if (!drawing) return;
    checkpoint([...shapes, drawing]);
    setDrawing(null);
  }, [checkpoint, drawing, shapes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopImmediatePropagation(); onClose(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !textInput) {
        event.preventDefault();
        event.stopImmediatePropagation();
        checkpoint(shapes.filter((shape) => shape.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [checkpoint, onClose, selectedId, shapes, textInput]);

  const renderShape = (shape: EditorShape) => {
    const common = {
      id: shape.id,
      opacity: shape.opacity,
      draggable: tool === "select",
      onClick: () => tool === "select" && setSelectedId(shape.id),
      onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => updateShape(
        shape.id,
        (current) => ({ ...current, x: event.target.x(), y: event.target.y() }),
      ),
      onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
        const node = event.target;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        updateShape(shape.id, (current) => {
          const position = { x: node.x(), y: node.y() };
          if (current.type === "rectangle") {
            return {
              ...current,
              ...position,
              width: Math.max(1, current.width * Math.abs(scaleX)),
              height: Math.max(1, current.height * Math.abs(scaleY)),
            };
          }
          if (current.type === "circle") {
            return {
              ...current,
              ...position,
              radiusX: Math.max(1, current.radiusX * Math.abs(scaleX)),
              radiusY: Math.max(1, current.radiusY * Math.abs(scaleY)),
            };
          }
          if (current.type === "arrow" || current.type === "freehand") {
            return {
              ...current,
              ...position,
              points: current.points.map((point, index) =>
                point * Math.abs(index % 2 === 0 ? scaleX : scaleY),
              ),
            };
          }
          if (current.type === "text") {
            return {
              ...current,
              ...position,
              fontSize: Math.max(
                1,
                Math.round(current.fontSize * Math.max(Math.abs(scaleX), Math.abs(scaleY))),
              ),
            };
          }
          return current;
        });
      },
    };
    if (shape.type === "rectangle") return <Rect key={shape.id} {...common} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke={shape.stroke} fill={shape.fill ?? undefined} strokeWidth={shape.strokeWidth} />;
    if (shape.type === "circle") return <Ellipse key={shape.id} {...common} x={shape.x} y={shape.y} radiusX={shape.radiusX} radiusY={shape.radiusY} stroke={shape.stroke} fill={shape.fill ?? undefined} strokeWidth={shape.strokeWidth} />;
    if (shape.type === "arrow") return <Arrow key={shape.id} {...common} x={shape.x} y={shape.y} points={shape.points} stroke={shape.stroke} fill={shape.stroke} strokeWidth={shape.strokeWidth} />;
    if (shape.type === "freehand") return <Line key={shape.id} {...common} x={shape.x} y={shape.y} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" />;
    if (shape.type === "text") return <Text key={shape.id} {...common} x={shape.x} y={shape.y} text={shape.text || " "} fontSize={shape.fontSize} fill={shape.fill} />;
    return null;
  };

  const handleDone = async () => {
    if (!sourceUrl || imageStatus !== "ready" || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      const result = await processImageOperation({
        kind: "edit.image.annotation",
        inputUrls: [sourceUrl],
        parameters: { shapes },
      });
      const preview = result.outputs[0];
      if (!preview) throw new Error("ANNOTATION_OUTPUT_MISSING");
      onSave(shapes, preview);
    } catch {
      setSaveStatus("error");
    }
  };

  return (
    <AppDialog open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <AppDialogContent size="full" surface="canvas" padding="none" className="!flex h-screen min-w-0 flex-col" data-node-banana-component="AnnotationModal">
      <AppDialogTitle className="sr-only">{tc("Annotation editor")}</AppDialogTitle>
      <AppDialogDescription className="sr-only">{tc("Add, edit, or remove visual annotations from the connected image.")}</AppDialogDescription>
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {TOOLS.map((item) => <button key={item.type} type="button" onClick={() => setTool(item.type)} className={`px-3.5 py-1.5 text-xs font-medium rounded transition-colors ${tool === item.type ? "bg-white text-neutral-900" : "text-neutral-400 hover:text-white"}`}>{tc(item.label)}</button>)}
          <div className="mx-3 h-6 w-px bg-neutral-700" />
          <button type="button" disabled={!undoStack.length} onClick={() => { const previous = undoStack.at(-1); if (!previous) return; setRedoStack((history) => [...history, shapes]); setShapes(previous); setUndoStack((history) => history.slice(0, -1)); }} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white disabled:opacity-30">{tc("Undo")}</button>
          <button type="button" disabled={!redoStack.length} onClick={() => { const next = redoStack.at(-1); if (!next) return; setUndoStack((history) => [...history, shapes]); setShapes(next); setRedoStack((history) => history.slice(0, -1)); }} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white disabled:opacity-30">{tc("Redo")}</button>
          <div className="mx-3 h-6 w-px bg-neutral-700" />
          <button type="button" onClick={() => checkpoint([])} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-red-400">{tc("Clear")}</button>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={onClose} className="px-4 py-1.5 text-xs font-medium text-neutral-400 hover:text-white">{tc("Cancel")}</button>
          <button type="button" disabled={imageStatus !== "ready" || saveStatus === "saving"} onClick={() => void handleDone()} className="rounded bg-white px-4 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40">{saveStatus === "saving" ? tc("Saving…") : tc("Done")}</button>
        </div>
      </div>
      <div
        ref={setContainerElement}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-neutral-900"
        data-annotation-surface-size={`${containerSize.width}x${containerSize.height}`}
      >
        <Stage ref={stageRef} width={containerSize.width} height={containerSize.height} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <Layer x={fit.x} y={fit.y} scaleX={fit.scale} scaleY={fit.scale}>
            {image ? <KonvaImage image={image} width={fit.width} height={fit.height} /> : null}
            {shapes.map(renderShape)}
            {drawing ? renderShape(drawing) : null}
            <Transformer ref={transformerRef} />
          </Layer>
        </Stage>
        {imageStatus === "loading" ? (
          <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-900 text-xs text-neutral-400">{tc("Loading image…")}</div>
        ) : null}
        {imageStatus === "error" ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900 text-xs text-neutral-300">
            <span>{tc("Could not load the connected image.")}</span>
            <button type="button" className="rounded border border-neutral-700 px-3 py-1.5 font-medium text-white hover:bg-neutral-800" onClick={() => {
              setImage(null);
              setImageStatus("loading");
              setImageLoadAttempt((attempt) => attempt + 1);
            }}>{tc("Retry")}</button>
          </div>
        ) : null}
        {saveStatus === "error" ? (
          <div role="alert" className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-red-300/25 bg-neutral-950/90 px-3 py-2 text-xs text-red-100">{tc("Could not render the annotation result. Try again.")}</div>
        ) : null}
        {textInput ? <input autoFocus type="text" aria-label={tc("Annotation text")} className="fixed z-[10003] min-w-28 border-b border-white bg-neutral-900/90 px-1 py-0.5 text-white outline-none" style={{ left: textInput.screenX, top: textInput.screenY, color }} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== "Escape") return; if (event.key === "Enter" && event.currentTarget.value.trim()) checkpoint([...shapes, { id: `annotation-${crypto.randomUUID()}`, type: "text", x: textInput.x, y: textInput.y, text: event.currentTarget.value, fill: color, stroke: color, strokeWidth, opacity: 1, fontSize: 32 }]); setTextInput(null); }} onBlur={(event) => { if (event.currentTarget.value.trim()) checkpoint([...shapes, { id: `annotation-${crypto.randomUUID()}`, type: "text", x: textInput.x, y: textInput.y, text: event.currentTarget.value, fill: color, stroke: color, strokeWidth, opacity: 1, fontSize: 32 }]); setTextInput(null); }} /> : null}
      </div>
      <div className="flex h-14 shrink-0 items-center justify-start gap-6 overflow-x-auto border-t border-neutral-800 bg-neutral-900 px-4 xl:justify-center">
        <div className="flex items-center gap-2"><span className="mr-1 text-[10px] uppercase tracking-wide text-neutral-500">{tc("Color")}</span>{COLORS.map((item) => <button key={item} type="button" aria-label={`Color ${item}`} onClick={() => setColor(item)} className={`h-6 w-6 rounded-full transition-transform ${color === item ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-neutral-900" : "hover:scale-105"}`} style={{ backgroundColor: item }} />)}</div>
        <div className="h-6 w-px bg-neutral-700" />
        <div className="flex items-center gap-2"><span className="mr-1 text-[10px] uppercase tracking-wide text-neutral-500">{tc("Size")}</span>{STROKE_WIDTHS.map((item) => <button key={item} type="button" aria-label={`Stroke ${item}`} onClick={() => setStrokeWidth(item)} className={`flex h-8 w-8 items-center justify-center rounded ${strokeWidth === item ? "bg-neutral-700" : "hover:bg-neutral-800"}`}><span className="rounded-full bg-white" style={{ width: item * 1.5, height: item * 1.5 }} /></button>)}</div>
        <div className="h-6 w-px bg-neutral-700" />
        <button type="button" onClick={() => setFill((value) => !value)} className={`rounded px-3 py-1.5 text-[10px] uppercase tracking-wide ${fill ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-white"}`}>{tc("Fill")}</button>
        <div className="ml-auto flex items-center gap-2"><button type="button" aria-label={tc("Zoom out")} onClick={() => setZoom((value) => Math.max(0.1, value - 0.1))} className="h-7 w-7 text-neutral-400 hover:text-white">−</button><span className="w-10 text-center text-[10px] text-neutral-400">{Math.round(zoom * 100)}%</span><button type="button" aria-label={tc("Zoom in")} onClick={() => setZoom((value) => Math.min(5, value + 0.1))} className="h-7 w-7 text-neutral-400 hover:text-white">+</button></div>
      </div>
      </AppDialogContent>
    </AppDialog>
  );
}
