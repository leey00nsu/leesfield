import os
from dataclasses import dataclass, replace
from typing import Literal

VideoModelKey = Literal["hunyuanvideo-1.5"]

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


VIDEO_MODEL_SPECS: dict[VideoModelKey, VideoModelSpec] = {
    "hunyuanvideo-1.5": VideoModelSpec(
        key="hunyuanvideo-1.5",
        label="HunyuanVideo 1.5",
        provider="hunyuanvideo",
        supports_init_image=False,
        t2v_model_id="hunyuanvideo-community/HunyuanVideo-1.5-480p_t2v",
        i2v_model_id=None,
        default_width=854,
        default_height=480,
        default_duration_sec=4,
        default_fps=24,
        default_steps=28,
        default_guidance_scale=6.0,
    ),
}


def get_video_model_spec(model_key: VideoModelKey) -> VideoModelSpec:
    spec = VIDEO_MODEL_SPECS[model_key]
    if spec.key == "hunyuanvideo-1.5":
        model_id = os.getenv("HUNYUANVIDEO_T2V_MODEL_ID", spec.t2v_model_id)
        return replace(spec, t2v_model_id=model_id)
    return spec


def is_video_model_supported(model_key: str) -> bool:
    return model_key in VIDEO_MODEL_SPECS
