import { processImageOperation } from "@node-banana-runtime/runtime-entry";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";

type ProbeResult = {
  kind: string;
  mimeType: string;
  width: number;
  height: number;
  outputCount: number;
  checksum: string;
};

const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect width="4" height="4" fill="#ff0000"/><rect x="4" width="4" height="4" fill="#0000ff"/></svg>',
)}`;

async function checksum(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function runProbe(): Promise<ProbeResult[]> {
  const requests = [
    {
      kind: "edit.image.annotation" as const,
      parameters: {
        shapes: [{ id: "shape-1", type: "rectangle" as const, x: 1, y: 1, width: 3, height: 2, fill: null, stroke: "#00ff00", strokeWidth: 1, opacity: 1 }],
      },
      expectedMime: "image/png",
      expectedWidth: 8,
      expectedHeight: 4,
    },
    {
      kind: "edit.image.resize" as const,
      parameters: {
        mode: "exact" as const, width: 4, height: 2, maxEdge: 8, scalePct: 100,
        fit: "stretch" as const, padColor: "#00000000", format: "png" as const, quality: 0.92,
      },
      expectedMime: "image/png",
      expectedWidth: 4,
      expectedHeight: 2,
    },
    {
      kind: "edit.image.splitGrid" as const,
      parameters: { rows: 2, cols: 2, colOffsets: [], rowOffsets: [] },
      expectedMime: "image/png",
      expectedWidth: 4,
      expectedHeight: 2,
    },
    {
      kind: "edit.image.gif" as const,
      parameters: { fps: 8, loopCount: 0, colorCount: 16, dither: false, targetMaxBytes: null },
      expectedMime: "image/gif",
      expectedWidth: 8,
      expectedHeight: 4,
    },
  ];

  const results: ProbeResult[] = [];
  for (const request of requests) {
    const operation = await processImageOperation({
      kind: request.kind,
      parameters: request.parameters,
      inputUrls: request.kind === "edit.image.gif" ? [source, source] : [source],
    });
    const first = operation.outputs[0];
    if (!first) throw new Error(`${request.kind}: output missing`);
    if (
      first.mimeType !== request.expectedMime ||
      first.width !== request.expectedWidth ||
      first.height !== request.expectedHeight ||
      (request.kind === "edit.image.splitGrid" && operation.outputs.length !== 4)
    ) {
      throw new Error(`${request.kind}: output contract mismatch`);
    }
    results.push({
      kind: request.kind,
      mimeType: first.mimeType,
      width: first.width,
      height: first.height,
      outputCount: operation.outputs.length,
      checksum: await checksum(first.blob),
    });
  }
  return results;
}

function ImageOperationProcessorContract() {
  const [state, setState] = useState<{ status: "running" | "passed" | "failed"; results: ProbeResult[]; error?: string }>({
    status: "running",
    results: [],
  });

  useEffect(() => {
    let live = true;
    void runProbe().then(
      (results) => live && setState({ status: "passed", results }),
      (error: unknown) => live && setState({
        status: "failed",
        results: [],
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return () => { live = false; };
  }, []);

  return (
    <main className="min-h-screen bg-[#0c0f0d] p-8 font-mono text-sm text-white">
      <h1 className="mb-4 text-lg">Node Banana image processor contract</h1>
      <output data-testid="processor-contract" data-status={state.status}>
        {state.status === "running" ? "running" : null}
        {state.status === "failed" ? `failed: ${state.error}` : null}
        {state.status === "passed" ? (
          <ul className="grid gap-2">
            {state.results.map((result) => (
              <li key={result.kind} data-kind={result.kind} data-checksum={result.checksum}>
                {result.kind} · {result.mimeType} · {result.width}×{result.height} · {result.outputCount} · {result.checksum}
              </li>
            ))}
          </ul>
        ) : null}
      </output>
    </main>
  );
}

const meta = {
  title: "Features/Node Studio/Image Operation Processor Contract",
  component: ImageOperationProcessorContract,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ImageOperationProcessorContract>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BrowserProbe: Story = {};
