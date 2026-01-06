from __future__ import annotations

import base64
import tempfile
from dataclasses import dataclass
from typing import Literal

import torch
from diffusers import HunyuanVideo15Pipeline
from diffusers.utils import export_to_video
from PIL import Image

from .registry import VideoModelSpec

PipelineMode = Literal["text", "image"]

PIPELINE_CACHE: dict[str, "VideoPipeline"] = {}


def _resolve_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _configure_pipeline(pipe: object) -> None:
    if hasattr(pipe, "set_progress_bar_config"):
        pipe.set_progress_bar_config(disable=True)
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    if hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()


def _maybe_offload(pipe: object) -> None:
    if os.getenv("VIDEO_ENABLE_SEQUENTIAL_CPU_OFFLOAD") == "1":
        if hasattr(pipe, "enable_sequential_cpu_offload"):
            pipe.enable_sequential_cpu_offload()
            return
    if os.getenv("VIDEO_ENABLE_CPU_OFFLOAD", "1") == "1":
        if hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()
            return
    if hasattr(pipe, "to"):
        pipe.to(_resolve_device())

def clear_pipeline_cache() -> None:
    for pipeline in PIPELINE_CACHE.values():
        pipe = getattr(pipeline, "pipe", None)
        if pipe is None:
            continue
        try:
            if hasattr(pipe, "to"):
                pipe.to("cpu")
        except Exception:
            pass
    PIPELINE_CACHE.clear()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def write_video_data_url(frames: list[Image.Image], fps: int) -> str:
    with tempfile.NamedTemporaryFile(suffix=".mp4") as tmp:
        export_to_video(frames, tmp.name, fps=fps)
        tmp.seek(0)
        raw = tmp.read()
    return f"data:video/mp4;base64,{base64.b64encode(raw).decode()}"


@dataclass(frozen=True)
class VideoPipeline:
    pipe: object
    mode: PipelineMode

    def generate(
        self,
        prompt: str,
        init_image: Image.Image | None,
        width: int,
        height: int,
        num_frames: int,
        fps: int,
        steps: int,
        guidance_scale: float,
        seed: int | None,
    ) -> list[Image.Image]:
        generator = None
        if seed is not None:
            generator = torch.Generator(device=_resolve_device()).manual_seed(
                int(seed)
            )

        call_args = {
            "prompt": prompt,
            "height": height,
            "width": width,
            "num_frames": max(1, int(num_frames)),
            "guidance_scale": guidance_scale,
            "num_inference_steps": steps,
            "generator": generator,
        }

        if self.mode == "image" and init_image is not None:
            call_args["image"] = init_image

        output = self.pipe(**call_args)
        frames = getattr(output, "frames", None)
        if frames is None:
            raise ValueError("VIDEO_GENERATION_FAILED")
        return frames[0]


def load_video_pipeline(spec: VideoModelSpec, mode: PipelineMode) -> VideoPipeline:
    cache_key = f"{spec.key}:{mode}"
    cached = PIPELINE_CACHE.get(cache_key)
    if cached:
        return cached

    if PIPELINE_CACHE:
        clear_pipeline_cache()

    device = _resolve_device()

    pipe = HunyuanVideo15Pipeline.from_pretrained(
        spec.t2v_model_id,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
    )

    _configure_pipeline(pipe)
    _maybe_offload(pipe)

    wrapper = VideoPipeline(pipe=pipe, mode=mode)
    PIPELINE_CACHE[cache_key] = wrapper
    return wrapper
