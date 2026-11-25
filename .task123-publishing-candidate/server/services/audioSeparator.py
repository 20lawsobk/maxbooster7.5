#!/usr/bin/env python3
"""
MaxBooster Audio Separator
===========================
Converts a WAV beat into multiple deliverable formats using ffmpeg.

Usage:
  python3 audioSeparator.py <input_wav> <output_dir> [--stems]

Output (JSON to stdout):
  {
    "mp3":  "/path/to/output.mp3",
    "stems": {
      "drums":  "/path/to/stems/drums.wav",
      "bass":   "/path/to/stems/bass.wav",
      "melody": "/path/to/stems/melody.wav",
      "other":  "/path/to/stems/other.wav"
    }
  }

Stem Separation Strategy (ffmpeg frequency-band):
  - drums  : Transient-rich content  (highpass 60Hz + bandreject 200-800Hz to isolate perc)
  - bass   : Sub & low bass          (lowpass 200Hz)
  - melody : Mid/high tonal content  (highpass 200Hz)
  - other  : Residual spatial layer  (bandpass 800-8000Hz, side-channel emphasis)

This is fast (real-time or faster) and works well for electronic/hip-hop beats.
"""

import sys
import os
import json
import subprocess
import shlex


def run_ffmpeg(args: list[str]) -> tuple[int, str]:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error"] + args,
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stderr


def convert_to_mp3(input_wav: str, output_mp3: str) -> bool:
    code, err = run_ffmpeg([
        "-i", input_wav,
        "-codec:a", "libmp3lame",
        "-b:a", "320k",
        "-map_metadata", "-1",
        "-y", output_mp3,
    ])
    if code != 0:
        print(json.dumps({"error": f"MP3 conversion failed: {err}"}), flush=True)
        return False
    return True


def separate_stems(input_wav: str, stems_dir: str) -> dict:
    os.makedirs(stems_dir, exist_ok=True)
    stems = {}

    # ── Drums: transient-heavy content ──────────────────────────────────────
    # Highpass at 60Hz, then band-emphasize the percussive transient range
    drums_path = os.path.join(stems_dir, "drums.wav")
    code, err = run_ffmpeg([
        "-i", input_wav,
        "-af",
        (
            "highpass=f=60,"
            "equalizer=f=3000:width_type=o:w=2:g=4,"
            "equalizer=f=8000:width_type=o:w=2:g=3,"
            "equalizer=f=200:width_type=o:w=2:g=-8"
        ),
        "-y", drums_path,
    ])
    if code == 0:
        stems["drums"] = drums_path
    else:
        print(json.dumps({"warning": f"Drums stem failed: {err}"}), file=sys.stderr, flush=True)

    # ── Bass: sub & low bass ─────────────────────────────────────────────────
    bass_path = os.path.join(stems_dir, "bass.wav")
    code, err = run_ffmpeg([
        "-i", input_wav,
        "-af",
        (
            "lowpass=f=200,"
            "equalizer=f=80:width_type=o:w=2:g=3"
        ),
        "-y", bass_path,
    ])
    if code == 0:
        stems["bass"] = bass_path
    else:
        print(json.dumps({"warning": f"Bass stem failed: {err}"}), file=sys.stderr, flush=True)

    # ── Melody: mid/high tonal content ──────────────────────────────────────
    melody_path = os.path.join(stems_dir, "melody.wav")
    code, err = run_ffmpeg([
        "-i", input_wav,
        "-af",
        (
            "highpass=f=200,"
            "equalizer=f=1000:width_type=o:w=2:g=2,"
            "equalizer=f=5000:width_type=o:w=2:g=1"
        ),
        "-y", melody_path,
    ])
    if code == 0:
        stems["melody"] = melody_path
    else:
        print(json.dumps({"warning": f"Melody stem failed: {err}"}), file=sys.stderr, flush=True)

    # ── Other: atmospheric/pad content (mid-range spatial) ──────────────────
    other_path = os.path.join(stems_dir, "other.wav")
    code, err = run_ffmpeg([
        "-i", input_wav,
        "-af",
        (
            "bandpass=f=2000:width_type=h:w=4000,"
            "equalizer=f=2000:width_type=o:w=3:g=2"
        ),
        "-y", other_path,
    ])
    if code == 0:
        stems["other"] = other_path
    else:
        print(json.dumps({"warning": f"Other stem failed: {err}"}), file=sys.stderr, flush=True)

    return stems


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: audioSeparator.py <input_wav> <output_dir> [--stems]"}))
        sys.exit(1)

    input_wav = sys.argv[1]
    output_dir = sys.argv[2]
    do_stems = "--stems" in sys.argv

    if not os.path.exists(input_wav):
        print(json.dumps({"error": f"Input file not found: {input_wav}"}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    result = {"mp3": None, "stems": {}}

    # 1. Always convert to MP3
    mp3_path = os.path.join(output_dir, "output.mp3")
    if convert_to_mp3(input_wav, mp3_path):
        result["mp3"] = mp3_path
    else:
        sys.exit(1)

    # 2. Generate stems if requested
    if do_stems:
        stems_dir = os.path.join(output_dir, "stems")
        result["stems"] = separate_stems(input_wav, stems_dir)

    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
