import os
import uuid

import modal
from fastapi import FastAPI
from pydantic import BaseModel

APP_NAME = "leesfield-modal-image-generation"
DEFAULT_MODEL = "z-image-turbo"

MODAL_TOKEN_ID = os.getenv("MODAL_TOKEN_ID")
MODAL_TOKEN_SECRET = os.getenv("MODAL_TOKEN_SECRET")
MODAL_PROXY_KEY = os.getenv("MODAL_PROXY_KEY")
MODAL_PROXY_SECRET = os.getenv("MODAL_PROXY_SECRET")

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
def generate(payload: GenerationRequest) -> dict[str, str]:
    _ = payload
    return {
        "request_id": str(uuid.uuid4()),
        "status": "pending",
    }


@app.function()
@modal.asgi_app(requires_proxy_auth=True)
def fastapi_app():
    return web_app
