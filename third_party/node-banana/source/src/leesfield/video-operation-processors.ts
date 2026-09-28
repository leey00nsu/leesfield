import {
  ALL_FORMATS,
  BlobSource,
  CanvasSink,
  Input,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
} from "mediabunny";

import { createBezierEasing } from "../lib/easing-functions";
import { AVC_LEVEL_4_0, AVC_LEVEL_5_1 } from "../lib/video-encoding";
import { BASELINE_PIXEL_LIMIT } from "../lib/video-probing";
import { applySpeedCurveAsync } from "../hooks/useApplySpeedCurve";
import { prepareAudioAsync } from "../hooks/useAudioMixing";
import { stitchVideosAsync } from "../hooks/useStitchVideos";
import { trimVideoAsync } from "../hooks/useTrimVideo";

export type VideoOperationKind =
  | "edit.video.stitch"
  | "edit.video.trim"
  | "edit.video.frameGrab"
  | "edit.video.easeCurve";

export type StitchVideoParameters = { repeat: number; stripAudio: boolean };
export type TrimVideoParameters = { startMs: number; endMs: number; stripAudio: boolean };
export type FrameGrabParameters = { position: "first" | "last" };
export type EaseCurveParameters = {
  outputDurationMs: number;
  easingPreset: string | null;
  bezier: [number, number, number, number];
};
export type VideoOperationParameters =
  | StitchVideoParameters
  | TrimVideoParameters
  | FrameGrabParameters
  | EaseCurveParameters;

export type VideoOperationInput = {
  assetId: string;
  portId: string;
  sortOrder: number;
  type: "audio" | "video";
  mimeType: string;
  url: string;
};

export type VideoOperationRequest = {
  kind: VideoOperationKind;
  parameters: VideoOperationParameters;
  inputs: VideoOperationInput[];
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

export type VideoOperationResultItem = {
  blob: Blob;
  fileName: string;
  mimeType: "image/png" | "video/mp4";
  sortOrder: number;
  width: number;
  height: number;
  durationMs: number | null;
  hasAudio: boolean;
};

export type VideoOperationResult = { outputs: [VideoOperationResultItem] };

type ProbedMedia = {
  blob: Blob;
  durationMs: number;
  video: {
    codec: string;
    width: number;
    height: number;
  } | null;
  audio: {
    codec: string;
    numberOfChannels: number;
    sampleRate: number;
  } | null;
};

const OUTPUT_BITRATE = 8_000_000;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Video operation cancelled", "AbortError");
}

async function fetchInput(input: VideoOperationInput, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal);
  const response = await fetch(input.url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`VIDEO_INPUT_FETCH_FAILED:${input.assetId}`);
  const blob = await response.blob();
  throwIfAborted(signal);
  return blob.type ? blob : new Blob([blob], { type: input.mimeType });
}

async function probeBlob(blob: Blob, requiredType: "audio" | "video"): Promise<ProbedMedia> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const [videoTracks, audioTracks, duration] = await Promise.all([
      input.getVideoTracks(),
      input.getAudioTracks(),
      input.computeDuration(),
    ]);
    const videoTrack = videoTracks[0] ?? null;
    const audioTrack = audioTracks[0] ?? null;
    if (requiredType === "video" && !videoTrack) throw new Error("VIDEO_TRACK_MISSING");
    if (requiredType === "audio" && !audioTrack) throw new Error("AUDIO_TRACK_MISSING");
    if (videoTrack && (!videoTrack.codec || !(await videoTrack.canDecode()))) {
      throw new Error("VIDEO_CODEC_UNSUPPORTED");
    }
    if (audioTrack && (!audioTrack.codec || !(await audioTrack.canDecode()))) {
      throw new Error("AUDIO_CODEC_UNSUPPORTED");
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("MEDIA_DURATION_INVALID");
    return {
      blob,
      durationMs: Math.round(duration * 1_000),
      video: videoTrack ? {
        codec: videoTrack.codec as string,
        width: videoTrack.displayWidth,
        height: videoTrack.displayHeight,
      } : null,
      audio: audioTrack ? {
        codec: audioTrack.codec as string,
        numberOfChannels: audioTrack.numberOfChannels,
        sampleRate: audioTrack.sampleRate,
      } : null,
    };
  } finally {
    input.dispose();
  }
}

