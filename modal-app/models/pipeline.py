from __future__ import annotations

from typing import Any

import torch
from diffusers import (
    DDIMScheduler,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
    DiffusionPipeline,
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
)

from .registry import ModelSpec

PIPELINE_CACHE: dict[str, Any] = {}


def resolve_scheduler(name: str | None, model_id: str):
    if not name:
        return None

    if name.lower().startswith("euler"):
        return EulerAncestralDiscreteScheduler.from_pretrained(
            model_id, subfolder="scheduler"
        )

    if name.lower().startswith("ddim"):
        return DDIMScheduler.from_pretrained(model_id, subfolder="scheduler")

    return DPMSolverMultistepScheduler.from_pretrained(
        model_id, subfolder="scheduler", use_karras_sigmas=True
    )


def load_pipeline(spec: ModelSpec):
    if spec.key in PIPELINE_CACHE:
        return PIPELINE_CACHE[spec.key]

    dtype = torch.float16 if torch.cuda.is_available() else torch.float32

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
    pipe.set_progress_bar_config(disable=True)

    PIPELINE_CACHE[spec.key] = pipe
    return pipe
