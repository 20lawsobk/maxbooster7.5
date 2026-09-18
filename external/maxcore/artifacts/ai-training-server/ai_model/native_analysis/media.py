"""Bounded, deterministic pixel measurements for local image and video files.

This module deliberately does not perform semantic recognition.  In particular,
it does not infer objects, people, identity, emotion, actions, or an aesthetic
quality/confidence score.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

SCHEMA_VERSION = 1
SOURCE = "maxcore_native_analysis"

MAX_IMAGE_BYTES = 64 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MAX_VIDEO_BYTES = 1024 * 1024 * 1024
MAX_VIDEO_DURATION_SECONDS = 2 * 60 * 60
MAX_VIDEO_SOURCE_PIXELS = 25_000_000
MAX_IMAGE_ANALYSIS_SIDE = 1280
MAX_VIDEO_ANALYSIS_SIDE = 720
MAX_VIDEO_FRAMES = 8
PROBE_TIMEOUT_SECONDS = 15
FRAME_TIMEOUT_SECONDS = 20
EDGE_THRESHOLD = 0.12
SCENE_CHANGE_THRESHOLD = 0.12
SUPPORTED_IMAGE_FORMATS = frozenset({"PNG", "JPEG", "WEBP"})


class MediaAnalysisError(Exception):
    """Base error for native media analysis."""


class InvalidMediaError(MediaAnalysisError):
    """The path or media metadata is invalid."""


class MediaLimitError(MediaAnalysisError):
    """The local media exceeds a declared resource limit."""


class MediaToolUnavailableError(MediaAnalysisError):
    """A required local decoding tool is unavailable."""


class MediaDecodeError(MediaAnalysisError):
    """The media could not be decoded."""


def _local_file(path: os.PathLike[str] | str, max_bytes: int) -> tuple[Path, int]:
    try:
        local = Path(path).expanduser().resolve(strict=True)
    except (OSError, RuntimeError, TypeError, ValueError) as exc:
        raise InvalidMediaError(f"local media file does not exist: {path!s}") from exc
    if not local.is_file():
        raise InvalidMediaError(f"media path is not a regular file: {local}")
    try:
        size = local.stat().st_size
    except OSError as exc:
        raise InvalidMediaError(f"cannot stat local media file: {local}") from exc
    if size <= 0:
        raise InvalidMediaError("media file is empty")
    if size > max_bytes:
        raise MediaLimitError(
            f"media file is {size} bytes; limit is {max_bytes} bytes"
        )
    return local, size


def _number(value: float, digits: int = 6) -> float:
    value = float(value)
    return round(value, digits) if math.isfinite(value) else 0.0


def _orientation(width: int, height: int) -> str:
    if width == height:
        return "square"
    return "landscape" if width > height else "portrait"


def _resize_for_analysis(image: Image.Image, max_side: int) -> Image.Image:
    image = image.convert("RGB")
    if max(image.size) > max_side:
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return image


def _region_measurements(
    luminance: np.ndarray, saturation: np.ndarray, edge_mask: np.ndarray
) -> list[dict[str, Any]]:
    height, width = luminance.shape
    regions: list[dict[str, Any]] = []
    for row in range(3):
        y0, y1 = row * height // 3, (row + 1) * height // 3
        for column in range(3):
            x0, x1 = column * width // 3, (column + 1) * width // 3
            lum = luminance[y0:y1, x0:x1]
            sat = saturation[y0:y1, x0:x1]
            edges = edge_mask[y0:y1, x0:x1]
            regions.append(
                {
                    "row": row,
                    "column": column,
                    "bounds_fraction": [
                        _number(x0 / width),
                        _number(y0 / height),
                        _number(x1 / width),
                        _number(y1 / height),
                    ],
                    "mean_luminance_0_1": _number(lum.mean()),
                    "mean_saturation_0_1": _number(sat.mean()),
                    "edge_density_fraction": _number(edges.mean()),
                }
            )
    return regions


def _pixel_measurements(image: Image.Image) -> dict[str, Any]:
    rgb_image = image.convert("RGB")
    rgb = np.asarray(rgb_image, dtype=np.float32) / 255.0
    red, green, blue = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    channel_max = rgb.max(axis=2)
    channel_min = rgb.min(axis=2)
    saturation = np.divide(
        channel_max - channel_min,
        channel_max,
        out=np.zeros_like(channel_max),
        where=channel_max > 0,
    )

    # Central-difference gradient magnitude in normalized luminance units/pixel.
    gradient_x = np.zeros_like(luminance)
    gradient_y = np.zeros_like(luminance)
    if luminance.shape[1] > 2:
        gradient_x[:, 1:-1] = (luminance[:, 2:] - luminance[:, :-2]) / 2.0
    if luminance.shape[0] > 2:
        gradient_y[1:-1, :] = (luminance[2:, :] - luminance[:-2, :]) / 2.0
    gradient = np.hypot(gradient_x, gradient_y)
    edge_mask = gradient >= EDGE_THRESHOLD

    # Discrete 4-neighbour Laplacian; variance retains units of luminance²/pixel⁴.
    laplacian = np.zeros_like(luminance)
    if min(luminance.shape) > 2:
        laplacian[1:-1, 1:-1] = (
            -4.0 * luminance[1:-1, 1:-1]
            + luminance[:-2, 1:-1]
            + luminance[2:, 1:-1]
            + luminance[1:-1, :-2]
            + luminance[1:-1, 2:]
        )

    histogram_counts, _ = np.histogram(luminance, bins=16, range=(0.0, 1.0))
    histogram = [_number(v / luminance.size) for v in histogram_counts.tolist()]

    quantized = rgb_image.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette_data = quantized.getpalette() or []
    color_counts = sorted(
        quantized.getcolors(maxcolors=256) or [], key=lambda item: (-item[0], item[1])
    )
    palette: list[dict[str, Any]] = []
    for count, index in color_counts:
        start = index * 3
        palette.append(
            {
                "rgb_8bit": palette_data[start : start + 3],
                "coverage_fraction": _number(count / (rgb_image.width * rgb_image.height)),
            }
        )

    height, width = luminance.shape
    border_width = max(1, min(height, width) // 10)
    border_mask = np.zeros((height, width), dtype=bool)
    border_mask[:border_width, :] = True
    border_mask[-border_width:, :] = True
    border_mask[:, :border_width] = True
    border_mask[:, -border_width:] = True
    center = luminance[height // 3 : 2 * height // 3, width // 3 : 2 * width // 3]

    return {
        "color": {
            "mean_rgb_8bit": [_number(v * 255.0, 3) for v in rgb.mean(axis=(0, 1))],
            "palette": palette,
            "mean_luminance_0_1": _number(luminance.mean()),
            "luminance_standard_deviation_0_1": _number(luminance.std()),
            "mean_hsv_saturation_0_1": _number(saturation.mean()),
            "luminance_histogram_16_bin_fractions": histogram,
            "luminance_histogram_bin_edges_0_1": [
                _number(v) for v in np.linspace(0.0, 1.0, 17)
            ],
        },
        "texture": {
            "edge_density_fraction": _number(edge_mask.mean()),
            "edge_threshold_luminance_gradient_per_pixel": EDGE_THRESHOLD,
            "mean_gradient_luminance_per_pixel": _number(gradient.mean()),
            "sharpness_laplacian_variance_luminance2_per_pixel4": _number(
                laplacian.var()
            ),
        },
        "composition_evidence": {
            "grid": "3x3 equal pixel regions",
            "regions": _region_measurements(luminance, saturation, edge_mask),
            "center_mean_luminance_0_1": _number(center.mean()),
            "outer_border_mean_luminance_0_1": _number(
                luminance[border_mask].mean()
            ),
            "outer_border_width_fraction_approx": _number(border_width / min(height, width)),
        },
        "_temporal_luminance": luminance,
        "_temporal_histogram": np.asarray(histogram, dtype=np.float32),
    }


def _public_measurements(measurements: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in measurements.items() if not key.startswith("_")}


def _envelope(kind: str, method: str, analysis: dict[str, Any], limitations: list[str]) -> dict[str, Any]:
    result = {
        "schema_version": SCHEMA_VERSION,
        "source": SOURCE,
        "kind": kind,
        "method": method,
        "analysis": analysis,
        "limitations": limitations,
    }
    # Enforce the route-facing JSON contract here rather than relying on a web encoder.
    json.dumps(result, allow_nan=False)
    return result


def analyze_image(path: os.PathLike[str] | str) -> dict[str, Any]:
    """Analyze one trusted local image and return the canonical result envelope."""
    local, byte_size = _local_file(path, MAX_IMAGE_BYTES)
    try:
        with Image.open(local) as opened:
            width, height = opened.size
            image_format = opened.format
            if image_format not in SUPPORTED_IMAGE_FORMATS:
                raise InvalidMediaError(
                    f"unsupported image format {image_format!r}; supported formats "
                    "are JPEG, PNG, and WebP"
                )
            has_alpha = "A" in opened.getbands() or "transparency" in opened.info
            if width <= 0 or height <= 0:
                raise InvalidMediaError("image has invalid dimensions")
            if width * height > MAX_IMAGE_PIXELS:
                raise MediaLimitError(
                    f"image has {width * height} pixels; limit is {MAX_IMAGE_PIXELS}"
                )
            opened.load()
            transposed = ImageOps.exif_transpose(opened)
            analyzed = _resize_for_analysis(transposed, MAX_IMAGE_ANALYSIS_SIDE)
    except (InvalidMediaError, MediaLimitError):
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise MediaDecodeError(f"unable to decode image: {local.name}") from exc

    measurements = _public_measurements(_pixel_measurements(analyzed))
    display_width, display_height = transposed.size
    analysis = {
        "file": {"byte_size": byte_size, "format": image_format},
        "dimensions": {
            "encoded_width_px": width,
            "encoded_height_px": height,
            "display_width_px": display_width,
            "display_height_px": display_height,
            "orientation": _orientation(display_width, display_height),
            "aspect_ratio_width_div_height": _number(display_width / display_height),
            "has_alpha_channel": has_alpha,
        },
        "measurement_resolution": {
            "width_px": analyzed.width,
            "height_px": analyzed.height,
            "max_side_limit_px": MAX_IMAGE_ANALYSIS_SIDE,
        },
        **measurements,
    }
    return _envelope(
        "image",
        "bounded_exif_corrected_rgb_pixel_statistics_v1",
        analysis,
        [
            "Measurements describe pixels only; no pretrained vision checkpoint is used.",
            "No object, face, identity, emotion, action, or semantic labels are inferred.",
            f"Pixel statistics are measured after aspect-preserving downsampling to at most {MAX_IMAGE_ANALYSIS_SIDE}px per side.",
            "Edge and sharpness measurements depend on resolution and are not aesthetic quality scores.",
            "Palette colors are an 8-color median-cut quantization and may not represent semantic regions.",
        ],
    )


def _run(args: list[str], timeout: int, tool_name: str) -> bytes:
    try:
        completed = subprocess.run(
            args,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=False,
            shell=False,
        )
    except FileNotFoundError as exc:
        raise MediaToolUnavailableError(f"{tool_name} executable is unavailable") from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaDecodeError(f"{tool_name} timed out after {timeout} seconds") from exc
    except OSError as exc:
        raise MediaDecodeError(f"failed to execute {tool_name}") from exc
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", "replace").strip()[-500:]
        raise MediaDecodeError(
            f"{tool_name} failed with exit code {completed.returncode}: {detail}"
        )
    return completed.stdout


def _detect_video_demuxer(local: Path) -> str:
    """Select a demuxer from file signatures, never extensions or supplied MIME."""
    try:
        with local.open("rb") as media_file:
            header = media_file.read(64)
    except OSError as exc:
        raise InvalidMediaError(f"cannot read local media file: {local}") from exc
    # ISO base media / QuickTime: a valid top-level box length followed by ftyp.
    if len(header) >= 12 and header[4:8] == b"ftyp":
        box_length = int.from_bytes(header[:4], "big")
        if 8 <= box_length <= MAX_VIDEO_BYTES:
            return "mov"
    # EBML header used by WebM and Matroska. The forced demuxer validates it fully.
    if header.startswith(b"\x1a\x45\xdf\xa3"):
        return "matroska"
    raise InvalidMediaError(
        "unsupported video container signature; supported containers are "
        "ISO-BMFF/MP4/QuickTime and WebM/Matroska"
    )


def _demuxer_security_options(demuxer: str) -> list[str]:
    if demuxer == "mov":
        # FFmpeg's MOV external data-reference support must remain explicitly off.
        return ["-enable_drefs", "0", "-use_absolute_path", "0"]
    return []


def _probe_video(local: Path, demuxer: str) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise MediaToolUnavailableError("ffprobe executable is unavailable")
    output = _run(
        [
            ffprobe,
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-f",
            demuxer,
            *_demuxer_security_options(demuxer),
            "-show_entries",
            "format=duration,size,format_name:stream=index,codec_type,codec_name,width,height,avg_frame_rate,duration",
            "-of",
            "json",
            "--",
            str(local),
        ],
        PROBE_TIMEOUT_SECONDS,
        "ffprobe",
    )
    try:
        probe = json.loads(output)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MediaDecodeError("ffprobe returned invalid JSON") from exc
    if not isinstance(probe, dict):
        raise MediaDecodeError("ffprobe returned an invalid metadata shape")
    return probe


def _float_metadata(value: Any, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise InvalidMediaError(f"video has no valid {name}") from exc
    if not math.isfinite(number) or number <= 0:
        raise InvalidMediaError(f"video has no valid {name}")
    return number


def _decode_video_frame(
    ffmpeg: str, local: Path, timestamp: float, demuxer: str
) -> Image.Image:
    output = _run(
        [
            ffmpeg,
            "-nostdin",
            "-v",
            "error",
            "-protocol_whitelist",
            "file,pipe",
            "-ss",
            f"{timestamp:.6f}",
            "-f",
            demuxer,
            *_demuxer_security_options(demuxer),
            "-i",
            str(local),
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-vf",
            (
                f"scale=w='min(iw,{MAX_VIDEO_ANALYSIS_SIDE})':"
                f"h='min(ih,{MAX_VIDEO_ANALYSIS_SIDE})':force_original_aspect_ratio=decrease"
            ),
            "-f",
            "image2pipe",
            "-vcodec",
            "ppm",
            "pipe:1",
        ],
        FRAME_TIMEOUT_SECONDS,
        "ffmpeg",
    )
    # 720x720 RGB PPM is below 1.6 MiB; reject abnormal decoder output.
    if len(output) > MAX_VIDEO_ANALYSIS_SIDE * MAX_VIDEO_ANALYSIS_SIDE * 4 + 1024:
        raise MediaLimitError("decoded video frame exceeded bounded frame buffer")
    try:
        from io import BytesIO

        with Image.open(BytesIO(output)) as frame:
            frame.load()
            return frame.convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise MediaDecodeError(
            f"unable to decode video frame at {timestamp:.6f} seconds"
        ) from exc


def _stream_public(stream: dict[str, Any]) -> dict[str, Any]:
    allowed = (
        "index",
        "codec_type",
        "codec_name",
        "width",
        "height",
        "avg_frame_rate",
        "duration",
    )
    return {key: stream.get(key) for key in allowed if stream.get(key) is not None}


def analyze_video(path: os.PathLike[str] | str) -> dict[str, Any]:
    """Probe and sample one trusted local video without decoding it wholesale."""
    local, byte_size = _local_file(path, MAX_VIDEO_BYTES)
    demuxer = _detect_video_demuxer(local)
    probe = _probe_video(local, demuxer)
    format_data = probe.get("format")
    streams = probe.get("streams")
    if not isinstance(format_data, dict) or not isinstance(streams, list):
        raise InvalidMediaError("video metadata is missing format or stream data")
    video_streams = [
        stream
        for stream in streams
        if isinstance(stream, dict) and stream.get("codec_type") == "video"
    ]
    if not video_streams:
        raise InvalidMediaError("media contains no video stream")
    primary = video_streams[0]
    try:
        source_width, source_height = int(primary["width"]), int(primary["height"])
    except (KeyError, TypeError, ValueError) as exc:
        raise InvalidMediaError("video stream has invalid dimensions") from exc
    if source_width <= 0 or source_height <= 0:
        raise InvalidMediaError("video stream has invalid dimensions")
    if source_width * source_height > MAX_VIDEO_SOURCE_PIXELS:
        raise MediaLimitError(
            f"video frame has {source_width * source_height} pixels; "
            f"limit is {MAX_VIDEO_SOURCE_PIXELS}"
        )
    duration = _float_metadata(
        format_data.get("duration", primary.get("duration")), "duration"
    )
    if duration > MAX_VIDEO_DURATION_SECONDS:
        raise MediaLimitError(
            f"video duration is {duration:.3f}s; limit is {MAX_VIDEO_DURATION_SECONDS}s"
        )

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise MediaToolUnavailableError("ffmpeg executable is unavailable")
    sample_count = min(MAX_VIDEO_FRAMES, max(1, math.ceil(duration * 2.0)))
    timestamps = [duration * (index + 0.5) / sample_count for index in range(sample_count)]

    frames: list[dict[str, Any]] = []
    temporal_arrays: list[np.ndarray] = []
    temporal_histograms: list[np.ndarray] = []
    for timestamp in timestamps:
        frame = _decode_video_frame(ffmpeg, local, timestamp, demuxer)
        measured = _pixel_measurements(frame)
        temporal_arrays.append(measured.pop("_temporal_luminance"))
        temporal_histograms.append(measured.pop("_temporal_histogram"))
        frames.append(
            {
                "timestamp_seconds": _number(timestamp),
                "measurement_resolution": {
                    "width_px": frame.width,
                    "height_px": frame.height,
                    "max_side_limit_px": MAX_VIDEO_ANALYSIS_SIDE,
                },
                **measured,
            }
        )

    transitions: list[dict[str, Any]] = []
    for index in range(1, len(frames)):
        previous = temporal_arrays[index - 1]
        current = temporal_arrays[index]
        if previous.shape != current.shape:
            raise MediaDecodeError("sampled video frames changed dimensions")
        mean_difference = float(np.abs(current - previous).mean())
        histogram_l1 = float(
            np.abs(temporal_histograms[index] - temporal_histograms[index - 1]).sum()
        )
        transitions.append(
            {
                "from_timestamp_seconds": frames[index - 1]["timestamp_seconds"],
                "to_timestamp_seconds": frames[index]["timestamp_seconds"],
                "mean_absolute_luminance_difference_0_1": _number(mean_difference),
                "luminance_histogram_l1_distance_0_2": _number(histogram_l1),
                "scene_change_candidate": mean_difference >= SCENE_CHANGE_THRESHOLD,
            }
        )

    analysis = {
        "file": {
            "byte_size": byte_size,
            "forced_demuxer": demuxer,
            "format_names": format_data.get("format_name"),
        },
        "duration_seconds": _number(duration),
        "streams": [_stream_public(stream) for stream in streams if isinstance(stream, dict)],
        "primary_video": {
            "width_px": source_width,
            "height_px": source_height,
            "orientation": _orientation(source_width, source_height),
            "aspect_ratio_width_div_height": _number(source_width / source_height),
        },
        "sampling": {
            "strategy": "uniform interval midpoints across probed duration",
            "requested_frame_count": sample_count,
            "decoded_frame_count": len(frames),
            "maximum_frame_count": MAX_VIDEO_FRAMES,
            "maximum_measurement_side_px": MAX_VIDEO_ANALYSIS_SIDE,
            "timestamps_seconds": [_number(value) for value in timestamps],
        },
        "frames": frames,
        "temporal_evidence": {
            "method": "consecutive sampled-frame pixel differences",
            "scene_change_candidate_threshold_mean_absolute_luminance_difference_0_1": SCENE_CHANGE_THRESHOLD,
            "transitions": transitions,
            "mean_absolute_luminance_difference_0_1": (
                _number(
                    np.mean(
                        [
                            transition[
                                "mean_absolute_luminance_difference_0_1"
                            ]
                            for transition in transitions
                        ]
                    )
                )
                if transitions
                else None
            ),
            "scene_change_candidate_count": sum(
                bool(item["scene_change_candidate"]) for item in transitions
            ),
        },
    }
    return _envelope(
        "video",
        "ffprobe_metadata_and_bounded_uniform_rgb_frame_statistics_v1",
        analysis,
        [
            "Measurements describe container metadata and sampled pixels only; no pretrained vision checkpoint is used.",
            "No object, face, identity, emotion, action, or semantic labels are inferred.",
            "Only signature-validated ISO-BMFF/MP4/QuickTime and WebM/Matroska containers are accepted; playlists and adaptive-streaming manifests are rejected.",
            "FFmpeg network protocols are not enabled, and QuickTime external data references are explicitly disabled.",
            f"At most {MAX_VIDEO_FRAMES} uniformly timestamped frames are decoded, each downsampled to at most {MAX_VIDEO_ANALYSIS_SIDE}px per side.",
            "Events between sampled timestamps can be missed; frame differences are not motion tracking or action recognition.",
            f"A scene-change candidate is only a measured sampled-frame luminance difference at or above {SCENE_CHANGE_THRESHOLD}; it is not a semantic scene label.",
            "Edge and sharpness measurements depend on sampled resolution and are not aesthetic quality scores.",
        ],
    )