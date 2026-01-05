from dataclasses import dataclass
from typing import Literal

VideoModelKey = Literal[
    "hunyuanvideo-1.5",
    "hunyuanvideo-i2v",
    "cogvideox-1.5-5b-i2v",
    "step-video-ti2v",
    "svd-xt-1.1",
]


@dataclass(frozen=True)
class VideoModelSpec:
    key: VideoModelKey
    label: str
    requires_init_image: bool
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
        requires_init_image=False,
        default_width=1280,
        default_height=720,
        default_duration_sec=4,
        default_fps=24,
        default_steps=30,
        default_guidance_scale=6.0,
    ),
    "hunyuanvideo-i2v": VideoModelSpec(
        key="hunyuanvideo-i2v",
        label="HunyuanVideo I2V",
        requires_init_image=True,
        default_width=1280,
        default_height=720,
        default_duration_sec=4,
        default_fps=24,
        default_steps=30,
        default_guidance_scale=6.0,
    ),
    "cogvideox-1.5-5b-i2v": VideoModelSpec(
        key="cogvideox-1.5-5b-i2v",
        label="CogVideoX 1.5 5B I2V",
        requires_init_image=True,
        default_width=1280,
        default_height=720,
        default_duration_sec=4,
        default_fps=24,
        default_steps=30,
        default_guidance_scale=6.0,
    ),
    "step-video-ti2v": VideoModelSpec(
        key="step-video-ti2v",
        label="Step Video TI2V",
        requires_init_image=True,
        default_width=1280,
        default_height=720,
        default_duration_sec=4,
        default_fps=24,
        default_steps=30,
        default_guidance_scale=6.0,
    ),
    "svd-xt-1.1": VideoModelSpec(
        key="svd-xt-1.1",
        label="Stable Video Diffusion XT 1.1",
        requires_init_image=True,
        default_width=1024,
        default_height=576,
        default_duration_sec=4,
        default_fps=24,
        default_steps=25,
        default_guidance_scale=5.0,
    ),
}


def get_video_model_spec(model_key: VideoModelKey) -> VideoModelSpec:
    return VIDEO_MODEL_SPECS[model_key]


def is_video_model_supported(model_key: str) -> bool:
    return model_key in VIDEO_MODEL_SPECS
