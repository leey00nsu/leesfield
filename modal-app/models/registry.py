from dataclasses import dataclass
from typing import Literal

ModelKey = Literal[
    "z-image-turbo",
    "sdxl-base-1.0",
    "openjourney",
    "sdxl-turbo",
]

PipelineType = Literal["diffusion", "sd", "sdxl"]


@dataclass(frozen=True)
class ModelSpec:
    key: ModelKey
    label: str
    model_id: str
    pipeline: PipelineType
    default_width: int
    default_height: int
    default_steps: int
    default_cfg_scale: float


MODEL_SPECS: dict[ModelKey, ModelSpec] = {
    "z-image-turbo": ModelSpec(
        key="z-image-turbo",
        label="Z-Image Turbo",
        model_id="Tongyi-MAI/Z-Image-Turbo",
        pipeline="diffusion",
        default_width=1024,
        default_height=1024,
        default_steps=8,
        default_cfg_scale=0.0,
    ),
    "sdxl-base-1.0": ModelSpec(
        key="sdxl-base-1.0",
        label="SDXL Base 1.0",
        model_id="stabilityai/stable-diffusion-xl-base-1.0",
        pipeline="sdxl",
        default_width=1024,
        default_height=1024,
        default_steps=30,
        default_cfg_scale=7.0,
    ),
    "openjourney": ModelSpec(
        key="openjourney",
        label="OpenJourney",
        model_id="prompthero/openjourney",
        pipeline="sd",
        default_width=512,
        default_height=512,
        default_steps=30,
        default_cfg_scale=7.0,
    ),
    "sdxl-turbo": ModelSpec(
        key="sdxl-turbo",
        label="SDXL Turbo",
        model_id="stabilityai/sdxl-turbo",
        pipeline="sdxl",
        default_width=512,
        default_height=512,
        default_steps=2,
        default_cfg_scale=0.0,
    ),
}


def get_model_spec(model_key: ModelKey) -> ModelSpec:
    return MODEL_SPECS[model_key]


def is_model_supported(model_key: str) -> bool:
    return model_key in MODEL_SPECS
