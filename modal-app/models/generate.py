from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import torch

from .pipeline import load_pipeline, resolve_scheduler
from .registry import ModelKey, get_model_spec


@dataclass
class GenerationParams:
    prompt: str
    negative_prompt: str | None
    width: int | None
    height: int | None
    image_count: int | None
    steps: int | None
    cfg_scale: float | None
    seed: int | None
    sampler: str | None
    model: ModelKey


def _resolve_dimension(value: int | None, fallback: int) -> int:
    if value is None:
        return fallback
    return max(64, int(value))


def _resolve_int(value: int | None, fallback: int) -> int:
    if value is None:
        return fallback
    return int(value)


def _resolve_float(value: float | None, fallback: float) -> float:
    if value is None:
        return fallback
    return float(value)


def _encode_image(image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"


def generate_images(params: GenerationParams) -> list[str]:
    spec = get_model_spec(params.model)
    pipe = load_pipeline(spec)

    width = _resolve_dimension(params.width, spec.default_width)
    height = _resolve_dimension(params.height, spec.default_height)
    steps = _resolve_int(params.steps, spec.default_steps)
    guidance_scale = _resolve_float(params.cfg_scale, spec.default_cfg_scale)
    image_count = _resolve_int(params.image_count, 1)

    if params.sampler:
        scheduler = resolve_scheduler(params.sampler, spec.model_id)
        if scheduler is not None:
            pipe.scheduler = scheduler

    generator = None
    if params.seed is not None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=device).manual_seed(int(params.seed))

    with torch.inference_mode():
        output = pipe(
            prompt=params.prompt,
            negative_prompt=params.negative_prompt,
            width=width,
            height=height,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            num_images_per_prompt=image_count,
            generator=generator,
        )

    return [_encode_image(image) for image in output.images]
