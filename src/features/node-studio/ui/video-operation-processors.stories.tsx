import { processVideoOperation } from "@node-banana-runtime/runtime-entry";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";

import {
  blueVideoWithAudio,
  redVideoWithAudio,
} from "./video-operation-fixtures";

type ProbeResult = {
  kind: string;
  mimeType: string;
  width: number;
  height: number;
  durationMs: number | null;
  hasAudio: boolean;
  checksum: string;
};

async function checksum(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function firstPixel(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PIXEL_PROBE_CANVAS_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, 1, 1).data;
  } finally {
    bitmap.close();
  }
}

const videoInput = (assetId: string, sortOrder: number, url: string) => ({
  assetId,
  portId: "clips",
  sortOrder,
  type: "video" as const,
  mimeType: "video/mp4",
  url,
});

function toneWav(durationSeconds = 0.6) {
  const sampleRate = 44_100;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount * 2, true);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const amplitude = Math.sin((sample / sampleRate) * Math.PI * 2 * 660);
    view.setInt16(44 + sample * 2, Math.round(amplitude * 8_000), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function runProbe(): Promise<ProbeResult[]> {
  const soundtrackUrl = URL.createObjectURL(toneWav());
  const stitched = await processVideoOperation({
    kind: "edit.video.stitch",
    parameters: { repeat: 1, stripAudio: false },
    inputs: [
      videoInput("red", 0, redVideoWithAudio),
      videoInput("blue", 1, blueVideoWithAudio),
      {
        assetId: "soundtrack",
        portId: "soundtrack",
        sortOrder: 0,
        type: "audio",
        mimeType: "audio/wav",
        url: soundtrackUrl,
      },
    ],
  }).finally(() => URL.revokeObjectURL(soundtrackUrl));
  const stitchOutput = stitched.outputs[0];
  if (!stitchOutput.hasAudio || stitchOutput.mimeType !== "video/mp4") {
    throw new Error("Stitch did not preserve its embedded audio track");
  }

  const stitchedUrl = URL.createObjectURL(stitchOutput.blob);
  try {
    const [first, last] = await Promise.all([
      processVideoOperation({
        kind: "edit.video.frameGrab",
        parameters: { position: "first" },
        inputs: [{ ...videoInput("stitched", 0, stitchedUrl), portId: "video" }],
      }),
      processVideoOperation({
        kind: "edit.video.frameGrab",
        parameters: { position: "last" },
        inputs: [{ ...videoInput("stitched", 0, stitchedUrl), portId: "video" }],
      }),
    ]);
    const firstFrame = first.outputs[0];
    const lastFrame = last.outputs[0];
    const [firstColor, lastColor] = await Promise.all([
      firstPixel(firstFrame.blob),
      firstPixel(lastFrame.blob),
    ]);
    if (firstColor[0] <= firstColor[2] || lastColor[2] <= lastColor[0]) {
      throw new Error("Stitch output clip ordering is incorrect");
    }
    const [firstHash, lastHash] = await Promise.all([
      checksum(firstFrame.blob),
      checksum(lastFrame.blob),
    ]);
    if (firstHash === lastHash) throw new Error("Frame Grab returned identical ordered frames");

    const trimmed = await processVideoOperation({
      kind: "edit.video.trim",
      parameters: { startMs: 100, endMs: 500, stripAudio: false },
      inputs: [{ ...videoInput("red", 0, redVideoWithAudio), portId: "video" }],
    });
    const trimOutput = trimmed.outputs[0];
    if (!trimOutput.hasAudio || trimOutput.durationMs === null) {
      throw new Error("Trim did not preserve its embedded audio track");
    }

    const eased = await processVideoOperation({
      kind: "edit.video.easeCurve",
      parameters: {
        outputDurationMs: 300,
        easingPreset: null,
        bezier: [0.42, 0, 0.58, 1],
      },
      inputs: [{ ...videoInput("blue", 0, blueVideoWithAudio), portId: "video" }],
    });
    const easeOutput = eased.outputs[0];
    if (easeOutput.durationMs === null) throw new Error("Ease Curve duration missing");

    return [
      { ...stitchOutput, kind: "edit.video.stitch", checksum: await checksum(stitchOutput.blob) },
      { ...trimOutput, kind: "edit.video.trim", checksum: await checksum(trimOutput.blob) },
      { ...firstFrame, kind: "edit.video.frameGrab:first", checksum: firstHash },
      { ...lastFrame, kind: "edit.video.frameGrab:last", checksum: lastHash },
      { ...easeOutput, kind: "edit.video.easeCurve", checksum: await checksum(easeOutput.blob) },
    ].map(({ kind, mimeType, width, height, durationMs, hasAudio, checksum: hash }) => ({
      kind,
      mimeType,
      width,
      height,
      durationMs,
      hasAudio,
      checksum: hash,
    }));
  } finally {
    URL.revokeObjectURL(stitchedUrl);
  }
}

function VideoOperationProcessorContract() {
  const [state, setState] = useState<{
    status: "running" | "passed" | "failed";
    results: ProbeResult[];
    error?: string;
  }>({ status: "running", results: [] });

  useEffect(() => {
    const controller = new AbortController();
    void runProbe().then(
      (results) => !controller.signal.aborted && setState({ status: "passed", results }),
      (error: unknown) => !controller.signal.aborted && setState({
        status: "failed",
        results: [],
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen bg-[#0c0f0d] p-8 font-mono text-sm text-white">
      <h1 className="mb-4 text-lg">Node Banana video processor contract</h1>
      <output data-testid="video-processor-contract" data-status={state.status}>
        {state.status === "running" ? "running" : null}
        {state.status === "failed" ? `failed: ${state.error}` : null}
        {state.status === "passed" ? (
          <ul className="grid gap-2">
            {state.results.map((result) => (
              <li key={result.kind} data-kind={result.kind} data-checksum={result.checksum}>
                {result.kind} · {result.mimeType} · {result.width}×{result.height} · {result.durationMs ?? "still"}ms · audio:{String(result.hasAudio)} · {result.checksum}
              </li>
            ))}
          </ul>
        ) : null}
      </output>
    </main>
  );
}

const meta = {
  title: "Features/Node Studio/Video Operation Processor Contract",
  component: VideoOperationProcessorContract,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof VideoOperationProcessorContract>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BrowserProbe: Story = {};
