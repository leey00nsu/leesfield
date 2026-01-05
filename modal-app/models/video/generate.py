from __future__ import annotations

from dataclasses import dataclass

from .registry import VideoModelKey, get_video_model_spec


@dataclass
class VideoGenerationParams:
    prompt: str
    init_image: str | None
    width: int | None
    height: int | None
    duration_sec: int | None
    fps: int | None
    steps: int | None
    guidance_scale: float | None
    seed: int | None
    model: VideoModelKey


@dataclass
class ResolvedVideoParams:
    width: int
    height: int
    duration_sec: int
    fps: int
    steps: int
    guidance_scale: float


def _resolve_int(value: int | None, fallback: int) -> int:
    if value is None:
        return fallback
    return int(value)


def _resolve_float(value: float | None, fallback: float) -> float:
    if value is None:
        return fallback
    return float(value)


def _resolve_dimension(value: int | None, fallback: int) -> int:
    if value is None:
        return fallback
    return max(64, int(value))


def resolve_video_params(params: VideoGenerationParams) -> ResolvedVideoParams:
    spec = get_video_model_spec(params.model)
    if params.init_image and not spec.supports_init_image:
        raise ValueError("UNSUPPORTED_IMAGE_INPUT")

    width = _resolve_dimension(params.width, spec.default_width)
    height = _resolve_dimension(params.height, spec.default_height)
    duration_sec = _resolve_int(params.duration_sec, spec.default_duration_sec)
    fps = _resolve_int(params.fps, spec.default_fps)
    steps = _resolve_int(params.steps, spec.default_steps)
    guidance_scale = _resolve_float(
        params.guidance_scale, spec.default_guidance_scale
    )

    return ResolvedVideoParams(
        width=width,
        height=height,
        duration_sec=duration_sec,
        fps=fps,
        steps=steps,
        guidance_scale=guidance_scale,
    )


def generate_videos(_: VideoGenerationParams) -> list[str]:
    raise NotImplementedError("VIDEO_PIPELINE_NOT_READY")
