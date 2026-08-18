/**
 * Plugin enrichment layer
 * -----------------------
 * Industry-standard parameter sets + genre-specific factory presets,
 * applied at runtime over the existing plugin catalog
 * (server/services/plugins/{definitions,mbCatalog}.ts) without editing
 * the catalog files plugin-by-plugin.
 *
 * Design:
 *   - Reference parameters are keyed by plugin TYPE
 *     (parametric-eq, vca-compressor, plate-reverb, etc.) — every
 *     parametric EQ shares the same control surface, so doing this
 *     per-TYPE is correct and avoids ~130 hand edits.
 *   - We only ADD missing parameters (matched by id).  Existing
 *     parameters keep their current ranges / defaults so saved user
 *     sessions never lose values.
 *   - Genre presets are factory presets seeded into the plugin_presets
 *     table.  The schema doesn't change.  Users can save their own
 *     presets alongside.
 *
 * Naming policy: parameter NAMES, RANGES and UNITS are the
 * industry-standard functional surface for each effect class (the same
 * controls every parametric EQ, VCA compressor, plate reverb, etc.
 * exposes).  No trademarked names, signature presets, or vendor-
 * specific DSP defaults are copied.
 */

import type {
  PluginDefinition,
  PluginParameter,
  EffectType,
  InstrumentType,
} from "./definitions.js";
import { GENRE_IDS, type Genre } from "./genres.js";

// ---------------------------------------------------------------------------
// Reference parameter sets per plugin TYPE
// ---------------------------------------------------------------------------
// Each entry is a list of parameters that EVERY plugin of this type
// should expose, regardless of its catalog vintage.  enrichPlugin() will
// only insert entries whose `id` is not already on the plugin.

type ParamFactory = () => PluginParameter[];

// Helper builders to keep the data dense.
const f = (
  id: string,
  name: string,
  defaultValue: number,
  minValue: number,
  maxValue: number,
  unit?: string,
  step?: number,
): PluginParameter => ({
  id,
  name,
  type: "float",
  defaultValue,
  minValue,
  maxValue,
  unit,
  step,
  automatable: true,
});

const i = (
  id: string,
  name: string,
  defaultValue: number,
  minValue: number,
  maxValue: number,
  unit?: string,
): PluginParameter => ({
  id,
  name,
  type: "int",
  defaultValue,
  minValue,
  maxValue,
  unit,
  automatable: false,
});

const b = (
  id: string,
  name: string,
  defaultValue: boolean,
): PluginParameter => ({
  id,
  name,
  type: "bool",
  defaultValue,
  automatable: false,
});

const c = (
  id: string,
  name: string,
  defaultValue: string,
  choices: string[],
): PluginParameter => ({
  id,
  name,
  type: "choice",
  defaultValue,
  choices,
  automatable: false,
});

// Parametric EQ band (filter-type, freq, gain, Q).  Industry standard
// is 8 fully-configurable bands plus high-pass / low-pass; we expose 8.
const eqBands = (count: number): PluginParameter[] => {
  const out: PluginParameter[] = [];
  for (let n = 1; n <= count; n++) {
    out.push(b(`band${n}On`, `Band ${n} On`, n <= 4));
    out.push(
      c(
        `band${n}Type`,
        `Band ${n} Type`,
        n === 1 ? "high-pass" : n === count ? "low-pass" : "bell",
        [
          "high-pass",
          "low-shelf",
          "bell",
          "notch",
          "high-shelf",
          "low-pass",
          "band-pass",
          "tilt",
        ],
      ),
    );
    out.push(
      f(
        `band${n}Freq`,
        `Band ${n} Freq`,
        [80, 250, 800, 2500, 5000, 8000, 12000, 16000][n - 1] || 1000,
        20,
        22000,
        "Hz",
      ),
    );
    out.push(f(`band${n}Gain`, `Band ${n} Gain`, 0, -24, 24, "dB", 0.1));
    out.push(f(`band${n}Q`, `Band ${n} Q`, 0.7, 0.1, 24, "", 0.01));
  }
  return out;
};

// Multiband compressor band (xover, threshold, ratio, attack, release, makeup).
const buildMultibandParams = (count: number, xovers: number[]): PluginParameter[] => {
  const out: PluginParameter[] = [];
  for (let n = 1; n <= count; n++) {
    if (n < count)
      out.push(
        f(
          `xover${n}`,
          `Crossover ${n}`,
          xovers[n - 1] || 1000,
          20,
          20000,
          "Hz",
        ),
      );
    out.push(b(`band${n}On`, `Band ${n} On`, true));
    out.push(b(`band${n}Solo`, `Band ${n} Solo`, false));
    out.push(b(`band${n}Bypass`, `Band ${n} Bypass`, false));
    out.push(f(`band${n}Threshold`, `Band ${n} Threshold`, -18, -60, 0, "dB"));
    out.push(f(`band${n}Ratio`, `Band ${n} Ratio`, 2, 1, 20));
    out.push(f(`band${n}Attack`, `Band ${n} Attack`, 10, 0.1, 200, "ms"));
    out.push(f(`band${n}Release`, `Band ${n} Release`, 100, 1, 2000, "ms"));
    out.push(f(`band${n}Knee`, `Band ${n} Knee`, 6, 0, 24, "dB"));
    out.push(f(`band${n}Makeup`, `Band ${n} Makeup`, 0, -12, 24, "dB"));
  }
  return out;
};

const REFERENCE: Partial<
  Record<EffectType | InstrumentType | string, ParamFactory>
