from __future__ import annotations

from .registry import VideoModelSpec


def load_video_pipeline(_: VideoModelSpec):
    raise NotImplementedError("VIDEO_PIPELINE_NOT_READY")
