from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from ai_model.native_analysis.media import (
    InvalidMediaError,
    MediaDecodeError,
    analyze_image,
    analyze_video,
)


def _striped_image(path: Path, image_format: str) -> None:
    image = Image.new("RGB", (120, 60), (255, 0, 0))
    ImageDraw.Draw(image).rectangle((60, 0, 119, 59), fill=(255, 255, 255))
    image.save(path, format=image_format, quality=95)


@pytest.fixture
def image_files(tmp_path: Path) -> tuple[Path, Path]:
    png = tmp_path / "measured.png"
    jpeg = tmp_path / "measured.jpg"
    _striped_image(png, "PNG")
    _striped_image(jpeg, "JPEG")
    return png, jpeg


@pytest.fixture
def changing_video(tmp_path: Path) -> Path:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        pytest.skip("ffmpeg is unavailable")
    video = tmp_path / "changing.mp4"
    completed = subprocess.run(
        [
            ffmpeg,
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=160x90:d=1:r=12",
            "-f",
            "lavfi",
            "-i",
            "color=c=white:s=160x90:d=1:r=12",
            "-filter_complex",
            "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-movflags",
            "+faststart",
            str(video),
        ],
        check=False,
        capture_output=True,
        timeout=30,
    )
    if completed.returncode:
        pytest.skip(f"ffmpeg cannot create MP4 fixture: {completed.stderr!r}")
    return video


def test_png_and_jpeg_have_content_dependent_pixel_measurements(
    image_files: tuple[Path, Path],
) -> None:
    png, jpeg = image_files
    png_result = analyze_image(png)
    jpeg_result = analyze_image(jpeg)

    assert png_result["schema_version"] == 1
    assert png_result["source"] == "maxcore_native_analysis"
    assert png_result["kind"] == "image"
    assert png_result["analysis"]["dimensions"]["orientation"] == "landscape"
    assert png_result["analysis"]["file"]["format"] == "PNG"
    assert jpeg_result["analysis"]["file"]["format"] == "JPEG"

    mean_rgb = png_result["analysis"]["color"]["mean_rgb_8bit"]
    assert mean_rgb[0] == pytest.approx(255, abs=1)
    assert mean_rgb[1] == pytest.approx(127.5, abs=1)
    assert mean_rgb[2] == pytest.approx(127.5, abs=1)
    coverage = [
        color["coverage_fraction"]
        for color in png_result["analysis"]["color"]["palette"]
    ]
    assert coverage[:2] == pytest.approx([0.5, 0.5], abs=0.01)
    assert png_result["analysis"]["texture"]["edge_density_fraction"] > 0
    assert sum(
        png_result["analysis"]["color"]["luminance_histogram_16_bin_fractions"]
    ) == pytest.approx(1.0, abs=1e-5)
    assert "confidence" not in json.dumps(png_result)


def test_generated_mp4_uses_real_probe_frames_and_transition_evidence(
    changing_video: Path,
) -> None:
    result = analyze_video(changing_video)

    assert result["kind"] == "video"
    analysis = result["analysis"]
    assert analysis["duration_seconds"] == pytest.approx(2.0, abs=0.15)
    assert analysis["primary_video"]["width_px"] == 160
    assert analysis["primary_video"]["height_px"] == 90
    assert 1 < analysis["sampling"]["decoded_frame_count"] <= 8
    luminances = [
        frame["color"]["mean_luminance_0_1"] for frame in analysis["frames"]
    ]
    assert min(luminances) < 0.05
    assert max(luminances) > 0.9
    transitions = analysis["temporal_evidence"]["transitions"]
    assert max(
        item["mean_absolute_luminance_difference_0_1"] for item in transitions
    ) > 0.8
    assert analysis["temporal_evidence"]["scene_change_candidate_count"] >= 1
    json.dumps(result, allow_nan=False)


def test_invalid_local_media_errors_are_typed(tmp_path: Path) -> None:
    with pytest.raises(InvalidMediaError):
        analyze_image(tmp_path / "missing.png")
    bad = tmp_path / "not-an-image.png"
    bad.write_bytes(b"not an image")
    with pytest.raises(MediaDecodeError):
        analyze_image(bad)

    playlist = tmp_path / "false-mime.mp4"
    playlist.write_text("#EXTM3U\nfile:///etc/passwd\n")
    with pytest.raises(InvalidMediaError, match="unsupported video container"):
        analyze_video(playlist)