"""Versioned, deterministic asset conditioning performed only by MaxCore."""
import base64
import math
import subprocess
from pathlib import Path

GRADES = {"none", "warm", "cool", "cinematic", "neon"}
TRANSITIONS = {"fade", "fadeblack", "fadewhite", "dissolve", "wipeleft",
               "wiperight", "slideleft", "slideright", "circleopen", "circleclose"}


def validate_manifest(manifest):
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise ValueError("Unsupported media manifest version")
    if manifest.get("color_grade") not in GRADES:
        raise ValueError("Unsupported media manifest color grade")
    if manifest.get("transition") not in TRANSITIONS:
        raise ValueError("Unsupported media manifest transition")
    if not isinstance(manifest.get("beat_sync"), bool):
        raise ValueError("beat_sync must be boolean")
    for field in ("voice_b64", "logo_b64"):
        if manifest.get(field):
            decode_asset(manifest[field])


def decode_asset(value):
    if not isinstance(value, str) or len(value) > 28 * 1024 * 1024:
        raise ValueError("Media asset exceeds 20 MiB")
    data = base64.b64decode(value, validate=True)
    if not data or len(data) > 20 * 1024 * 1024:
        raise ValueError("Empty or oversized media asset")
    return data


def audio_cut_times(audio_path, count, duration):
    """Find measured onset peaks nearest even cuts; never claim inferred BPM."""
    import numpy as np
    if not audio_path:
        raise ValueError("Beat synchronization requires an audio asset")
    decoded = subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(audio_path), "-t", str(duration),
        "-f", "f32le", "-ac", "1", "-ar", "8000", "pipe:1",
    ], capture_output=True, check=True, timeout=30)
    samples = np.frombuffer(decoded.stdout, dtype="<f4")
    block = 160  # measured energy every 20ms
    samples = samples[:len(samples) // block * block]
    if len(samples) < block * 3:
        raise ValueError("Audio is too short for beat synchronization")
    energy = np.sqrt(np.mean(samples.reshape(-1, block) ** 2, axis=1))
    onset = np.maximum(0, np.diff(energy, prepend=energy[0]))
    peaks = np.where((onset[1:-1] > onset[:-2]) &
                     (onset[1:-1] >= onset[2:]) &
                     (onset[1:-1] > max(float(onset.max()) * .15, 1e-6)))[0] + 1
    times = peaks * .02
    cuts = [0.0]
    for i in range(1, count):
        target = duration * i / count
        candidates = times[(times > cuts[-1] + .5) &
                           (times < duration - (count - i) * .5)]
        if not len(candidates):
            raise ValueError("Audio has insufficient measurable onsets for requested image cuts")
        chosen = float(candidates[np.argmin(np.abs(candidates - target))])
        if abs(chosen - target) > duration / count * .5:
            raise ValueError("No measured onset near a requested image boundary")
        cuts.append(chosen)
    return cuts + [float(duration)]


def apply_manifest(manifest, scenes, audio_path, duration, out_dir, job_id):
    """Resolve all requested controls and return audio plus an actual receipt."""
    from ..media_contract import require_audio_stream
    from ..audio.voiceover import mix_voiceover_over_music
    validate_manifest(manifest)
    if not math.isfinite(duration) or duration <= 0 or not scenes:
        raise ValueError("Invalid media duration or empty scene plan")
    cuts = (audio_cut_times(audio_path, len(scenes), duration)
            if manifest["beat_sync"] else
            [duration * i / len(scenes) for i in range(len(scenes) + 1)])
    # xfade overlap must not shorten the requested duration or move cut times.
    overlap = .25
    for i, scene in enumerate(scenes):
        scene.duration = cuts[i + 1] - cuts[i] + (overlap if i < len(scenes) - 1 else 0)
        scene.color_grade = "" if manifest["color_grade"] == "none" else manifest["color_grade"]
        scene.logo_b64 = manifest.get("logo_b64")
    if manifest.get("voice_b64"):
        voice = Path(out_dir) / f"manifest_voice_{job_id}.audio"
        voice.write_bytes(decode_asset(manifest["voice_b64"]))
        if require_audio_stream(voice) > duration:
            raise ValueError("Voice asset exceeds video duration")
        mixed = Path(out_dir) / f"manifest_mix_{job_id}.wav"
        if audio_path:
            if not mix_voiceover_over_music(str(voice), audio_path, str(mixed), duration):
                raise RuntimeError("Voice/music conditioning failed")
        else:
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-i", str(voice),
                "-af", "apad", "-t", str(duration), str(mixed),
            ], check=True, capture_output=True, timeout=60)
        require_audio_stream(mixed, minimum_duration=duration)
        audio_path = str(mixed)
    return audio_path, {
        "version": 1, "scene_count": len(scenes), "cut_times": cuts,
        "beat_sync": manifest["beat_sync"], "color_grade": manifest["color_grade"],
        "transition": manifest["transition"], "transition_duration": overlap,
        "voice_asset": bool(manifest.get("voice_b64")),
        "logo_asset": bool(manifest.get("logo_b64")),
    }