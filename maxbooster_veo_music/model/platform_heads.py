import numpy as np
from typing import Dict
from ai_model.gpu.hyper_core import HyperGPU
from ..boostsheets.schema import PlatformTarget
from .video_generator import VideoGenerator

PLATFORM_DEFAULTS = {
    "tiktok":         {"duration": 12.0, "aspect": "9:16", "fps": 30},
    "reels":          {"duration": 15.0, "aspect": "9:16", "fps": 30},
    "shorts":         {"duration": 15.0, "aspect": "9:16", "fps": 30},
    "youtube":        {"duration": 180.0, "aspect": "16:9", "fps": 24},
    "spotify_canvas": {"duration": 8.0,  "aspect": "9:16", "fps": 24},
    "instagram":      {"duration": 30.0, "aspect": "1:1",  "fps": 30},
    "twitter":        {"duration": 15.0, "aspect": "16:9", "fps": 30},
    "facebook":       {"duration": 30.0, "aspect": "16:9", "fps": 30},
}


class PlatformHeads:
    def __init__(self, gpu: HyperGPU, video_generator: VideoGenerator):
        self.gpu = gpu
        self.video_generator = video_generator

    def generate_for_target(
        self,
        target: PlatformTarget,
        audio_repr: Dict[str, np.ndarray],
        boostsheet_repr: Dict[str, np.ndarray],
    ) -> Dict:
        defaults = PLATFORM_DEFAULTS.get(target.platform, {"duration": 15.0, "aspect": "16:9", "fps": 24})
        duration = target.duration_sec or defaults["duration"]
        aspect = target.aspect_ratio or defaults["aspect"]
        fps = defaults["fps"]

        frames = self.video_generator.generate_video(
            audio_repr, boostsheet_repr, duration_sec=duration, fps=fps
        )

        return {
            "platform": target.platform,
            "goal": target.goal,
            "duration_sec": duration,
            "aspect_ratio": aspect,
            "fps": fps,
            "frame_count": frames.shape[0],
            "resolution": f"{frames.shape[2]}x{frames.shape[1]}",
            "frames": frames,
        }
