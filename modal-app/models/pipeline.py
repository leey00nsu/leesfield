from __future__ import annotations

from typing import Any, Literal

import torch
from diffusers import (
    AutoPipelineForImage2Image,
    DDIMScheduler,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
    DiffusionPipeline,
    StableDiffusionImg2ImgPipeline,
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    StableDiffusionXLImg2ImgPipeline,
)

from .registry import ModelSpec

PIPELINE_CACHE: dict[str, Any] = {}

def clear_pipeline_cache() -> None:
    for pipeline in PIPELINE_CACHE.values():
        try:
            pipeline.to("cpu")
        except Exception:
            pass
    PIPELINE_CACHE.clear()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def resolve_scheduler(name: str | None, spec: ModelSpec):
    if not name:
        return None

    if spec.pipeline == "diffusion":
        return None

    if name.lower().startswith("euler"):
        return EulerAncestralDiscreteScheduler.from_pretrained(
            spec.model_id, subfolder="scheduler"
        )

    if name.lower().startswith("ddim"):
        return DDIMScheduler.from_pretrained(spec.model_id, subfolder="scheduler")

    return DPMSolverMultistepScheduler.from_pretrained(
        spec.model_id, subfolder="scheduler", use_karras_sigmas=True
    )


def load_pipeline(spec: ModelSpec, mode: Literal["text", "image"] = "text"):
    cache_key = f"{spec.key}:{mode}"
    if cache_key in PIPELINE_CACHE:
        return PIPELINE_CACHE[cache_key]

    if PIPELINE_CACHE:
        clear_pipeline_cache()

    if spec.key == "z-image-turbo":
        dtype = (
            torch.bfloat16 if torch.cuda.is_available() else torch.float32
        )
    else:
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    if mode == "image":
        if spec.pipeline == "sdxl":
            pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
                spec.model_id,
                torch_dtype=dtype,
            )
        elif spec.pipeline == "sd":
            pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
                spec.model_id,
                torch_dtype=dtype,
            )
        else:
            pipe = AutoPipelineForImage2Image.from_pretrained(
                spec.model_id,
                torch_dtype=dtype,
            )
    else:
        if spec.pipeline == "sdxl":
            pipe = StableDiffusionXLPipeline.from_pretrained(
                spec.model_id,
                torch_dtype=dtype,
            )
        elif spec.pipeline == "sd":
            pipe = StableDiffusionPipeline.from_pretrained(
                spec.model_id,
                torch_dtype=dtype,
            )
        else:
            pipe = DiffusionPipeline.from_pretrained(
                spec.model_id,
                torch_dtype=dtype,
            )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipe = pipe.to(device)
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    if hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()
    if spec.key == "sdxl-turbo" and hasattr(pipe, "scheduler"):
        try:
            pipe.scheduler = pipe.scheduler.__class__.from_config(
                pipe.scheduler.config, timestep_spacing="trailing"
            )
        except Exception:
            pass
    pipe.set_progress_bar_config(disable=True)

    PIPELINE_CACHE[cache_key] = pipe
    return pipe
