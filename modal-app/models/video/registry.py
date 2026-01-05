from dataclasses import dataclass
from typing import Literal

VideoModelKey = Literal[
    "hunyuanvideo-1.5",
    "wan-2.2",
]


@dataclass(frozen=True)
class VideoModelSpec:
    key: VideoModelKey
    label: str
    supports_init_image: bool
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
        supports_init_image=True,
        default_width=1280,
        default_height=720,
        default_duration_sec=4,
        default_fps=24,
        default_steps=30,
        default_guidance_scale=6.0,
    ),
    "wan-2.2": VideoModelSpec(
        key="wan-2.2",
        label="Wan 2.2",
        supports_init_image=True,
        default_width=1280,
        default_height=720,
        default_duration_sec=4,
        default_fps=24,
        default_steps=30,
        default_guidance_scale=6.0,
    ),
}


def get_video_model_spec(model_key: VideoModelKey) -> VideoModelSpec:
    return VIDEO_MODEL_SPECS[model_key]


def is_video_model_supported(model_key: str) -> bool:
    return model_key in VIDEO_MODEL_SPECS
