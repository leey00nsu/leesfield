import uuid
from pathlib import Path

import modal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from models import GenerationParams, generate_images, is_model_supported, get_model_spec
from models.video import (
    VideoGenerationParams,
    generate_videos,
    is_video_model_supported,
    resolve_video_params,
)
from models.pipeline import load_pipeline

APP_NAME = "leesfield-modal-image-generation"
DEFAULT_MODEL = "z-image-turbo"
DEFAULT_VIDEO_MODEL = "hunyuanvideo-1.5"

LOCAL_DIR = Path(__file__).parent
CONFIG_DIR = LOCAL_DIR.parent / "configs"
CACHE_VOLUME_NAME = "leesfield-model-cache"
CACHE_DIR = "/cache"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi",
        "pydantic",
        "torch",
        "torchvision",
        "git+https://github.com/huggingface/diffusers.git",
        "transformers",
        "accelerate",
        "safetensors",
        "huggingface-hub",
        "ftfy",
        "sentencepiece",
        "timm",
        "einops",
        "pillow",
        "imageio",
        "imageio-ffmpeg",
        "numpy",
    )
    .env(
        {
            "HF_HOME": f"{CACHE_DIR}/huggingface",
            "HF_HUB_CACHE": f"{CACHE_DIR}/huggingface/hub",
            "TRANSFORMERS_CACHE": f"{CACHE_DIR}/huggingface/transformers",
            "DIFFUSERS_CACHE": f"{CACHE_DIR}/huggingface/diffusers",
            "TORCH_HOME": f"{CACHE_DIR}/torch",
        }
    )
    .add_local_dir(LOCAL_DIR, remote_path="/root")
    .add_local_dir(CONFIG_DIR, remote_path="/root/configs")
)

app = modal.App(APP_NAME)
web_app = FastAPI()
cache_volume = modal.Volume.from_name(CACHE_VOLUME_NAME, create_if_missing=True)


class GenerationRequest(BaseModel):
    prompt: str
    negative_prompt: str | None = None
    width: int | None = None
    height: int | None = None
    init_images: list[str] | None = None
    image_count: int | None = None
    steps: int | None = None
    cfg_scale: float | None = None
    seed: int | None = None
    sampler: str | None = None
    model: str = DEFAULT_MODEL


class VideoGenerationRequest(BaseModel):
    prompt: str
    init_image: str | None = None
    width: int | None = None
    height: int | None = None
    duration_sec: int | None = None
    fps: int | None = None
    steps: int | None = None
    guidance_scale: float | None = None
    seed: int | None = None
    model: str = DEFAULT_VIDEO_MODEL


@web_app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@web_app.on_event("startup")
def warm_up_model() -> None:
    try:
        spec = get_model_spec(DEFAULT_MODEL)
        load_pipeline(spec)
        print(f"[warmup] {DEFAULT_MODEL} loaded")
    except Exception as error:
        print(f"[warmup] failed: {error}")


@web_app.post("/generate")
def generate(payload: GenerationRequest) -> dict[str, object]:
    if not is_model_supported(payload.model):
        raise HTTPException(status_code=400, detail="UNSUPPORTED_MODEL")

    params = GenerationParams(
        prompt=payload.prompt,
        negative_prompt=payload.negative_prompt,
        width=payload.width,
        height=payload.height,
        init_images=payload.init_images,
        image_count=payload.image_count,
        steps=payload.steps,
        cfg_scale=payload.cfg_scale,
        seed=payload.seed,
        sampler=payload.sampler,
        model=payload.model,
    )

    try:
        images = generate_images(params)
    except ValueError as error:
        if str(error) == "UNSUPPORTED_IMAGE_INPUT":
            raise HTTPException(status_code=400, detail="UNSUPPORTED_IMAGE_INPUT")
        if str(error) == "TOO_MANY_INPUT_IMAGES":
            raise HTTPException(status_code=400, detail="TOO_MANY_INPUT_IMAGES")
        raise

    return {
        "request_id": str(uuid.uuid4()),
        "status": "completed",
        "model": payload.model,
        "images": images,
    }


@web_app.post("/generate-image")
def generate_image(payload: GenerationRequest) -> dict[str, object]:
    return generate(payload)


@web_app.post("/generate-video")
def generate_video(payload: VideoGenerationRequest) -> dict[str, object]:
    if not is_video_model_supported(payload.model):
        raise HTTPException(status_code=400, detail="UNSUPPORTED_MODEL")

    params = VideoGenerationParams(
        prompt=payload.prompt,
        init_image=payload.init_image,
        width=payload.width,
        height=payload.height,
        duration_sec=payload.duration_sec,
        fps=payload.fps,
        steps=payload.steps,
        guidance_scale=payload.guidance_scale,
        seed=payload.seed,
        model=payload.model,
    )

    try:
        resolved = resolve_video_params(params)
        videos = generate_videos(params, resolved)
    except ValueError as error:
        if str(error) == "INIT_IMAGE_REQUIRED":
            raise HTTPException(status_code=400, detail="INIT_IMAGE_REQUIRED")
        if str(error) == "UNSUPPORTED_IMAGE_INPUT":
            raise HTTPException(status_code=400, detail="UNSUPPORTED_IMAGE_INPUT")
        if str(error) == "VIDEO_GENERATION_FAILED":
            raise HTTPException(status_code=500, detail="VIDEO_GENERATION_FAILED")
        raise

    return {
        "request_id": str(uuid.uuid4()),
        "status": "completed",
        "model": payload.model,
        "videos": videos,
        "meta": {
            "width": resolved.width,
            "height": resolved.height,
            "duration_sec": resolved.duration_sec,
            "fps": resolved.fps,
        },
    }


@app.function(image=image, gpu="A10G", volumes={CACHE_DIR: cache_volume})
@modal.asgi_app(requires_proxy_auth=True)
def fastapi_app():
    return web_app
