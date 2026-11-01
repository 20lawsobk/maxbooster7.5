"""Measured two-pass finishing and post-encode acceptance, never a quality claim."""
import json
import math
import re
from pathlib import Path
from ai_model.video.ffmpeg_util import run_ffmpeg

TARGET_LUFS = -16.0
TARGET_TRUE_PEAK = -2.0  # retain headroom for lossy video encoding


def measure_loudness(path):
    result = run_ffmpeg([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-vn",
        "-af", f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TRUE_PEAK}:LRA=11:print_format=json",
        "-f", "null", "-",
    ], timeout=120)
    if result.returncode:
        raise RuntimeError("Audio loudness measurement failed: " + result.stderr[-300:])
    match = re.search(r'\{\s*"input_i".*?\}', result.stderr, re.S)
    if not match:
        raise RuntimeError("Audio measurement did not return a loudness report")
    raw = json.loads(match.group())
    values = {key: float(raw[key]) for key in (
        "input_i", "input_tp", "input_lra", "input_thresh", "target_offset")}
    if not all(math.isfinite(value) for value in values.values()):
        raise ValueError("Audio is silent, too short, or otherwise not measurable for loudness")
    return values


def verify_finished_audio(path):
    measured = measure_loudness(path)
    if abs(measured["input_i"] - TARGET_LUFS) > 1.0:
        raise ValueError("Finished audio is outside the -16 LUFS target tolerance")
    if measured["input_tp"] > -1.0:
        raise ValueError("Finished audio exceeds the -1 dBTP delivery ceiling")
    return {"integrated_lufs": measured["input_i"], "true_peak_dbtp": measured["input_tp"],
            "loudness_range_lu": measured["input_lra"], "target_lufs": TARGET_LUFS,
            "true_peak_ceiling_dbtp": -1.0, "verified": True}


def finish_audio(source, destination, *, sample_rate=44100, bit_depth=24):
    """Use measured input parameters, then independently measure the output."""
    if Path(source).resolve() == Path(destination).resolve():
        raise ValueError("Audio finishing requires a separate output file")
    if type(sample_rate) is not int or not 8000 <= sample_rate <= 96000 or bit_depth not in (16, 24):
        raise ValueError("Unsupported finishing sample rate or bit depth")
    measured = measure_loudness(source)
    normalization = (
        f"loudnorm=I={TARGET_LUFS}:TP={TARGET_TRUE_PEAK}:LRA=11:linear=true:"
        f"measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']}"
    )
    try:
        result = run_ffmpeg(["ffmpeg", "-y", "-i", str(source), "-vn", "-af", normalization,
                             "-ar", str(sample_rate), "-ac", "2", "-c:a", f"pcm_s{bit_depth}le", str(destination)],
                            timeout=120)
        if result.returncode:
            raise RuntimeError("Audio finishing failed: " + result.stderr[-300:])
        return verify_finished_audio(destination)
    except Exception:
        Path(destination).unlink(missing_ok=True)
        raise