> = {
  // ---------------- EQs ----------------
  eq: () => [
    ...eqBands(8),
    f("inputGain", "Input Gain", 0, -24, 24, "dB"),
    f("outputGain", "Output Gain", 0, -24, 24, "dB"),
    c("processing", "Processing", "zero-latency", [
      "zero-latency",
      "natural-phase",
      "linear-phase",
    ]),
    c("channel", "Channel Mode", "stereo", [
      "stereo",
      "mid-side",
      "left-right",
    ]),
    b("analyzer", "Spectrum Analyzer", true),
    b("autoGain", "Auto Gain", false),
  ],
  mastering: () => [
    ...eqBands(8),
    f("inputGain", "Input Gain", 0, -24, 24, "dB"),
    f("outputGain", "Output Gain", 0, -24, 24, "dB"),
    c("processing", "Processing", "linear-phase", [
      "zero-latency",
      "natural-phase",
      "linear-phase",
    ]),
    c("channel", "Channel Mode", "mid-side", [
      "stereo",
      "mid-side",
      "left-right",
    ]),
  ],

  // ---------------- Compressors ----------------
  compressor: () => [
    f("threshold", "Threshold", -18, -60, 0, "dB"),
    f("ratio", "Ratio", 4, 1, 20),
    f("attack", "Attack", 10, 0.01, 200, "ms"),
    f("release", "Release", 100, 1, 2000, "ms"),
    f("knee", "Knee", 6, 0, 30, "dB"),
    f("makeup", "Makeup Gain", 0, -12, 24, "dB"),
    f("inputGain", "Input Gain", 0, -24, 24, "dB"),
    f("mix", "Mix (Parallel)", 100, 0, 100, "%"),
    f("lookahead", "Lookahead", 0, 0, 30, "ms"),
    c("detection", "Detection", "peak", ["peak", "rms", "auto"]),
    c("character", "Character", "clean", [
      "clean",
      "vca",
      "fet",
      "opto",
      "tube",
      "vintage",
    ]),
    b("autoRelease", "Auto Release", false),
    b("autoGain", "Auto Makeup", false),
    b("scExternal", "External Sidechain", false),
    f("scHpf", "SC High-Pass", 0, 0, 500, "Hz"),
    f("scLpf", "SC Low-Pass", 22000, 200, 22000, "Hz"),
  ],
  // Limiters
  limiter: () => [
    f("threshold", "Threshold", -1, -30, 0, "dB"),
    f("ceiling", "Output Ceiling", -0.1, -3, 0, "dB"),
    f("release", "Release", 50, 1, 1000, "ms"),
    f("lookahead", "Lookahead", 5, 0, 30, "ms"),
    c("character", "Character", "transparent", [
      "transparent",
      "modern",
      "aggressive",
      "vintage",
      "allround",
    ]),
    b("truePeak", "True Peak", true),
    b("isr", "Inter-Sample Detection", true),
    b("dithering", "Dither", false),
    c("ditherType", "Dither Type", "tpdf", [
      "tpdf",
      "rectangular",
      "noise-shaped",
    ]),
    i("bitDepth", "Output Bit Depth", 24, 16, 32, "bit"),
    f("stereoLink", "Stereo Link", 100, 0, 100, "%"),
  ],
  maximizer: () => [
    f("threshold", "Threshold", -6, -30, 0, "dB"),
    f("ceiling", "Output Ceiling", -0.1, -3, 0, "dB"),
    f("release", "Release", 50, 1, 1000, "ms"),
    f("character", "Character", 0, 0, 100, "%"),
    c("algorithm", "Algorithm", "IRC-III", [
      "IRC-I",
      "IRC-II",
      "IRC-III",
      "IRC-IV",
      "IRC-LL",
    ]),
    b("truePeak", "True Peak", true),
    f("lookahead", "Lookahead", 5, 0, 30, "ms"),
  ],

  // Gate / Expander
  gate: () => [
    f("threshold", "Threshold", -40, -90, 0, "dB"),
    f("range", "Range", -60, -90, 0, "dB"),
    f("attack", "Attack", 1, 0.01, 100, "ms"),
    f("hold", "Hold", 10, 0, 500, "ms"),
    f("release", "Release", 100, 1, 2000, "ms"),
    f("hysteresis", "Hysteresis", 6, 0, 24, "dB"),
    f("scHpf", "SC High-Pass", 0, 0, 2000, "Hz"),
    f("scLpf", "SC Low-Pass", 22000, 200, 22000, "Hz"),
    b("scListen", "SC Listen", false),
    b("lookahead", "Lookahead", false),
  ],
  expander: () => [
    f("threshold", "Threshold", -30, -90, 0, "dB"),
    f("ratio", "Ratio", 2, 1, 20),
    f("attack", "Attack", 2, 0.01, 100, "ms"),
    f("release", "Release", 100, 1, 2000, "ms"),
    f("knee", "Knee", 3, 0, 24, "dB"),
    f("range", "Range", -40, -90, 0, "dB"),
  ],

  // De-esser / Dynamic EQ
  "de-esser": () => [
    f("threshold", "Threshold", -24, -60, 0, "dB"),
    f("frequency", "Frequency", 6500, 1000, 16000, "Hz"),
    f("range", "Range", -12, -30, 0, "dB"),
    f("q", "Q / Width", 1.5, 0.1, 10),
    c("mode", "Mode", "split", ["wide-band", "split", "mid-side"]),
    b("listen", "Listen", false),
    f("attack", "Attack", 1, 0.01, 50, "ms"),
    f("release", "Release", 30, 1, 500, "ms"),
    c("character", "Character", "modern", [
      "modern",
      "vintage",
      "allround",
      "female",
      "male",
    ]),
  ],

  // Transient shaper / leveler
  "transient-shaper": () => [
    f("attack", "Attack", 0, -100, 100, "%"),
    f("sustain", "Sustain", 0, -100, 100, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    c("mode", "Mode", "classic", ["classic", "precise", "smooth", "fast"]),
    c("detection", "Detection", "broadband", [
      "broadband",
      "low",
      "mid",
      "high",
    ]),
    b("softClip", "Soft Clip", true),
    f("attackDuration", "Attack Duration", 20, 1, 200, "ms"),
    f("sustainDuration", "Sustain Duration", 200, 10, 1000, "ms"),
  ],
  leveler: () => [
    f("target", "Target", -14, -30, 0, "LUFS"),
    f("speed", "Speed", 50, 0, 100, "%"),
    f("range", "Range", 12, 0, 30, "dB"),
    f("outputGain", "Output Gain", 0, -24, 24, "dB"),
    c("mode", "Mode", "auto", ["auto", "vocal", "instrument", "bus"]),
  ],

  // ---------------- Reverbs ----------------
  reverb: () => [
    f("predelay", "Pre-Delay", 20, 0, 500, "ms"),
    f("size", "Size", 50, 0, 100, "%"),
    f("decay", "Decay Time", 2.0, 0.1, 30, "s"),
    f("density", "Density", 70, 0, 100, "%"),
    f("diffusion", "Diffusion", 70, 0, 100, "%"),
    f("modRate", "Modulation Rate", 1.0, 0.1, 10, "Hz"),
    f("modDepth", "Modulation Depth", 20, 0, 100, "%"),
    f("lowDamp", "Low Damping", 50, 0, 100, "%"),
    f("highDamp", "High Damping", 50, 0, 100, "%"),
    f("lowCut", "Low Cut", 80, 20, 1000, "Hz"),
    f("highCut", "High Cut", 12000, 1000, 22000, "Hz"),
    f("earlyLate", "Early/Late Mix", 50, 0, 100, "%"),
    f("width", "Stereo Width", 100, 0, 200, "%"),
    f("mix", "Wet/Dry Mix", 25, 0, 100, "%"),
    c("algorithm", "Algorithm", "hall", [
      "room",
      "hall",
      "plate",
      "spring",
      "chamber",
      "shimmer",
      "ambient",
      "reverse",
    ]),
  ],
  plate: () => [
    f("predelay", "Pre-Delay", 10, 0, 500, "ms"),
    f("decay", "Decay Time", 1.8, 0.1, 10, "s"),
    f("size", "Plate Size", 60, 0, 100, "%"),
    f("damping", "Damping", 50, 0, 100, "%"),
    f("lowCut", "Low Cut", 100, 20, 1000, "Hz"),
    f("highCut", "High Cut", 10000, 1000, 22000, "Hz"),
    f("modRate", "Modulation Rate", 1.4, 0.1, 10, "Hz"),
    f("modDepth", "Modulation Depth", 10, 0, 100, "%"),
    f("width", "Stereo Width", 100, 0, 200, "%"),
    f("mix", "Mix", 25, 0, 100, "%"),
  ],
  hall: () => [
    f("predelay", "Pre-Delay", 40, 0, 500, "ms"),
    f("decay", "Decay Time", 2.8, 0.1, 30, "s"),
    f("size", "Hall Size", 80, 0, 100, "%"),
    f("diffusion", "Diffusion", 80, 0, 100, "%"),
    f("lowDamp", "Low Damping", 30, 0, 100, "%"),
    f("highDamp", "High Damping", 60, 0, 100, "%"),
    f("lowCut", "Low Cut", 80, 20, 1000, "Hz"),
    f("highCut", "High Cut", 11000, 1000, 22000, "Hz"),
    f("earlyLate", "Early/Late Mix", 50, 0, 100, "%"),
    f("width", "Stereo Width", 100, 0, 200, "%"),
    f("mix", "Mix", 25, 0, 100, "%"),
  ],
  spring: () => [
    f("decay", "Decay Time", 1.5, 0.1, 5, "s"),
    f("tension", "Tension", 50, 0, 100, "%"),
    i("springs", "Springs", 3, 1, 6),
    f("boing", "Boing", 30, 0, 100, "%"),
    f("tone", "Tone", 50, 0, 100, "%"),
    f("lowCut", "Low Cut", 150, 20, 1000, "Hz"),
    f("highCut", "High Cut", 6000, 1000, 22000, "Hz"),
    f("mix", "Mix", 30, 0, 100, "%"),
  ],
  shimmer: () => [
    f("predelay", "Pre-Delay", 30, 0, 500, "ms"),
    f("decay", "Decay Time", 4.0, 0.5, 30, "s"),
    f("size", "Size", 80, 0, 100, "%"),
    f("shimmer", "Shimmer Amount", 50, 0, 100, "%"),
    i("pitch1", "Voice 1 Pitch", 12, -24, 24, "st"),
    i("pitch2", "Voice 2 Pitch", 19, -24, 24, "st"),
    f("feedback", "Pitch Feedback", 40, 0, 100, "%"),
    f("lowCut", "Low Cut", 200, 20, 1000, "Hz"),
    f("highCut", "High Cut", 8000, 1000, 22000, "Hz"),
    f("mix", "Mix", 30, 0, 100, "%"),
  ],
  ambient: () => [
    f("predelay", "Pre-Delay", 0, 0, 200, "ms"),
    f("size", "Room Size", 40, 0, 100, "%"),
    f("decay", "Decay Time", 0.8, 0.05, 5, "s"),
    f("density", "Density", 80, 0, 100, "%"),
    f("width", "Stereo Width", 120, 0, 200, "%"),
    f("lowCut", "Low Cut", 200, 20, 1000, "Hz"),
    f("highCut", "High Cut", 14000, 1000, 22000, "Hz"),
    f("mix", "Mix", 35, 0, 100, "%"),
  ],
  chamber: () => [
    f("predelay", "Pre-Delay", 15, 0, 500, "ms"),
    f("decay", "Decay Time", 1.4, 0.1, 10, "s"),
    f("size", "Chamber Size", 60, 0, 100, "%"),
    f("diffusion", "Diffusion", 75, 0, 100, "%"),
    f("lowCut", "Low Cut", 100, 20, 1000, "Hz"),
    f("highCut", "High Cut", 10000, 1000, 22000, "Hz"),
    f("mix", "Mix", 25, 0, 100, "%"),
  ],

  // ---------------- Delays ----------------
  delay: () => [
    f("timeL", "Left Time", 350, 1, 5000, "ms"),
    f("timeR", "Right Time", 525, 1, 5000, "ms"),
    b("syncL", "Left Sync", true),
    b("syncR", "Right Sync", true),
    c("divisionL", "Left Division", "1/8", [
      "1/64",
      "1/32",
      "1/16T",
      "1/16",
      "1/16D",
      "1/8T",
      "1/8",
      "1/8D",
      "1/4T",
      "1/4",
      "1/4D",
      "1/2",
      "1",
    ]),
    c("divisionR", "Right Division", "1/4", [
      "1/64",
      "1/32",
      "1/16T",
      "1/16",
      "1/16D",
      "1/8T",
      "1/8",
      "1/8D",
      "1/4T",
      "1/4",
      "1/4D",
      "1/2",
      "1",
    ]),
    f("feedback", "Feedback", 35, 0, 110, "%"),
    f("crossFeedback", "Cross Feedback", 0, 0, 100, "%"),
    c("mode", "Mode", "digital", [
      "digital",
      "analog",
      "tape",
      "lo-fi",
      "bbd",
      "reverse",
      "pitch",
    ]),
    f("drive", "Drive", 0, 0, 100, "%"),
    f("wow", "Wow", 0, 0, 100, "%"),
    f("flutter", "Flutter", 0, 0, 100, "%"),
    f("lowCut", "Low Cut", 100, 20, 1000, "Hz"),
    f("highCut", "High Cut", 8000, 1000, 22000, "Hz"),
    f("modRate", "Modulation Rate", 0.5, 0.01, 10, "Hz"),
    f("modDepth", "Modulation Depth", 10, 0, 100, "%"),
    f("ducking", "Ducking", 0, 0, 100, "%"),
    f("width", "Stereo Width", 100, 0, 200, "%"),
    f("mix", "Mix", 25, 0, 100, "%"),
  ],

  // ---------------- Modulation ----------------
  chorus: () => [
    f("rate", "Rate", 0.5, 0.01, 20, "Hz"),
    f("depth", "Depth", 30, 0, 100, "%"),
    f("delay", "Delay", 15, 1, 50, "ms"),
    f("feedback", "Feedback", 0, -100, 100, "%"),
    i("voices", "Voices", 2, 1, 8),
    f("spread", "Stereo Spread", 100, 0, 200, "%"),
    f("lowCut", "Low Cut", 100, 20, 1000, "Hz"),
    f("highCut", "High Cut", 8000, 1000, 22000, "Hz"),
    c("mode", "Mode", "classic", [
      "classic",
      "vintage",
      "ensemble",
      "dimension",
      "tri-chorus",
    ]),
    f("mix", "Mix", 50, 0, 100, "%"),
  ],
  phaser: () => [
    f("rate", "Rate", 0.5, 0.01, 20, "Hz"),
    f("depth", "Depth", 60, 0, 100, "%"),
    f("feedback", "Feedback", 50, 0, 100, "%"),
    i("stages", "Stages", 4, 2, 12),
    f("center", "Center Freq", 1000, 100, 10000, "Hz"),
    f("spread", "Stereo Spread", 100, 0, 200, "%"),
    c("mode", "Mode", "classic", ["classic", "vintage", "modern"]),
    f("mix", "Mix", 50, 0, 100, "%"),
  ],
  flanger: () => [
    f("rate", "Rate", 0.3, 0.01, 20, "Hz"),
    f("depth", "Depth", 50, 0, 100, "%"),
    f("delay", "Delay", 3, 0.1, 20, "ms"),
    f("feedback", "Feedback", 60, -100, 100, "%"),
    f("spread", "Stereo Spread", 100, 0, 200, "%"),
    c("mode", "Mode", "classic", ["classic", "thru-zero", "tape"]),
    f("mix", "Mix", 50, 0, 100, "%"),
  ],
  tremolo: () => [
    f("rate", "Rate", 4, 0.1, 20, "Hz"),
    f("depth", "Depth", 50, 0, 100, "%"),
    c("shape", "LFO Shape", "sine", [
      "sine",
      "triangle",
      "square",
      "saw",
      "ramp",
    ]),
    f("phase", "Stereo Phase", 0, 0, 180, "°"),
    b("sync", "Tempo Sync", false),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  "auto-pan": () => [
    f("rate", "Rate", 1, 0.01, 20, "Hz"),
    f("depth", "Depth", 100, 0, 100, "%"),
    c("shape", "LFO Shape", "sine", [
      "sine",
      "triangle",
      "square",
      "saw",
      "random",
    ]),
    f("phase", "Phase", 0, 0, 360, "°"),
    b("sync", "Tempo Sync", true),
  ],
  rotary: () => [
    c("speed", "Speed", "slow", ["stop", "slow", "fast"]),
    f("slowRate", "Slow Rate", 0.8, 0.1, 5, "Hz"),
    f("fastRate", "Fast Rate", 6.5, 1, 15, "Hz"),
    f("accel", "Acceleration", 50, 0, 100, "%"),
    f("decel", "Deceleration", 50, 0, 100, "%"),
    f("drive", "Tube Drive", 30, 0, 100, "%"),
    f("balance", "Horn/Drum Balance", 50, 0, 100, "%"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  ensemble: () => [
    f("rate", "Rate", 0.5, 0.01, 10, "Hz"),
    f("depth", "Depth", 50, 0, 100, "%"),
    i("voices", "Voices", 3, 2, 8),
    f("spread", "Stereo Spread", 100, 0, 200, "%"),
    f("shimmer", "Shimmer", 30, 0, 100, "%"),
    f("mix", "Mix", 50, 0, 100, "%"),
  ],
  vibrato: () => [
    f("rate", "Rate", 5, 0.1, 20, "Hz"),
    f("depth", "Depth", 30, 0, 100, "cents"),
    c("shape", "Shape", "sine", ["sine", "triangle"]),
  ],
  "ring-mod": () => [
    f("frequency", "Carrier Freq", 440, 1, 8000, "Hz"),
    f("fine", "Fine Tune", 0, -100, 100, "cents"),
    c("shape", "Carrier Shape", "sine", ["sine", "square", "triangle", "saw"]),
    f("mix", "Mix", 50, 0, 100, "%"),
  ],

  // ---------------- Distortion family ----------------
  distortion: () => [
    f("drive", "Drive", 30, 0, 100, "%"),
    f("tone", "Tone", 50, 0, 100, "%"),
    f("bias", "Bias", 0, -50, 50, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    f("lowCut", "Low Cut", 80, 20, 1000, "Hz"),
    f("highCut", "High Cut", 8000, 1000, 22000, "Hz"),
    c("algorithm", "Algorithm", "tube", [
      "tube",
      "tape",
      "transistor",
      "fuzz",
      "overdrive",
      "fold",
      "rectifier",
      "bit",
    ]),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  tube: () => [
    f("drive", "Drive", 30, 0, 100, "%"),
    f("bias", "Bias", 0, -50, 50, "%"),
    f("tone", "Tone", 50, 0, 100, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    c("tubeType", "Tube Type", "12AX7", [
      "12AX7",
      "EL34",
      "EL84",
      "6L6",
      "KT88",
    ]),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  tape: () => [
    f("drive", "Tape Drive", 30, 0, 100, "%"),
    f("bias", "Bias", 50, 0, 100, "%"),
    f("wow", "Wow", 10, 0, 100, "%"),
    f("flutter", "Flutter", 10, 0, 100, "%"),
    f("hiss", "Hiss", 0, 0, 100, "%"),
    f("crosstalk", "Crosstalk", 20, 0, 100, "%"),
    c("speed", "Tape Speed", "15ips", ["3.75ips", "7.5ips", "15ips", "30ips"]),
    c("formula", "Tape Formula", "modern", ["vintage", "modern", "lo-fi"]),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  overdrive: () => [
    f("drive", "Drive", 40, 0, 100, "%"),
    f("tone", "Tone", 50, 0, 100, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  fuzz: () => [
    f("fuzz", "Fuzz", 60, 0, 100, "%"),
    f("tone", "Tone", 50, 0, 100, "%"),
    f("bias", "Bias", 0, -50, 50, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  transistor: () => [
    f("drive", "Drive", 40, 0, 100, "%"),
    f("tone", "Tone", 50, 0, 100, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  waveshape: () => [
    f("amount", "Amount", 50, 0, 100, "%"),
    c("shape", "Shape", "tanh", [
      "tanh",
      "sin",
      "fold",
      "bit",
      "sigmoid",
      "asymmetric",
    ]),
    f("asym", "Asymmetry", 0, -100, 100, "%"),
    f("output", "Output", 0, -24, 24, "dB"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],

  // ---------------- Mid/Side, Stereo, Utility ----------------
  stereo: () => [
    f("width", "Stereo Width", 100, 0, 200, "%"),
    f("balance", "Balance", 0, -100, 100, "%"),
    f("midGain", "Mid Gain", 0, -24, 24, "dB"),
    f("sideGain", "Side Gain", 0, -24, 24, "dB"),
    f("lowMonoFreq", "Mono-Below", 120, 20, 500, "Hz"),
    b("monoMaker", "Mono Below", true),
    c("mode", "Mode", "mid-side", ["stereo", "mid-side", "left-right"]),
  ],
  filter: () => [
    f("cutoff", "Cutoff", 1000, 20, 22000, "Hz"),
    f("resonance", "Resonance", 0.5, 0, 1),
    c("mode", "Mode", "low-pass", [
      "low-pass",
      "high-pass",
      "band-pass",
      "notch",
      "all-pass",
    ]),
    i("slope", "Slope", 24, 6, 96, "dB/oct"),
    f("drive", "Drive", 0, 0, 100, "%"),
    f("lfoRate", "LFO Rate", 1, 0.01, 20, "Hz"),
    f("lfoDepth", "LFO Depth", 0, 0, 100, "%"),
    f("envFollow", "Env Follow", 0, 0, 100, "%"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  notch: () => [
    f("frequency", "Frequency", 1000, 20, 22000, "Hz"),
    f("q", "Q", 12, 0.1, 100),
    f("depth", "Depth", -48, -96, 0, "dB"),
    b("autoDetect", "Auto Detect Hum", false),
  ],

  // ---------------- Mixing/utility (gain/pan/etc) ----------------
  mixing: () => [
    f("inputGain", "Input Gain", 0, -24, 24, "dB"),
    f("outputGain", "Output Gain", 0, -24, 24, "dB"),
    f("drive", "Drive", 0, 0, 100, "%"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  utility: () => [
    f("gain", "Gain", 0, -24, 24, "dB"),
    f("pan", "Pan", 0, -100, 100, "%"),
    f("width", "Width", 100, 0, 200, "%"),
    b("polarity", "Polarity Invert", false),
    b("mono", "Sum to Mono", false),
    b("swap", "Swap L/R", false),
  ],

  // ---------------- Vocal processors ----------------
  vocal: () => [
    f("formant", "Formant", 0, -12, 12, "st"),
    f("pitch", "Pitch", 0, -24, 24, "st"),
    f("presence", "Presence", 50, 0, 100, "%"),
    f("warmth", "Warmth", 50, 0, 100, "%"),
    f("air", "Air", 50, 0, 100, "%"),
    f("deEss", "De-Ess", 30, 0, 100, "%"),
    f("breathSuppress", "Breath Suppress", 0, 0, 100, "%"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
  "auto-tune": () => [
    c("key", "Key", "C", [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ]),
    c("scale", "Scale", "major", [
      "chromatic",
      "major",
      "minor",
      "harmonic-minor",
      "melodic-minor",
      "pentatonic",
      "blues",
    ]),
    f("retune", "Retune Speed", 20, 0, 200, "ms"),
    f("humanize", "Humanize", 0, 0, 100, "%"),
    f("flexTune", "Flex Tune", 0, 0, 100, "%"),
    f("formantShift", "Formant Shift", 0, -12, 12, "st"),
    f("throat", "Throat Length", 0, -50, 50, "%"),
    f("vibratoRate", "Vibrato Rate", 5, 0, 10, "Hz"),
    f("vibratoDepth", "Vibrato Depth", 0, 0, 100, "%"),
    b("lowLatency", "Low Latency", true),
  ],
  harmony: () => [
    i("voices", "Voices", 4, 1, 8),
    f("spread", "Stereo Spread", 100, 0, 200, "%"),
    c("key", "Key", "C", [
      "C",
      "C#",
      "D",
      "D#",
      "E",
      "F",
      "F#",
      "G",
      "G#",
      "A",
      "A#",
      "B",
    ]),
    c("scale", "Scale", "major", ["major", "minor", "dorian", "mixolydian"]),
    f("mix", "Mix", 50, 0, 100, "%"),
  ],
  formant: () => [
    f("shift", "Shift", 0, -12, 12, "st"),
    f("throat", "Throat", 0, -50, 50, "%"),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],

  // ---------------- Microphones ----------------
  microphone: () => [
    c("model", "Mic Model", "large-condenser", [
      "large-condenser",
      "small-condenser",
      "dynamic",
      "ribbon",
      "tube",
    ]),
    c("pattern", "Polar Pattern", "cardioid", [
      "omni",
      "cardioid",
      "super-cardioid",
      "figure-8",
      "wide-cardioid",
    ]),
    f("proximity", "Proximity", 0, -12, 12, "dB"),
    f("air", "Air Boost", 0, 0, 12, "dB"),
    f("presence", "Presence", 0, -6, 12, "dB"),
    b("hpf", "High-Pass", true),
    f("hpfFreq", "HPF Freq", 80, 20, 300, "Hz"),
    f("pad", "Pad", 0, -20, 0, "dB"),
    f("output", "Output", 0, -12, 12, "dB"),
  ],
  condenser: () => [
    f("proximity", "Proximity", 0, -12, 12, "dB"),
    f("air", "Air", 0, 0, 12, "dB"),
    f("presence", "Presence", 0, -6, 12, "dB"),
    b("hpf", "High-Pass", false),
    f("output", "Output", 0, -12, 12, "dB"),
  ],
  dynamic: () => [
    f("proximity", "Proximity", 0, -6, 12, "dB"),
    f("presence", "Presence", 0, -6, 12, "dB"),
    f("output", "Output", 0, -12, 12, "dB"),
  ],
  ribbon: () => [
    f("proximity", "Proximity", 0, -12, 12, "dB"),
    f("warmth", "Warmth", 0, 0, 12, "dB"),
    f("output", "Output", 0, -12, 12, "dB"),
  ],

  // ---------------- Restore / restoration ----------------
  restore: () => [
    f("threshold", "Threshold", -40, -90, 0, "dB"),
    f("reduction", "Reduction", 12, 0, 60, "dB"),
    f("frequency", "Frequency", 1000, 20, 22000, "Hz"),
    f("q", "Q", 1, 0.1, 100),
    c("mode", "Mode", "denoise", [
      "denoise",
      "declick",
      "dehum",
      "decrackle",
      "dereverb",
    ]),
    b("listen", "Listen", false),
    f("mix", "Mix", 100, 0, 100, "%"),
  ],
};

// ---------------------------------------------------------------------------
// Genre preset matrix per plugin TYPE
// ---------------------------------------------------------------------------
// A preset is a partial parameter override.  enrichPlugin() merges with
// the type-default and then over the plugin's existing defaultPreset, so
// missing params are filled in safely.

type Preset = Record<string, number | boolean | string>;
type GenrePresets = Partial<Record<Genre, Preset>>;

const fillForAll = (
  base: Preset,
  perGenre: Partial<Record<Genre, Preset>>,
): GenrePresets => {
  const out: GenrePresets = {};
  for (const g of GENRE_IDS) {
    out[g] = { ...base, ...(perGenre[g] || {}) };
  }
  return out;
};

const GENRE_PRESETS: Partial<Record<string, GenrePresets>> = {
  // ---- Compressors (covers `compressor` + `mastering`-as-compressor) ----
  compressor: fillForAll(
    {
      threshold: -18,
      ratio: 4,
      attack: 10,
      release: 100,
      knee: 6,
      makeup: 0,
      mix: 100,
      character: "clean",
      detection: "peak",
    },
    {
      "hip-hop": {
        threshold: -14,
        ratio: 3,
        attack: 8,
        release: 80,
        character: "vca",
        mix: 100,
      },
      trap: {
        threshold: -10,
        ratio: 6,
        attack: 3,
        release: 60,
        character: "fet",
        mix: 100,
      },
      lofi: {
        threshold: -16,
        ratio: 3,
        attack: 20,
        release: 200,
        character: "opto",
        mix: 80,
        scHpf: 80,
      },
      rnb: {
        threshold: -16,
        ratio: 3,
        attack: 15,
        release: 150,
        character: "opto",
        mix: 100,
      },
      pop: {
        threshold: -14,
        ratio: 4,
        attack: 5,
        release: 100,
        character: "fet",
        mix: 100,
      },
      rock: {
        threshold: -12,
        ratio: 4,
        attack: 8,
        release: 80,
        character: "vca",
        mix: 100,
      },
      metal: {
        threshold: -10,
        ratio: 6,
        attack: 3,
        release: 50,
        character: "fet",
        mix: 100,
        scHpf: 100,
      },
      indie: {
        threshold: -16,
        ratio: 3,
        attack: 12,
        release: 120,
        character: "vca",
        mix: 100,
      },
      country: {
        threshold: -18,
        ratio: 3,
        attack: 15,
        release: 150,
        character: "opto",
        mix: 100,
      },
      jazz: {
        threshold: -20,
        ratio: 2,
        attack: 25,
        release: 250,
        character: "tube",
        mix: 80,
      },
      "funk-soul": {
        threshold: -14,
        ratio: 4,
        attack: 5,
        release: 80,
        character: "vca",
        mix: 100,
      },
      reggae: {
        threshold: -16,
        ratio: 3,
        attack: 12,
        release: 180,
        character: "opto",
        mix: 100,
      },
      latin: {
        threshold: -14,
        ratio: 4,
        attack: 8,
        release: 100,
        character: "vca",
        mix: 100,
      },
      afrobeats: {
        threshold: -14,
        ratio: 4,
        attack: 6,
        release: 80,
        character: "vca",
        mix: 100,
      },
      "edm-house": {
        threshold: -10,
        ratio: 6,
        attack: 1,
        release: 50,
        character: "clean",
        mix: 100,
        scHpf: 80,
      },
      techno: {
        threshold: -12,
        ratio: 6,
        attack: 1,
        release: 40,
        character: "clean",
        mix: 100,
        scHpf: 100,
      },
      dnb: {
        threshold: -8,
        ratio: 8,
        attack: 0.5,
        release: 30,
        character: "fet",
        mix: 100,
        scHpf: 100,
      },
      dubstep: {
        threshold: -8,
        ratio: 8,
        attack: 0.3,
        release: 30,
        character: "fet",
        mix: 100,
        scHpf: 120,
      },
      "ambient-cinematic": {
        threshold: -22,
        ratio: 2,
        attack: 30,
        release: 400,
        character: "opto",
        mix: 60,
      },
      "classical-orchestral": {
        threshold: -24,
        ratio: 1.5,
        attack: 30,
        release: 500,
        character: "tube",
        mix: 40,
      },
    },
  ),

  // ---- Limiter / Maximizer (master-bus aware) ----
  limiter: fillForAll(
    {
      threshold: -1,
      ceiling: -0.3,
      release: 50,
      lookahead: 5,
      character: "transparent",
      truePeak: true,
    },
    {
      "hip-hop": {
        threshold: -6,
        ceiling: -0.8,
        release: 30,
        character: "aggressive",
      },
      trap: {
        threshold: -8,
        ceiling: -1.0,
        release: 20,
        character: "aggressive",
      },
      lofi: { threshold: -3, ceiling: -1.0, release: 80, character: "vintage" },
      rnb: { threshold: -4, ceiling: -1.0, release: 60, character: "modern" },
      pop: { threshold: -7, ceiling: -1.0, release: 40, character: "modern" },
      rock: { threshold: -5, ceiling: -1.0, release: 50, character: "modern" },
      metal: {
        threshold: -8,
        ceiling: -1.0,
        release: 30,
        character: "aggressive",
      },
      indie: {
        threshold: -4,
        ceiling: -1.0,
        release: 60,
        character: "vintage",
      },
      country: {
        threshold: -3,
        ceiling: -1.0,
        release: 80,
        character: "vintage",
      },
      jazz: {
        threshold: -2,
        ceiling: -1.0,
        release: 100,
        character: "transparent",
      },
      "funk-soul": {
        threshold: -4,
        ceiling: -1.0,
        release: 50,
        character: "vintage",
      },
      reggae: {
        threshold: -4,
        ceiling: -1.0,
        release: 70,
        character: "vintage",
      },
      latin: { threshold: -5, ceiling: -1.0, release: 50, character: "modern" },
      afrobeats: {
        threshold: -6,
        ceiling: -1.0,
        release: 40,
        character: "modern",
      },
      "edm-house": {
        threshold: -8,
        ceiling: -1.0,
        release: 20,
        character: "modern",
      },
      techno: {
        threshold: -7,
        ceiling: -1.0,
        release: 25,
        character: "modern",
      },
      dnb: {
        threshold: -8,
        ceiling: -1.0,
        release: 15,
        character: "aggressive",
      },
      dubstep: {
        threshold: -9,
        ceiling: -1.0,
        release: 15,
        character: "aggressive",
      },
      "ambient-cinematic": {
        threshold: -1,
        ceiling: -1.0,
        release: 200,
        character: "transparent",
      },
      "classical-orchestral": {
        threshold: -1,
        ceiling: -1.0,
        release: 300,
        character: "transparent",
      },
    },
  ),

  // ---- Parametric EQ — minimal per-genre tilt (band1 HPF, band 5 air boost, band 6 presence cut/boost) ----
  eq: fillForAll(
    {
      band1On: true,
      band1Type: "high-pass",
      band1Freq: 30,
      band1Gain: 0,
      band1Q: 0.7,
      band5On: true,
      band5Type: "high-shelf",
      band5Freq: 12000,
      band5Gain: 0,
      processing: "zero-latency",
      channel: "stereo",
    },
    {
      "hip-hop": {
        band1Freq: 30,
        band5Gain: 2,
        band3On: true,
        band3Type: "bell",
        band3Freq: 200,
        band3Gain: -2,
        band3Q: 1.2,
      },
      trap: {
        band1Freq: 25,
        band5Gain: 3,
        band3On: true,
        band3Type: "bell",
        band3Freq: 250,
        band3Gain: -3,
        band3Q: 1.5,
      },
      lofi: { band1Freq: 80, band5Gain: -4, band5Freq: 8000 },
      rnb: {
        band1Freq: 35,
        band5Gain: 2.5,
        band4On: true,
        band4Type: "bell",
        band4Freq: 3000,
        band4Gain: 1,
      },
      pop: {
        band1Freq: 40,
        band5Gain: 3,
        band4On: true,
        band4Type: "bell",
        band4Freq: 4000,
        band4Gain: 2,
      },
      rock: {
        band1Freq: 60,
        band5Gain: 2,
        band3On: true,
        band3Type: "bell",
        band3Freq: 500,
        band3Gain: -2,
      },
      metal: {
        band1Freq: 80,
        band5Gain: 3,
        band3On: true,
        band3Type: "bell",
        band3Freq: 400,
        band3Gain: -4,
        band3Q: 2,
      },
      indie: { band1Freq: 50, band5Gain: 1 },
      country: {
        band1Freq: 60,
        band5Gain: 2,
        band4On: true,
        band4Type: "bell",
        band4Freq: 5000,
        band4Gain: 1.5,
      },
      jazz: { band1Freq: 30, band5Gain: 1 },
      "funk-soul": {
        band1Freq: 40,
        band5Gain: 2,
        band4On: true,
        band4Type: "bell",
        band4Freq: 3500,
        band4Gain: 1.5,
      },
      reggae: {
        band1Freq: 30,
        band5Gain: 0,
        band3On: true,
        band3Type: "bell",
        band3Freq: 100,
        band3Gain: 2,
      },
      latin: { band1Freq: 50, band5Gain: 2 },
      afrobeats: { band1Freq: 40, band5Gain: 3 },
      "edm-house": {
        band1Freq: 30,
        band5Gain: 3,
        band3On: true,
        band3Type: "bell",
        band3Freq: 300,
        band3Gain: -2,
      },
      techno: {
        band1Freq: 30,
        band5Gain: 2,
        band3On: true,
        band3Type: "bell",
        band3Freq: 400,
        band3Gain: -2,
      },
      dnb: {
        band1Freq: 30,
        band5Gain: 3,
        band3On: true,
        band3Type: "bell",
        band3Freq: 250,
        band3Gain: -3,
      },
      dubstep: {
        band1Freq: 25,
        band5Gain: 3,
        band3On: true,
        band3Type: "bell",
        band3Freq: 250,
        band3Gain: -3,
      },
      "ambient-cinematic": { band1Freq: 40, band5Gain: 2 },
      "classical-orchestral": { band1Freq: 30, band5Gain: 0 },
    },
  ),

  // ---- Reverb ----
  reverb: fillForAll(
    {
      predelay: 20,
      size: 50,
      decay: 2.0,
      density: 70,
      lowDamp: 50,
      highDamp: 50,
      lowCut: 80,
      highCut: 12000,
      mix: 25,
      algorithm: "hall",
    },
    {
      "hip-hop": { algorithm: "plate", decay: 1.6, predelay: 25, mix: 15 },
      trap: { algorithm: "plate", decay: 1.2, predelay: 20, mix: 10 },
      lofi: {
        algorithm: "spring",
        decay: 1.4,
        predelay: 10,
        mix: 30,
        highDamp: 70,
      },
      rnb: { algorithm: "plate", decay: 1.8, predelay: 30, mix: 22 },
      pop: { algorithm: "plate", decay: 1.6, predelay: 25, mix: 18 },
      rock: { algorithm: "plate", decay: 1.8, predelay: 20, mix: 20 },
      metal: { algorithm: "room", decay: 1.0, predelay: 15, mix: 12 },
      indie: { algorithm: "plate", decay: 2.2, predelay: 25, mix: 25 },
      country: { algorithm: "plate", decay: 1.8, predelay: 25, mix: 22 },
      jazz: { algorithm: "hall", decay: 2.4, predelay: 30, mix: 22 },
      "funk-soul": { algorithm: "plate", decay: 1.6, predelay: 20, mix: 18 },
      reggae: { algorithm: "spring", decay: 2.0, predelay: 15, mix: 25 },
      latin: { algorithm: "plate", decay: 1.8, predelay: 25, mix: 22 },
      afrobeats: { algorithm: "plate", decay: 1.6, predelay: 20, mix: 18 },
      "edm-house": { algorithm: "hall", decay: 2.6, predelay: 30, mix: 20 },
      techno: { algorithm: "hall", decay: 3.0, predelay: 25, mix: 18 },
      dnb: { algorithm: "plate", decay: 1.4, predelay: 15, mix: 15 },
      dubstep: { algorithm: "plate", decay: 1.2, predelay: 15, mix: 12 },
      "ambient-cinematic": {
        algorithm: "shimmer",
        decay: 8.0,
        predelay: 40,
        mix: 45,
      },
      "classical-orchestral": {
        algorithm: "hall",
        decay: 3.2,
        predelay: 35,
        mix: 28,
      },
    },
  ),

  // ---- Delay ----
  delay: fillForAll(
    {
      syncL: true,
      syncR: true,
      divisionL: "1/8",
      divisionR: "1/4",
      feedback: 35,
      mode: "digital",
      mix: 25,
    },
    {
      "hip-hop": {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 30,
        mode: "analog",
        mix: 18,
      },
      trap: {
        divisionL: "1/16",
        divisionR: "1/8",
        feedback: 25,
        mode: "digital",
        mix: 12,
      },
      lofi: {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 40,
        mode: "tape",
        mix: 30,
        wow: 25,
        flutter: 20,
      },
      rnb: {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 40,
        mode: "analog",
        mix: 20,
      },
      pop: {
        divisionL: "1/8D",
        divisionR: "1/4",
        feedback: 35,
        mode: "digital",
        mix: 18,
      },
      rock: {
        divisionL: "1/8D",
        divisionR: "1/4D",
        feedback: 40,
        mode: "analog",
        mix: 25,
      },
      metal: {
        divisionL: "1/16",
        divisionR: "1/8",
        feedback: 25,
        mode: "digital",
        mix: 15,
      },
      indie: {
        divisionL: "1/8D",
        divisionR: "1/4",
        feedback: 45,
        mode: "tape",
        mix: 30,
      },
      country: {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 30,
        mode: "analog",
        mix: 18,
      },
      jazz: {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 25,
        mode: "tape",
        mix: 12,
      },
      "funk-soul": {
        divisionL: "1/16",
        divisionR: "1/8",
        feedback: 30,
        mode: "analog",
        mix: 18,
      },
      reggae: {
        divisionL: "1/8D",
        divisionR: "1/4D",
        feedback: 60,
        mode: "tape",
        mix: 35,
        wow: 30,
        flutter: 20,
      },
      latin: {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 30,
        mode: "digital",
        mix: 18,
      },
      afrobeats: {
        divisionL: "1/16",
        divisionR: "1/8",
        feedback: 30,
        mode: "digital",
        mix: 18,
      },
      "edm-house": {
        divisionL: "1/8D",
        divisionR: "1/4",
        feedback: 45,
        mode: "digital",
        mix: 25,
      },
      techno: {
        divisionL: "1/16D",
        divisionR: "1/8D",
        feedback: 55,
        mode: "digital",
        mix: 25,
      },
      dnb: {
        divisionL: "1/16",
        divisionR: "1/8",
        feedback: 35,
        mode: "digital",
        mix: 20,
      },
      dubstep: {
        divisionL: "1/8",
        divisionR: "1/4",
        feedback: 40,
        mode: "digital",
        mix: 18,
      },
      "ambient-cinematic": {
        divisionL: "1/4D",
        divisionR: "1/2",
        feedback: 65,
        mode: "tape",
        mix: 40,
      },
      "classical-orchestral": {
        divisionL: "1/4",
        divisionR: "1/2",
        feedback: 20,
        mode: "digital",
        mix: 10,
      },
    },
  ),

  // ---- Gate ----
  gate: fillForAll(
    {
      threshold: -40,
      range: -60,
      attack: 1,
      hold: 10,
      release: 100,
      hysteresis: 6,
    },
    {
      "hip-hop": {
        threshold: -32,
        range: -40,
        attack: 0.5,
        hold: 5,
        release: 60,
        scHpf: 100,
      },
      trap: {
        threshold: -28,
        range: -50,
        attack: 0.3,
        hold: 3,
        release: 40,
        scHpf: 150,
      },
      rock: { threshold: -38, range: -50, attack: 1, hold: 8, release: 120 },
      metal: {
        threshold: -30,
        range: -60,
        attack: 0.3,
        hold: 5,
        release: 80,
        scHpf: 100,
      },
      "edm-house": {
        threshold: -36,
        range: -50,
        attack: 0.5,
        hold: 5,
        release: 60,
      },
      techno: { threshold: -36, range: -50, attack: 0.5, hold: 5, release: 50 },
      dnb: { threshold: -34, range: -60, attack: 0.2, hold: 3, release: 40 },
      dubstep: {
        threshold: -34,
        range: -60,
        attack: 0.2,
        hold: 3,
        release: 40,
      },
      jazz: { threshold: -50, range: -30, attack: 2, hold: 20, release: 200 },
      "classical-orchestral": {
        threshold: -55,
        range: -25,
        attack: 3,
        hold: 30,
        release: 300,
      },
    },
  ),

  // ---- De-esser ----
  "de-esser": fillForAll(
    {
      threshold: -24,
      frequency: 6500,
      range: -8,
      q: 1.5,
      mode: "split",
      character: "modern",
    },
    {
      "hip-hop": {
        frequency: 6000,
        range: -8,
        mode: "split",
        character: "modern",
      },
      trap: { frequency: 6500, range: -10, mode: "split", character: "modern" },
      rnb: { frequency: 6800, range: -6, mode: "split", character: "modern" },
      pop: { frequency: 7000, range: -8, mode: "split", character: "modern" },
      rock: {
        frequency: 7500,
        range: -6,
        mode: "wide-band",
        character: "allround",
      },
      metal: {
        frequency: 8000,
        range: -10,
        mode: "wide-band",
        character: "allround",
      },
      indie: {
        frequency: 7000,
        range: -5,
        mode: "split",
        character: "vintage",
      },
      country: {
        frequency: 6800,
        range: -5,
        mode: "split",
        character: "female",
      },
      jazz: { frequency: 7500, range: -4, mode: "split", character: "vintage" },
    },
  ),

  // ---- Transient shaper ----
  "transient-shaper": fillForAll(
    {
      attack: 0,
      sustain: 0,
      output: 0,
      mode: "classic",
      detection: "broadband",
    },
    {
      "hip-hop": { attack: 25, sustain: -10, mode: "classic" },
      trap: { attack: 40, sustain: -20, mode: "fast" },
      lofi: { attack: -10, sustain: 15, mode: "smooth" },
      rock: { attack: 20, sustain: 5, mode: "classic" },
      metal: { attack: 35, sustain: -15, mode: "fast" },
      "edm-house": { attack: 30, sustain: -10, mode: "fast" },
      techno: { attack: 35, sustain: -10, mode: "fast" },
      dnb: { attack: 45, sustain: -20, mode: "fast" },
      dubstep: { attack: 40, sustain: -15, mode: "fast" },
      "funk-soul": { attack: 25, sustain: 0, mode: "classic" },
    },
  ),

  // ---- Chorus ----
  chorus: fillForAll(
    {
      rate: 0.5,
      depth: 30,
      delay: 15,
      feedback: 0,
      voices: 2,
      spread: 100,
      mode: "classic",
      mix: 50,
    },
    {
      lofi: { rate: 0.3, depth: 40, mode: "vintage", mix: 60 },
      rnb: { rate: 0.4, depth: 35, mode: "dimension", mix: 50 },
      pop: { rate: 0.6, depth: 30, mode: "classic", mix: 45 },
      rock: { rate: 0.5, depth: 35, mode: "vintage", mix: 50 },
      indie: { rate: 0.4, depth: 40, mode: "vintage", mix: 55 },
      country: { rate: 0.5, depth: 30, mode: "classic", mix: 40 },
      jazz: { rate: 0.3, depth: 20, mode: "ensemble", mix: 35 },
      "funk-soul": { rate: 0.6, depth: 30, mode: "classic", mix: 45 },
      "edm-house": { rate: 0.7, depth: 25, mode: "tri-chorus", mix: 40 },
      "ambient-cinematic": { rate: 0.25, depth: 50, mode: "ensemble", mix: 60 },
    },
  ),

  // ---- Distortion ----
  distortion: fillForAll(
    { drive: 30, tone: 50, output: 0, algorithm: "tube", mix: 100 },
    {
      "hip-hop": { drive: 25, tone: 55, algorithm: "tape", mix: 30 },
      trap: { drive: 35, tone: 60, algorithm: "transistor", mix: 25 },
      lofi: { drive: 45, tone: 35, algorithm: "tape", mix: 60 },
      rock: { drive: 50, tone: 55, algorithm: "tube", mix: 100 },
      metal: { drive: 75, tone: 70, algorithm: "rectifier", mix: 100 },
      indie: { drive: 35, tone: 50, algorithm: "fuzz", mix: 80 },
      "funk-soul": { drive: 25, tone: 55, algorithm: "tube", mix: 50 },
      "edm-house": { drive: 30, tone: 60, algorithm: "tube", mix: 35 },
      techno: { drive: 40, tone: 60, algorithm: "transistor", mix: 40 },
      dnb: { drive: 45, tone: 65, algorithm: "transistor", mix: 35 },
      dubstep: { drive: 60, tone: 70, algorithm: "fold", mix: 50 },
    },
  ),

  // ---- Tape ----
  tape: fillForAll(
    {
      drive: 30,
      bias: 50,
      wow: 10,
      flutter: 10,
      hiss: 0,
      crosstalk: 20,
      speed: "15ips",
      formula: "modern",
      mix: 100,
    },
    {
      lofi: {
        drive: 50,
        wow: 40,
        flutter: 35,
        hiss: 25,
        speed: "7.5ips",
        formula: "vintage",
      },
      "hip-hop": {
        drive: 30,
        wow: 15,
        flutter: 12,
        hiss: 10,
        speed: "15ips",
        formula: "vintage",
      },
      rnb: {
        drive: 25,
        wow: 12,
        flutter: 10,
        hiss: 5,
        speed: "15ips",
        formula: "modern",
      },
      jazz: {
        drive: 20,
        wow: 8,
        flutter: 8,
        hiss: 5,
        speed: "15ips",
        formula: "vintage",
      },
      rock: {
        drive: 40,
        wow: 12,
        flutter: 10,
        hiss: 5,
        speed: "15ips",
        formula: "modern",
      },
      indie: {
        drive: 45,
        wow: 25,
        flutter: 20,
        hiss: 15,
        speed: "7.5ips",
        formula: "vintage",
      },
      "ambient-cinematic": {
        drive: 20,
        wow: 15,
        flutter: 10,
        hiss: 8,
        speed: "15ips",
        formula: "vintage",
      },
    },
  ),

  // ---- Stereo / imager ----
  stereo: fillForAll(
    {
      width: 100,
      balance: 0,
      midGain: 0,
      sideGain: 0,
      lowMonoFreq: 120,
      monoMaker: true,
      mode: "mid-side",
    },
    {
      "hip-hop": { width: 110, sideGain: 1, lowMonoFreq: 120 },
      trap: { width: 120, sideGain: 2, lowMonoFreq: 140 },
      "edm-house": { width: 130, sideGain: 2, lowMonoFreq: 120 },
      techno: { width: 125, sideGain: 1.5, lowMonoFreq: 120 },
      dnb: { width: 130, sideGain: 2, lowMonoFreq: 140 },
      dubstep: { width: 140, sideGain: 3, lowMonoFreq: 150 },
      pop: { width: 110, sideGain: 1, lowMonoFreq: 100 },
      rock: { width: 110, sideGain: 1, lowMonoFreq: 100 },
      metal: { width: 100, sideGain: 0, lowMonoFreq: 120 },
      jazz: { width: 100, sideGain: 0, lowMonoFreq: 80, monoMaker: false },
      "classical-orchestral": {
        width: 100,
        sideGain: 0,
        lowMonoFreq: 60,
        monoMaker: false,
      },
      "ambient-cinematic": { width: 140, sideGain: 2, lowMonoFreq: 60 },
    },
  ),

  // ---- Plate reverb (vocal-focused) ----
  plate: fillForAll(
    {
      predelay: 10,
      decay: 1.8,
      size: 60,
      damping: 50,
      lowCut: 100,
      highCut: 10000,
      mix: 25,
    },
    {
      "hip-hop": { decay: 1.4, predelay: 20, mix: 18 },
      trap: { decay: 1.0, predelay: 15, mix: 12 },
      rnb: { decay: 1.8, predelay: 25, mix: 22 },
      pop: { decay: 1.6, predelay: 25, mix: 20 },
      rock: { decay: 1.8, predelay: 20, mix: 22 },
      indie: { decay: 2.2, predelay: 25, mix: 28 },
      jazz: { decay: 2.4, predelay: 30, mix: 22 },
      country: { decay: 1.8, predelay: 25, mix: 22 },
    },
  ),

  // ---- Hall reverb (orchestral/atmospheric) ----
  hall: fillForAll(
    {
      predelay: 40,
      decay: 2.8,
      size: 80,
      diffusion: 80,
      lowDamp: 30,
      highDamp: 60,
      lowCut: 80,
      highCut: 11000,
      mix: 25,
    },
    {
      "classical-orchestral": { decay: 3.2, size: 90, predelay: 35, mix: 28 },
      jazz: { decay: 2.4, size: 75, predelay: 30, mix: 22 },
      "ambient-cinematic": { decay: 6.0, size: 95, predelay: 40, mix: 40 },
      pop: { decay: 2.0, size: 60, predelay: 25, mix: 18 },
      rock: { decay: 2.2, size: 70, predelay: 25, mix: 20 },
      "edm-house": { decay: 2.8, size: 80, predelay: 30, mix: 22 },
    },
  ),

  // ---- Spring / Shimmer / Ambient / Chamber: keep base, no per-genre divergence (use defaults) ----
  spring: fillForAll(
    { decay: 1.5, tension: 50, springs: 3, boing: 30, tone: 50, mix: 30 },
    {
      reggae: { boing: 60, mix: 40 },
      lofi: { boing: 40, mix: 35 },
      rock: { boing: 35, mix: 30 },
    },
  ),
  shimmer: fillForAll(
    {
      decay: 4.0,
      size: 80,
      shimmer: 50,
      pitch1: 12,
      pitch2: 19,
      feedback: 40,
      mix: 30,
    },
    {
      "ambient-cinematic": { decay: 10, shimmer: 70, mix: 50 },
      "classical-orchestral": { decay: 6, shimmer: 40, mix: 30 },
      rnb: { decay: 3, shimmer: 35, mix: 25 },
      pop: { decay: 4, shimmer: 40, mix: 22 },
    },
  ),

  // ---- Filter (auto-filter etc.) ----
  filter: fillForAll(
    { cutoff: 1000, resonance: 0.5, mode: "low-pass", slope: 24, mix: 100 },
    {
      "edm-house": {
        cutoff: 2500,
        resonance: 0.6,
        mode: "low-pass",
        lfoRate: 0.5,
        lfoDepth: 50,
      },
      techno: {
        cutoff: 1800,
        resonance: 0.7,
        mode: "low-pass",
        lfoRate: 0.25,
        lfoDepth: 60,
      },
      dnb: {
        cutoff: 3000,
        resonance: 0.6,
        mode: "band-pass",
        lfoRate: 1,
        lfoDepth: 40,
      },
      dubstep: {
        cutoff: 1500,
        resonance: 0.8,
        mode: "low-pass",
        lfoRate: 0.5,
        lfoDepth: 70,
      },
      "funk-soul": {
        cutoff: 2000,
        resonance: 0.6,
        mode: "band-pass",
        envFollow: 60,
      },
      lofi: { cutoff: 6000, resonance: 0.2, mode: "low-pass" },
    },
  ),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Merge reference parameters and genre presets into one plugin definition. */
export function enrichPlugin(plugin: PluginDefinition): PluginDefinition {
  if (plugin?.enriched) return plugin;

  const referenceFn = REFERENCE[plugin?.type];
  const refParams = referenceFn ? referenceFn() : [];

  // Add any missing reference parameters (preserve existing values/ranges).
  const existing = new Set(plugin?.parameters.map((p) => p?.id));
  const additions = refParams?.filter((p) => !existing?.has(p?.id));
  const mergedParams = [...plugin?.parameters, ...additions];

  // Backfill defaultPreset for newly added parameters.
  const mergedDefault: Record<string, number | boolean | string> = {
    ...plugin?.defaultPreset,
  };
  for (const p of additions) {
    if (!(p.id in mergedDefault)) mergedDefault[p.id] = p?.defaultValue;
  }

  // Attach genre presets, gated to ids that actually exist on this plugin.
  const typePresets = GENRE_PRESETS[plugin?.type];
  let genrePresets:
    | Record<string, Record<string, number | boolean | string>>
    | undefined;
  if (typePresets) {
    const validIds = new Set(mergedParams?.map((p) => p?.id));
    genrePresets = {};
    for (const [genre, preset] of Object.entries(typePresets)) {
      if (!preset) continue;
      const filtered: Record<string, number | boolean | string> = {};
      for (const [k, v] of Object.entries(preset)) {
        if (validIds.has(k)) filtered[k] = v;
      }
      if (Object.keys(filtered).length > 0) genrePresets[genre] = filtered;
    }
    if (Object.keys(genrePresets).length === 0) genrePresets = undefined;
  }

  return {
    ...plugin,
    parameters: mergedParams,
    defaultPreset: mergedDefault,
    genrePresets,
    enriched: true,
    referenceNote: referenceFn
      ? `Industry-standard ${plugin?.type} control surface; ${additions?.length} reference parameter(s) added.`
      : undefined,
  };
}

export function enrichAll(plugins: PluginDefinition[]): PluginDefinition[] {
  return plugins?.map(enrichPlugin);
}

/** Flatten the enriched catalog into rows for the plugin_presets table. */
export function buildFactoryPresetRows(plugins: PluginDefinition[]): Array<{
  pluginSlug: string;
  name: string;
  parameters: Record<string, number | boolean | string>;
  metadata: { genre: string; factory: true };
}> {
  const out: Array<{
    pluginSlug: string;
    name: string;
    parameters: Record<string, number | boolean | string>;
    metadata: { genre: string; factory: true };
  }> = [];
  for (const p of plugins) {
    if (!p?.genrePresets) continue;
    for (const [genre, params] of Object.entries(p?.genrePresets)) {
      out?.push({
        pluginSlug: p.slug,
        name: `Genre: ${genre}`,
        parameters: { ...p?.defaultPreset, ...params },
        metadata: { genre, factory: true },
      });
    }
  }
  return out;
}

/** Diagnostic: list which types are enriched and which are pass-through. */
export function enrichmentCoverage(plugins: PluginDefinition[]): {
  total: number;
  enriched: number;
  withGenrePresets: number;
  typesEnriched: string[];
  typesPassThrough: string[];
} {
  const typesEnriched = new Set<string>();
  const typesPassThrough = new Set<string>();
  let enriched = 0;
  let withGenrePresets = 0;
  for (const p of plugins) {
    if (REFERENCE[p?.type]) {
      typesEnriched?.add(p?.type);
      enriched++;
    } else typesPassThrough?.add(p?.type);
    if (p?.genrePresets && Object.keys(p?.genrePresets).length > 0)
      withGenrePresets++;
  }
  return {
    total: plugins.length,
    enriched,
    withGenrePresets,
    typesEnriched: [...typesEnriched].sort(),
    typesPassThrough: [...typesPassThrough].sort(),
  };
}