async function preflightVideoEncoder(inputs: ProbedMedia[]) {
  const width = Math.max(...inputs.map((input) => input.video?.width ?? 0));
  const height = Math.max(...inputs.map((input) => input.video?.height ?? 0));
  if (width <= 0 || height <= 0) throw new Error("VIDEO_DIMENSIONS_INVALID");
  const codecProfile = width * height > BASELINE_PIXEL_LIMIT ? AVC_LEVEL_5_1 : AVC_LEVEL_4_0;
  if (!(await canEncodeVideo("avc", {
    width,
    height,
    bitrate: OUTPUT_BITRATE,
    fullCodecString: codecProfile,
    hardwareAcceleration: "prefer-software",
  }))) {
    throw new Error("VIDEO_ENCODER_UNSUPPORTED");
  }
}

async function preflightAudioEncoder(audio: NonNullable<ProbedMedia["audio"]> | null) {
  if (!audio) return;
  const codec = await getFirstEncodableAudioCodec(["aac", "mp3"], {
    numberOfChannels: audio.numberOfChannels,
    sampleRate: audio.sampleRate,
    bitrate: 128_000,
  });
  if (!codec) throw new Error("AUDIO_ENCODER_UNSUPPORTED");
}

function assertDuration(actualMs: number, expectedMs: number) {
  const toleranceMs = Math.max(500, Math.round(expectedMs * 0.1));
  if (Math.abs(actualMs - expectedMs) > toleranceMs) {
    throw new Error("VIDEO_OUTPUT_DURATION_INVALID");
  }
}

async function verifyVideoOutput(
  blob: Blob,
  expectedDurationMs: number,
  audioRequired: boolean,
) {
  if (blob.type !== "video/mp4") throw new Error("VIDEO_OUTPUT_MIME_INVALID");
  const probe = await probeBlob(blob, "video");
  if (!probe.video || probe.video.width <= 0 || probe.video.height <= 0) {
    throw new Error("VIDEO_OUTPUT_DIMENSIONS_INVALID");
  }
  assertDuration(probe.durationMs, expectedDurationMs);
  if (audioRequired && !probe.audio) throw new Error("VIDEO_OUTPUT_AUDIO_MISSING");
  return probe;
}

async function canvasToPng(canvas: HTMLCanvasElement | OffscreenCanvas) {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("FRAME_GRAB_CANVAS_UNAVAILABLE");
  context.drawImage(canvas, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("FRAME_GRAB_ENCODE_FAILED")), "image/png");
  });
}

