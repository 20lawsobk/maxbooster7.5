from __future__ import annotations
import os
import sys
import uuid
import time
import threading
import math
from dataclasses import dataclass
from typing import Optional, List, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextvars import copy_context

from .scenes import SceneConfig, render_scene, composite_scenes, cleanup_temp, _extract_last_frame_b64, _get_clip_duration
from ..adaptive_concurrency import RENDER_GATE
from ..media_contract import require_audio_stream
from .ffmpeg_util import run_ffmpeg

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "videos")


@dataclass
class CinematicRequest:
    hook: str = ""
    body: str = ""
    cta: str = ""
    platform: str = "tiktok"
    aspect_ratio: Optional[str] = None
    template: str = "cinematic_promo"
    duration: float = 10.0
    artist_name: str = ""
    quality: str = "cinematic"
    audio_path: Optional[str] = None


@dataclass
class CinematicResult:
    success: bool
    file_path: str = ""
    filename: str = ""
    duration: float = 0.0
    width: int = 0
    height: int = 0
    template_name: str = ""
    scenes_rendered: int = 0
    render_time_ms: float = 0.0
    error: str = ""




def render_cinematic_open(
    scenes: List[SceneConfig],
    width: int,
    height: int,
    total_duration: float,
    audio_path: Optional[str] = None,
    transition: str = "fade",
    transition_dur: float = 0.5,
    label: str = "",
    genre: str = "",
) -> CinematicResult:
    """
    Render a list of pre-built SceneConfig objects with no template involvement.
    All visual parameters are already embedded in the scenes.

    ``genre`` is forwarded to composite_scenes() to select the appropriate
    xfade transition type (wipeleft/dissolve/circleopen/fade).
    """
    start_time = time.time()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not scenes:
        return CinematicResult(success=False, error="No scenes provided")

    dur = float(total_duration)
    if not math.isfinite(dur) or dur <= 0 or dur > 300:
        return CinematicResult(success=False, error="Video duration must be positive and at most 300 seconds")
    fps = scenes[0].fps
    if fps <= 0 or any(scene.fps != fps for scene in scenes):
        return CinematicResult(success=False, error="Scenes must use the same positive frame rate")
    frame_count = round(dur * fps)
    if frame_count < len(scenes):
        return CinematicResult(success=False, error="Video duration too short for scene count")
    dur = frame_count / fps
    if len(scenes) > 1:
        overlap = max(1 / fps, min(float(transition_dur), 1.0, dur / (2 * len(scenes))))
        # Allocate integral frames: each overlap is consumed once by xfade.
        overlap_frames = max(1, round(overlap * fps))
        available = frame_count + overlap_frames * (len(scenes) - 1)
        weights = [max(0.0, s.duration) for s in scenes]
        if not sum(weights):
            return CinematicResult(success=False, error="Scene durations must be positive")
        extra = available - len(scenes) * (overlap_frames + 1)
        if extra < 0:
            return CinematicResult(success=False, error="Video duration too short for transitions")
        frames = [overlap_frames + 1 + int(extra * w / sum(weights)) for w in weights]
        frames[-1] += available - sum(frames)
        for scene, count in zip(scenes, frames):
            scene.duration = count / fps
        transition_dur = overlap_frames / fps
    else:
        scenes[0].duration = dur
    if audio_path:
        try:
            require_audio_stream(audio_path)
        except Exception as exc:
            return CinematicResult(success=False, error=f"Required audio invalid: {exc}")

    # ── Sequential rendering with rolling reference frames (temporal consistency)
    # Scenes are rendered in order; after each render, the last frame is extracted
    # and set as the reference_b64 for the next scene (SDEdit rolling prior).
    # Parallel rendering is preserved when no reference frame is set on the scenes
    # (i.e. when init_frame_b64 was not provided — fully optional).
    _any_reference = any(getattr(s, "reference_b64", None) for s in scenes)

    scene_paths: List[str] = []
    render_errors: List[str] = []

    if _any_reference:
        # Sequential path: rolling prior — each scene conditions on the previous
        # scene's last frame.
        results_map: Dict[int, str] = {}
        _current_ref: Optional[str] = None
        for i, scene in enumerate(scenes):
            try:
                # Propagate rolling reference (only override if scene doesn't
                # already have an explicit reference set)
                if _current_ref is not None and getattr(scene, "reference_b64", None) is None:
                    scene.reference_b64 = _current_ref
                sid = f"{uuid.uuid4().hex[:6]}_{i}"
                with RENDER_GATE.slot(timeout=30):
                    path = render_scene(scene, width, height, sid)
                if path:
                    results_map[i] = path
                    # Extract last frame for next scene
                    try:
                        _last_frame = _extract_last_frame_b64(path)
                        if _last_frame:
                            _current_ref = _last_frame
                    except Exception:
                        pass
                else:
                    print(f"[VideoRender][ERROR] Scene {i} returned no path", file=sys.stderr)
                    render_errors.append(f"Scene {i} failed")
            except Exception as exc:
                print(f"[VideoRender][ERROR] Scene {i} raised exception: {exc}", file=sys.stderr)
                render_errors.append(f"Scene {i} failed")
    else:
        # Parallel path: no reference frames → max throughput
        def _render_one(idx_scene):
            idx, scene = idx_scene
            sid = f"{uuid.uuid4().hex[:6]}_{idx}"
            # Hold a render slot to bound total simultaneous encodes.
            # The Digital GPU is independent of the host environment, so no
            # niceness penalty is applied — heavy compute (diffusion, VRC grading,
            # GEMM) runs on the GPU engine, not on host CPUs.
            with RENDER_GATE.slot(timeout=30):
                path = render_scene(scene, width, height, sid)
            return idx, path

        workers = max(1, min(RENDER_GATE.capacity, len(scenes)))
        results_map = {}
        with ThreadPoolExecutor(max_workers=workers) as executor:
            # Each joined worker inherits the job's scoped backend; otherwise
            # kernels silently execute on the default GPU and the job snapshot
            # records an unused life. The executor drains before scope exit.
            futures = {executor.submit(copy_context().run, _render_one, (i, s)): i
                       for i, s in enumerate(scenes)}
            for future in as_completed(futures):
                scene_idx = futures[future]
                try:
                    idx, path = future.result()
                    if path:
                        results_map[idx] = path
                    else:
                        print(f"[VideoRender][ERROR] Scene {idx} returned no path", file=sys.stderr)
                        render_errors.append(f"Scene {idx} failed")
                except Exception as exc:
                    print(f"[VideoRender][ERROR] Scene {scene_idx} raised exception: {exc}", file=sys.stderr)
                    render_errors.append(f"Scene {scene_idx} failed")

    for i in range(len(scenes)):
        if i in results_map:
            scene_paths.append(results_map[i])

    _t_scenes = time.time() - start_time

    if len(scene_paths) != len(scenes):
        cleanup_temp(scene_paths)
        return CinematicResult(
            success=False,
            error=f"Incomplete scene render: {'; '.join(render_errors)}",
        )

    filename = f"ai_{uuid.uuid4().hex[:12]}.mp4"
    output_path = os.path.join(OUTPUT_DIR, filename)

    if len(scene_paths) == 1:
        if audio_path:
            result = run_ffmpeg([
                "ffmpeg", "-y", "-i", scene_paths[0], "-i", audio_path,
                "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                "-video_track_timescale", str(fps * 1000),
                "-c:a", "aac", "-af", "apad", "-t", str(dur), output_path,
            ], timeout=120)
            success = result.returncode == 0
        else:
            result = run_ffmpeg([
                "ffmpeg", "-y", "-i", scene_paths[0], "-map", "0:v:0",
                "-c:v", "copy", "-video_track_timescale", str(fps * 1000),
                output_path,
            ], timeout=120)
            success = result.returncode == 0
    else:
        success = composite_scenes(
            scene_paths=scene_paths,
            output_path=output_path,
            transition=transition,
            transition_dur=transition_dur,
            audio_path=audio_path,
            genre=genre,
            target_duration=dur,
            target_fps=fps,
        )

    cleanup_temp(scene_paths)

    print(
        f"[VideoRender][Timing] scenes_total={_t_scenes:.1f}s "
        f"composite={time.time() - start_time - _t_scenes:.1f}s "
        f"n_scenes={len(scene_paths)} reference_cycling={_any_reference}",
        flush=True,
    )

    if not success:
        return CinematicResult(success=False, error="Failed to composite scenes")

    actual = _get_clip_duration(output_path)
    if abs(actual - dur) > 0.002:
        os.remove(output_path)
        return CinematicResult(success=False, error=f"Video duration mismatch: requested {dur:.3f}s, encoded {actual:.3f}s")

    if audio_path:
        try:
            require_audio_stream(output_path, minimum_duration=dur)
        except Exception as exc:
            if os.path.exists(output_path):
                os.remove(output_path)
            return CinematicResult(success=False, error=f"Required audio not delivered: {exc}")

    render_time = (time.time() - start_time) * 1000

    return CinematicResult(
        success=True,
        file_path=output_path,
        filename=filename,
        duration=actual,
        width=width,
        height=height,
        template_name=label or "ai_generated",
        scenes_rendered=len(scene_paths),
        render_time_ms=render_time,
    )
