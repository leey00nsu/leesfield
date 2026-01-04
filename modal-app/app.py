import uuid

import modal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from models import GenerationParams, generate_images, is_model_supported

APP_NAME = "leesfield-modal-image-generation"
DEFAULT_MODEL = "z-image-turbo"

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi",
        "pydantic",
        "torch",
        "torchvision",
        "diffusers",
        "transformers",
        "accelerate",
        "safetensors",
        "pillow",
    )
)

app = modal.App(APP_NAME)
web_app = FastAPI()


class GenerationRequest(BaseModel):
    prompt: str
    negative_prompt: str | None = None
    width: int | None = None
    height: int | None = None
    image_count: int | None = None
    steps: int | None = None
    cfg_scale: float | None = None
    seed: int | None = None
    sampler: str | None = None
    model: str = DEFAULT_MODEL


@web_app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@web_app.post("/generate")
def generate(payload: GenerationRequest) -> dict[str, object]:
    if not is_model_supported(payload.model):
        raise HTTPException(status_code=400, detail="UNSUPPORTED_MODEL")

    params = GenerationParams(
        prompt=payload.prompt,
        negative_prompt=payload.negative_prompt,
        width=payload.width,
        height=payload.height,
        image_count=payload.image_count,
        steps=payload.steps,
        cfg_scale=payload.cfg_scale,
        seed=payload.seed,
        sampler=payload.sampler,
        model=payload.model,
    )

    images = generate_images(params)

    return {
        "request_id": str(uuid.uuid4()),
        "status": "completed",
        "model": payload.model,
        "images": images,
    }


@app.function(image=image)
@modal.asgi_app(requires_proxy_auth=True)
def fastapi_app():
    return web_app