async function grabFrame(inputMedia: ProbedMedia, position: "first" | "last", signal?: AbortSignal) {
  const input = new Input({ source: new BlobSource(inputMedia.blob), formats: ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("VIDEO_TRACK_MISSING");
    const sink = new CanvasSink(videoTrack);
    const timestamp = position === "first"
      ? 0.001
      : Math.max(0, inputMedia.durationMs / 1_000 - 0.1);
    throwIfAborted(signal);
    const frame = await sink.getCanvas(timestamp);
    throwIfAborted(signal);
    if (!frame) throw new Error("FRAME_GRAB_DECODE_FAILED");
    const blob = await canvasToPng(frame.canvas);
    throwIfAborted(signal);
    return {
      blob,
      width: frame.canvas.width,
      height: frame.canvas.height,
    };
  } finally {
    input.dispose();
  }
}

export async function processVideoOperation(request: VideoOperationRequest): Promise<VideoOperationResult> {
  throwIfAborted(request.signal);
  request.onProgress?.(2);
  const ordered = [...request.inputs].sort((left, right) =>
    left.portId.localeCompare(right.portId) || left.sortOrder - right.sortOrder,
  );
  const loaded: Array<{ input: VideoOperationInput; media: ProbedMedia }> = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    const blob = await fetchInput(item, request.signal);
    loaded.push({ input: item, media: await probeBlob(blob, item.type) });
    request.onProgress?.(3 + Math.round(((index + 1) / ordered.length) * 12));
  }
  const videos = loaded.filter((item) => item.input.portId === "clips" || item.input.portId === "video");
  if (videos.length === 0) throw new Error("VIDEO_INPUT_REQUIRED");

  if (request.kind === "edit.video.frameGrab") {
    const parameters = request.parameters as FrameGrabParameters;
    const frame = await grabFrame(videos[0].media, parameters.position, request.signal);
    request.onProgress?.(95);
    return { outputs: [{
      ...frame,
      fileName: `node-banana-frame-${parameters.position}.png`,
      mimeType: "image/png",
      sortOrder: 0,
      durationMs: null,
      hasAudio: false,
    }] };
  }

  await preflightVideoEncoder(videos.map((item) => item.media));
  throwIfAborted(request.signal);

  if (request.kind === "edit.video.stitch") {
    const parameters = request.parameters as StitchVideoParameters;
    if (videos.length < 2) throw new Error("VIDEO_STITCH_REQUIRES_TWO_CLIPS");
    const soundtrack = loaded.find((item) => item.input.portId === "soundtrack") ?? null;
    const embeddedAudio = videos.find((item) => item.media.audio)?.media.audio ?? null;
    const audioRequired = !parameters.stripAudio && Boolean(soundtrack || embeddedAudio);
    await preflightAudioEncoder(
      audioRequired ? soundtrack?.media.audio ?? embeddedAudio : null,
    );
    const sequence = Array.from({ length: parameters.repeat }, () =>
      videos.map((item) => item.media.blob),
    ).flat();
    const expectedDurationMs = videos.reduce((sum, item) => sum + item.media.durationMs, 0) * parameters.repeat;
    const audioData = !parameters.stripAudio && soundtrack
      ? await prepareAudioAsync(soundtrack.media.blob, expectedDurationMs / 1_000)
      : null;
    throwIfAborted(request.signal);
    const blob = await stitchVideosAsync(
      sequence,
      audioData,
      (progress) => request.onProgress?.(15 + progress.progress * 0.75),
      request.signal,
      !parameters.stripAudio,
    );
    const probe = await verifyVideoOutput(blob, expectedDurationMs, audioRequired);
    return { outputs: [{
      blob,
      fileName: "node-banana-video-stitch.mp4",
      mimeType: "video/mp4",
      sortOrder: 0,
      width: probe.video!.width,
      height: probe.video!.height,
      durationMs: probe.durationMs,
      hasAudio: Boolean(probe.audio),
    }] };
  }

  if (request.kind === "edit.video.trim") {
    const parameters = request.parameters as TrimVideoParameters;
    const source = videos[0].media;
    if (parameters.endMs <= parameters.startMs || parameters.endMs > source.durationMs) {
      throw new Error("VIDEO_TRIM_INTERVAL_INVALID");
    }
    const audioRequired = !parameters.stripAudio && Boolean(source.audio);
    await preflightAudioEncoder(audioRequired ? source.audio : null);
    const blob = await trimVideoAsync(
      source.blob,
      parameters.startMs / 1_000,
      parameters.endMs / 1_000,
      (progress) => request.onProgress?.(15 + progress.progress * 0.75),
      request.signal,
      !parameters.stripAudio,
    );
    const probe = await verifyVideoOutput(blob, parameters.endMs - parameters.startMs, audioRequired);
    return { outputs: [{
      blob,
      fileName: "node-banana-video-trim.mp4",
      mimeType: "video/mp4",
      sortOrder: 0,
      width: probe.video!.width,
      height: probe.video!.height,
      durationMs: probe.durationMs,
      hasAudio: Boolean(probe.audio),
    }] };
  }

  const parameters = request.parameters as EaseCurveParameters;
  const source = videos[0].media;
  const easing = parameters.easingPreset ?? createBezierEasing(...parameters.bezier);
  const blob = await applySpeedCurveAsync(
    source.blob,
    source.durationMs / 1_000,
    parameters.outputDurationMs / 1_000,
    (progress) => request.onProgress?.(15 + progress.progress * 0.75),
    easing,
    OUTPUT_BITRATE,
    request.signal,
  );
  if (!blob) throw new Error("VIDEO_EASE_CURVE_OUTPUT_MISSING");
  const probe = await verifyVideoOutput(blob, parameters.outputDurationMs, false);
  return { outputs: [{
    blob,
    fileName: "node-banana-video-ease-curve.mp4",
    mimeType: "video/mp4",
    sortOrder: 0,
    width: probe.video!.width,
    height: probe.video!.height,
    durationMs: probe.durationMs,
    hasAudio: Boolean(probe.audio),
  }] };
}
