from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import torch
from PIL import Image, ImageOps

from .pipeline import load_pipeline, resolve_scheduler
from .registry import ModelKey, get_model_spec


@dataclass
class GenerationParams:
    prompt: str
    negative_prompt: str | None
    width: int | None
    height: int | None
    init_images: list[str] | None
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


def _encode_image(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"


def _decode_image(data_url: str) -> Image.Image:
    if data_url.startswith("data:"):
        _, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded)
    else:
        raw = base64.b64decode(data_url)
    return ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")


def _round_to_multiple(value: int, multiple: int = 8) -> int:
    if multiple <= 1:
        return value
    return max(multiple, int(round(value / multiple)) * multiple)


def generate_images(params: GenerationParams) -> list[str]:
    spec = get_model_spec(params.model)
    init_images = params.init_images or []
    has_init_images = len(init_images) > 0

    if has_init_images and spec.key != "z-image-turbo":
        raise ValueError("UNSUPPORTED_IMAGE_INPUT")

    pipe = load_pipeline(spec, "image" if has_init_images else "text")

    width = _resolve_dimension(params.width, spec.default_width)
    height = _resolve_dimension(params.height, spec.default_height)
    steps = _resolve_int(params.steps, spec.default_steps)
    guidance_scale = _resolve_float(params.cfg_scale, spec.default_cfg_scale)
    negative_prompt = params.negative_prompt

    if spec.key == "z-image-turbo":
        guidance_scale = 0.0
        negative_prompt = None
    image_count = _resolve_int(params.image_count, 1)

    if params.sampler:
        scheduler = resolve_scheduler(params.sampler, spec)
        if scheduler is not None:
            pipe.scheduler = scheduler

    generator = None
    if params.seed is not None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=device).manual_seed(int(params.seed))

    output_type = "pt" if spec.key == "z-image-turbo" else "pil"
    call_args = {
        "prompt": params.prompt,
        "negative_prompt": negative_prompt,
        "num_inference_steps": steps,
        "num_images_per_prompt": image_count,
        "generator": generator,
        "output_type": output_type,
        "guidance_scale": guidance_scale,
    }

    if not has_init_images:
        call_args["width"] = width
        call_args["height"] = height
    else:
        max_dim = max(width, height)
        if max_dim > 512:
            scale = 512 / max_dim
            width = max(64, _round_to_multiple(int(width * scale)))
            height = max(64, _round_to_multiple(int(height * scale)))
        decoded_images = [
            _decode_image(item).resize((width, height), Image.LANCZOS)
            for item in init_images
        ]
        call_args["image"] = (
            decoded_images[0] if len(decoded_images) == 1 else decoded_images
        )
        call_args["strength"] = 0.6

    with torch.inference_mode():
        output = pipe(**call_args)

    if spec.key == "z-image-turbo":
        images = output.images
        if images.ndim == 3:
            images = images.unsqueeze(0)
        images = torch.nan_to_num(images, nan=0.0, posinf=1.0, neginf=0.0)
        images = images.clamp(0, 1)
        pil_images = []
        for image in images:
            array = (
                image.permute(1, 2, 0)
                .float()
                .cpu()
                .numpy()
                * 255
            ).round().astype("uint8")
            pil_images.append(Image.fromarray(array))
        return [_encode_image(image) for image in pil_images]

    return [_encode_image(image) for image in output.images]
