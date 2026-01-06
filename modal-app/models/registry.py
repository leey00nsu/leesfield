import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

ModelKey: TypeAlias = str
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
    max_input_images: int

def _resolve_config_path() -> Path:
    candidates = [
        Path(__file__).resolve().parents[2] / "configs" / "image-models.json",
        Path(__file__).resolve().parents[1] / "configs" / "image-models.json",
        Path("/root/configs/image-models.json"),
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError("image-models.json not found")


def _load_model_specs() -> dict[ModelKey, ModelSpec]:
    config_path = _resolve_config_path()
    data = json.loads(config_path.read_text(encoding="utf-8"))
    models = data.get("models", [])
    specs: dict[ModelKey, ModelSpec] = {}
    for model in models:
        pipeline = model.get("pipeline")
        if pipeline not in ("diffusion", "sd", "sdxl"):
            raise ValueError(f"UNSUPPORTED_PIPELINE: {pipeline}")
        spec = ModelSpec(
            key=str(model.get("key")),
            label=str(model.get("label")),
            model_id=str(model.get("model_id")),
            pipeline=pipeline,
            default_width=int(model.get("default_width")),
            default_height=int(model.get("default_height")),
            default_steps=int(model.get("default_steps")),
            default_cfg_scale=float(model.get("default_cfg_scale")),
            max_input_images=int(model.get("max_input_images", 0)),
        )
        specs[spec.key] = spec
    if not specs:
        raise ValueError("MODEL_SPECS_EMPTY")
    return specs


MODEL_SPECS: dict[ModelKey, ModelSpec] = _load_model_specs()


def get_model_spec(model_key: ModelKey) -> ModelSpec:
    return MODEL_SPECS[model_key]


def is_model_supported(model_key: str) -> bool:
    return model_key in MODEL_SPECS
