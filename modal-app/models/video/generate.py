from __future__ import annotations

from dataclasses import dataclass

from .pipeline import load_video_pipeline, write_video_data_url
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

def _round_to_multiple(value: int, multiple: int = 16) -> int:
    if multiple <= 1:
        return value
    return max(multiple, int(round(value / multiple)) * multiple)


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
        width=_round_to_multiple(width, 16),
        height=_round_to_multiple(height, 16),
        duration_sec=duration_sec,
        fps=fps,
        steps=steps,
        guidance_scale=guidance_scale,
    )


def generate_videos(
    params: VideoGenerationParams, resolved: ResolvedVideoParams | None = None
) -> list[str]:
    spec = get_video_model_spec(params.model)
    resolved_params = resolved or resolve_video_params(params)
    mode = "text"
    pipeline = load_video_pipeline(spec, mode)
    init_image = None
    if params.init_image:
        raise ValueError("UNSUPPORTED_IMAGE_INPUT")
    frames = pipeline.generate(
        prompt=params.prompt,
        init_image=init_image,
        width=resolved_params.width,
        height=resolved_params.height,
        num_frames=resolved_params.duration_sec * resolved_params.fps,
        fps=resolved_params.fps,
        steps=resolved_params.steps,
        guidance_scale=resolved_params.guidance_scale,
        seed=params.seed,
    )
    return [write_video_data_url(frames, resolved_params.fps)]
