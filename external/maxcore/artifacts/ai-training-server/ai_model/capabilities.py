"""Executable renderer capabilities, not claims about trained model quality."""
from copy import deepcopy
import math


CAPABILITIES = {
    "audio": {
        "renderer": "digital-gpu-parametric-synth",
        "trained": False, "kind": "synthesis",
        "compute": {
            "facade": "MediaDigitalGPU (extends existing DigitalGPU)",
            "substrate": "software NumPy / compiled CPU SIMD, not physical GPU",
            "dispatched": ["oscillators", "native filters", "ADSR", "noise",
                           "biquad_df2", "rms_compress", "stereo_width",
                           "convolve_reverb", "mix_buses", "normalize_stereo",
                           "tpdf_dither", "pcm16", "sidechain", "fade_stereo",
                           "stamp_stereo", "scale", "add", "subtract", "multiply",
                           "clip", "linear_envelope", "unison_parameters",
                           "decay_envelope", "piano_damp", "prepare_ir",
                           "rms_envelope", "delay", "glitch", "rbj_coefficients"],
            "remaining_host_numerical": [
                "note frequency/arrangement/velocity calculations and RNG",
            ],
            "host_support": ["WAV container encoding/decoding",
                             "buffer allocation, casting, slicing, interleaving",
                             "note/chunk scheduling and scalar control metadata"],
            "dedicated_signal_math_on_facade": True,
            "dispatch_scope": "render_audio -> render_full_track -> render_stems and WAV quantization",
            "outside_dispatch_scope": ["legacy STFT/HPSS analysis",
                                       "standalone stem normalization/MIDI export"],
            "all_math_on_facade": False,
        },
        "instruments": ["ensemble", "piano", "synth", "bass", "drums"],
        "arrangements": ["structured", "loop"],
        "duration_seconds": [0.05, 300],
        "limitations": ["Piano is additive synthesis, not a sampled acoustic piano.",
                        "No vocals, reference imitation, or arbitrary instruments."],
    },
    "image": {
        "renderer": "pil-typographic-poster-v1",
        "trained": False, "kind": "layout",
        "compute": {
            "facade": "MediaDigitalGPU",
            "dispatched": ["gradient_rgb", "grain_rgb"],
            "remaining_host_numerical": ["accent color interpolation and placement",
                                         "PIL resizing, compositing and glyph rasterization"],
            "host_support": ["PIL text/layout and native image codecs",
                             "proportional layout canvas and Lanczos thumbnail downsampling"],
            "all_math_on_facade": False,
        },
        "modes": ["poster", "supplied_background"],
        "dimensions": [32, 4096],
        "limitations": ["Prompt is layout copy, not subject generation.",
                        "Small exports are full-layout thumbnails; tiny typography may not be legible.",
                        "Supplied background is resized/composited, not reference-conditioned.",
                        "No photorealism, arbitrary visual styles, or subject synthesis."],
    },
    "video": {
        "renderer": "pil-ffmpeg-procedural",
        "trained": False, "kind": "procedural",
        "compute": {
            "facade": "MediaDigitalGPU",
            "dispatched": ["gradient_rgb (including solid fill)"],
            "remaining_host_numerical": ["FFmpeg visual filters, text animation and timing",
                                         "legacy radial/plasma/grade/grain paths outside dedicated controls"],
            "host_support": ["PIL raster packing", "FFmpeg native encode/decode/mux"],
            "all_math_on_facade": False,
        },
        "continuity": ["single_scene"],
        "backgrounds": ["solid", "gradient"],
        "duration_seconds": [0.05, 300],
        "dimensions": [32, 1920],
        "limitations": ["Animated promotional layout, not trained text-to-video.",
                        "Single-scene continuity only; no character/reference identity.",
                        "No arbitrary subject, style or camera generation."],
    },
}


def capabilities(modality=None):
    """Return detached metadata safe to serialize to clients."""
    return deepcopy(CAPABILITIES if modality is None else CAPABILITIES[modality])


def finite_number(value, name, low, high):
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a number")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number") from None
    if not math.isfinite(number) or not low <= number <= high:
        raise ValueError(f"{name} must be between {low} and {high}")
    return number


def dimensions(width, height, maximum=4096, even=False):
    values = []
    for name, value in (("width", width), ("height", height)):
        number = finite_number(value, name, 32, maximum)
        if not number.is_integer() or (even and int(number) % 2):
            raise ValueError(f"{name} must be an {'even ' if even else ''}integer")
        values.append(int(number))
    return tuple(values)


def reject_semantic_controls(*, subject=None, reference=None, style=None):
    for name, value in (("subject", subject), ("reference", reference), ("style", style)):
        if value is not None and value != "":
            raise ValueError(f"Unsupported {name}: this renderer is procedural, not a trained subject/reference/style generator")