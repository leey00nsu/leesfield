import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

VideoModelKey: TypeAlias = str
VideoProvider = Literal["hunyuanvideo"]


@dataclass(frozen=True)
class VideoModelSpec:
    key: VideoModelKey
    label: str
    provider: VideoProvider
    supports_init_image: bool
    t2v_model_id: str
    i2v_model_id: str | None
    default_width: int
    default_height: int
    default_duration_sec: int
    default_fps: int
    default_steps: int
    default_guidance_scale: float


def _resolve_config_path() -> Path:
    candidates = [
        Path(__file__).resolve().parents[3] / "configs" / "video-models.json",
        Path(__file__).resolve().parents[2] / "configs" / "video-models.json",
        Path("/root/configs/video-models.json"),
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError("video-models.json not found")


def _load_video_model_specs() -> dict[VideoModelKey, VideoModelSpec]:
    config_path = _resolve_config_path()
    data = json.loads(config_path.read_text(encoding="utf-8"))
    models = data.get("models", [])
    specs: dict[VideoModelKey, VideoModelSpec] = {}
    for model in models:
        provider = model.get("provider", "hunyuanvideo")
        if provider != "hunyuanvideo":
            raise ValueError(f"UNSUPPORTED_PROVIDER: {provider}")
        spec = VideoModelSpec(
            key=str(model.get("key")),
            label=str(model.get("label")),
            provider=provider,
            supports_init_image=bool(model.get("supports_init_image", False)),
            t2v_model_id=str(model.get("t2v_model_id")),
            i2v_model_id=model.get("i2v_model_id") or None,
            default_width=int(model.get("default_width")),
            default_height=int(model.get("default_height")),
            default_duration_sec=int(model.get("default_duration_sec")),
            default_fps=int(model.get("default_fps")),
            default_steps=int(model.get("default_steps")),
            default_guidance_scale=float(model.get("default_guidance_scale")),
        )
        specs[spec.key] = spec
    if not specs:
        raise ValueError("VIDEO_MODEL_SPECS_EMPTY")
    return specs


VIDEO_MODEL_SPECS: dict[VideoModelKey, VideoModelSpec] = _load_video_model_specs()


def get_video_model_spec(model_key: VideoModelKey) -> VideoModelSpec:
    return VIDEO_MODEL_SPECS[model_key]


def is_video_model_supported(model_key: str) -> bool:
    return model_key in VIDEO_MODEL_SPECS
