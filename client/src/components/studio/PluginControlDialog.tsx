import { useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Knob } from "./Knob";
import {
  RotateCcw,
  Activity,
  Volume2,
  Waves,
  Clock,
  Sparkles,
  Music,
  Zap,
  Wind,
} from "lucide-react";
import type { PluginInstance, PluginType } from "./PluginRack";

interface PluginPreset {
  id: string;
  name: string;
  parameters: Record<string, number>;
}

interface PluginControlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plugin: PluginInstance | null;
  onParameterChange: (key: string, value: number) => void;
  onBypassChange: (bypass: boolean) => void;
  onReset: () => void;
}

const PLUGIN_PRESETS: Record<PluginType, PluginPreset[]> = {
  eq: [
    {
      id: "flat",
      name: "Flat",
      parameters: { low: 0, mid: 0, high: 0, midFreq: 1000 },
    },
    {
      id: "vocal-presence",
      name: "Vocal Presence",
      parameters: { low: -2, mid: 3, high: 2, midFreq: 2500 },
    },
    {
      id: "bass-boost",
      name: "Bass Boost",
      parameters: { low: 6, mid: 0, high: -2, midFreq: 800 },
    },
    {
      id: "bright-mix",
      name: "Bright Mix",
      parameters: { low: -1, mid: 1, high: 4, midFreq: 3000 },
    },
    {
      id: "warm-analog",
      name: "Warm Analog",
      parameters: { low: 3, mid: -1, high: -3, midFreq: 500 },
    },
    {
      id: "radio-ready",
      name: "Radio Ready",
      parameters: { low: 2, mid: 2, high: 3, midFreq: 2000 },
    },
    {
      id: "telephone",
      name: "Telephone",
      parameters: { low: -12, mid: 6, high: -8, midFreq: 1200 },
    },
    {
      id: "scoop",
      name: "Mid Scoop",
      parameters: { low: 4, mid: -6, high: 4, midFreq: 1000 },
    },
  ],
  compressor: [
    {
      id: "gentle",
      name: "Gentle",
      parameters: {
        threshold: -20,
        ratio: 2,
        attack: 20,
        release: 200,
        makeup: 2,
      },
    },
    {
      id: "vocal",
      name: "Vocal",
      parameters: {
        threshold: -18,
        ratio: 4,
        attack: 5,
        release: 100,
        makeup: 4,
      },
    },
    {
      id: "drums",
      name: "Drums Punch",
      parameters: {
        threshold: -15,
        ratio: 6,
        attack: 1,
        release: 50,
        makeup: 6,
      },
    },
    {
      id: "bus-glue",
      name: "Bus Glue",
      parameters: {
        threshold: -12,
        ratio: 2,
        attack: 30,
        release: 300,
        makeup: 2,
      },
    },
    {
      id: "limiter",
      name: "Limiting",
      parameters: {
        threshold: -6,
        ratio: 20,
        attack: 0.5,
        release: 100,
        makeup: 0,
      },
    },
    {
      id: "parallel",
      name: "Parallel Crush",
      parameters: {
        threshold: -30,
        ratio: 8,
        attack: 1,
        release: 80,
        makeup: 10,
      },
    },
    {
      id: "opto",
      name: "Opto Style",
      parameters: {
        threshold: -24,
        ratio: 3,
        attack: 40,
        release: 400,
        makeup: 3,
      },
    },
    {
      id: "aggressive",
      name: "Aggressive",
      parameters: {
        threshold: -10,
        ratio: 10,
        attack: 0.5,
        release: 50,
        makeup: 8,
      },
    },
  ],
  reverb: [
    {
      id: "room",
      name: "Small Room",
      parameters: { size: 20, decay: 0.5, damping: 60, mix: 20 },
    },
    {
      id: "hall",
      name: "Concert Hall",
      parameters: { size: 80, decay: 3, damping: 40, mix: 30 },
    },
    {
      id: "plate",
      name: "Plate",
      parameters: { size: 50, decay: 1.5, damping: 50, mix: 25 },
    },
    {
      id: "chamber",
      name: "Chamber",
      parameters: { size: 40, decay: 1.2, damping: 55, mix: 22 },
    },
    {
      id: "cathedral",
      name: "Cathedral",
      parameters: { size: 100, decay: 6, damping: 30, mix: 35 },
    },
    {
      id: "spring",
      name: "Spring",
      parameters: { size: 30, decay: 1, damping: 70, mix: 28 },
    },
    {
      id: "ambient",
      name: "Ambient Wash",
      parameters: { size: 90, decay: 8, damping: 20, mix: 50 },
    },
    {
      id: "tight",
      name: "Tight Space",
      parameters: { size: 10, decay: 0.3, damping: 80, mix: 15 },
    },
  ],
  delay: [
    {
      id: "slap",
      name: "Slap Back",
      parameters: { time: 80, feedback: 10, mix: 25 },
    },
    {
      id: "quarter",
      name: "1/4 Note",
      parameters: { time: 500, feedback: 40, mix: 30 },
    },
    {
      id: "eighth",
      name: "1/8 Note",
      parameters: { time: 250, feedback: 35, mix: 25 },
    },
    {
      id: "dotted",
      name: "Dotted 1/8",
      parameters: { time: 375, feedback: 45, mix: 28 },
    },
    {
      id: "ping-pong",
      name: "Ping Pong",
      parameters: { time: 300, feedback: 50, mix: 35 },
    },
    {
      id: "tape",
      name: "Tape Echo",
      parameters: { time: 350, feedback: 55, mix: 32 },
    },
    {
      id: "ambient",
      name: "Ambient Trail",
      parameters: { time: 600, feedback: 70, mix: 40 },
    },
    {
      id: "rhythmic",
      name: "Rhythmic",
      parameters: { time: 200, feedback: 60, mix: 30 },
    },
  ],
  distortion: [
    {
      id: "subtle",
      name: "Subtle Warmth",
      parameters: { drive: 15, tone: 50, mix: 100 },
    },
    {
      id: "overdrive",
      name: "Overdrive",
      parameters: { drive: 40, tone: 55, mix: 100 },
    },
    {
      id: "crunch",
      name: "Crunch",
      parameters: { drive: 60, tone: 60, mix: 100 },
    },
    { id: "fuzz", name: "Fuzz", parameters: { drive: 85, tone: 45, mix: 100 } },
    {
      id: "bit-crush",
      name: "Bit Crush",
      parameters: { drive: 70, tone: 30, mix: 80 },
    },
    {
      id: "tape-sat",
      name: "Tape Saturation",
      parameters: { drive: 25, tone: 65, mix: 100 },
    },
    { id: "tube", name: "Tube", parameters: { drive: 35, tone: 58, mix: 100 } },
    {
      id: "extreme",
      name: "Extreme",
      parameters: { drive: 100, tone: 50, mix: 100 },
    },
  ],
  chorus: [
    {
      id: "subtle",
      name: "Subtle",
      parameters: { rate: 0.5, depth: 30, mix: 30 },
    },
    {
      id: "classic",
      name: "Classic",
      parameters: { rate: 1, depth: 50, mix: 50 },
    },
    { id: "rich", name: "Rich", parameters: { rate: 0.8, depth: 70, mix: 60 } },
    {
      id: "vibrato",
      name: "Vibrato",
      parameters: { rate: 5, depth: 80, mix: 100 },
    },
    {
      id: "leslie",
      name: "Leslie",
      parameters: { rate: 6, depth: 60, mix: 70 },
    },
    {
      id: "shimmer",
      name: "Shimmer",
      parameters: { rate: 0.3, depth: 40, mix: 45 },
    },
    {
      id: "wide",
      name: "Wide Stereo",
      parameters: { rate: 0.7, depth: 65, mix: 55 },
    },
    {
      id: "dreamy",
      name: "Dreamy",
      parameters: { rate: 0.4, depth: 85, mix: 65 },
    },
  ],
  flanger: [
    {
      id: "subtle",
      name: "Subtle",
      parameters: { rate: 0.2, depth: 30, feedback: 20, mix: 30 },
    },
    {
      id: "jet",
      name: "Jet",
      parameters: { rate: 0.1, depth: 80, feedback: 70, mix: 50 },
    },
    {
      id: "metallic",
      name: "Metallic",
      parameters: { rate: 0.5, depth: 60, feedback: 80, mix: 45 },
    },
    {
      id: "sweep",
      name: "Slow Sweep",
      parameters: { rate: 0.05, depth: 70, feedback: 50, mix: 40 },
    },
    {
      id: "psychedelic",
      name: "Psychedelic",
      parameters: { rate: 0.3, depth: 90, feedback: 85, mix: 60 },
    },
    {
      id: "negative",
      name: "Negative",
      parameters: { rate: 0.4, depth: 50, feedback: -60, mix: 50 },
    },
    {
      id: "through-zero",
      name: "Through Zero",
      parameters: { rate: 0.15, depth: 100, feedback: 40, mix: 55 },
    },
    {
      id: "guitar",
      name: "Guitar",
      parameters: { rate: 0.25, depth: 45, feedback: 55, mix: 35 },
    },
  ],
  phaser: [
    {
      id: "subtle",
      name: "Subtle",
      parameters: { rate: 0.3, depth: 40, stages: 4, feedback: 30, mix: 50 },
    },
    {
      id: "classic",
      name: "Classic",
      parameters: { rate: 0.5, depth: 60, stages: 6, feedback: 50, mix: 50 },
    },
    {
      id: "deep",
      name: "Deep",
      parameters: { rate: 0.2, depth: 90, stages: 8, feedback: 70, mix: 60 },
    },
    {
      id: "funk",
      name: "Funk",
      parameters: { rate: 1.5, depth: 70, stages: 4, feedback: 40, mix: 55 },
    },
    {
      id: "slow-sweep",
      name: "Slow Sweep",
      parameters: { rate: 0.1, depth: 80, stages: 6, feedback: 60, mix: 50 },
    },
    {
      id: "resonant",
      name: "Resonant",
      parameters: { rate: 0.4, depth: 65, stages: 8, feedback: 85, mix: 55 },
    },
    {
      id: "synth",
      name: "Synth",
      parameters: { rate: 2, depth: 75, stages: 4, feedback: 55, mix: 65 },
    },
    {
      id: "vintage",
      name: "Vintage",
      parameters: { rate: 0.6, depth: 55, stages: 6, feedback: 45, mix: 45 },
    },
  ],
  gate: [
    {
      id: "gentle",
      name: "Gentle",
      parameters: { threshold: -50, attack: 5, release: 200, range: -40 },
    },
    {
      id: "drums",
      name: "Drums",
      parameters: { threshold: -35, attack: 0.5, release: 50, range: -80 },
    },
    {
      id: "vocal",
      name: "Vocal",
      parameters: { threshold: -45, attack: 2, release: 150, range: -60 },
    },
    {
      id: "tight",
      name: "Tight",
      parameters: { threshold: -30, attack: 0.2, release: 30, range: -80 },
    },
    {
      id: "snare",
      name: "Snare",
      parameters: { threshold: -25, attack: 0.1, release: 40, range: -80 },
    },
    {
      id: "ambient",
      name: "Ambient",
      parameters: { threshold: -55, attack: 10, release: 300, range: -30 },
    },
    {
      id: "aggressive",
      name: "Aggressive",
      parameters: { threshold: -20, attack: 0.1, release: 20, range: -80 },
    },
    {
      id: "smooth",
      name: "Smooth",
      parameters: { threshold: -40, attack: 8, release: 250, range: -50 },
    },
  ],
  limiter: [
    {
      id: "transparent",
      name: "Transparent",
      parameters: { ceiling: -0.1, release: 150 },
    },
    {
      id: "broadcast",
      name: "Broadcast",
      parameters: { ceiling: -0.3, release: 100 },
    },
    {
      id: "loud",
      name: "Loud Master",
      parameters: { ceiling: -0.1, release: 50 },
    },
    {
      id: "streaming",
      name: "Streaming",
      parameters: { ceiling: -1, release: 200 },
    },
    { id: "vinyl", name: "Vinyl", parameters: { ceiling: -2, release: 300 } },
    {
      id: "brick-wall",
      name: "Brick Wall",
      parameters: { ceiling: 0, release: 10 },
    },
    {
      id: "gentle",
      name: "Gentle",
      parameters: { ceiling: -0.5, release: 250 },
    },
    {
      id: "punchy",
      name: "Punchy",
      parameters: { ceiling: -0.2, release: 80 },
    },
  ],
  deesser: [
    {
      id: "gentle",
      name: "Gentle",
      parameters: { frequency: 6000, threshold: -20, ratio: 3, range: -6 },
    },
    {
      id: "vocal-standard",
      name: "Vocal Standard",
      parameters: { frequency: 7000, threshold: -15, ratio: 4, range: -10 },
    },
    {
      id: "aggressive",
      name: "Aggressive",
      parameters: { frequency: 5500, threshold: -10, ratio: 6, range: -15 },
    },
    {
      id: "bright-vocal",
      name: "Bright Vocal",
      parameters: { frequency: 8000, threshold: -18, ratio: 3, range: -8 },
    },
    {
      id: "speech",
      name: "Speech",
      parameters: { frequency: 6500, threshold: -12, ratio: 5, range: -12 },
    },
    {
      id: "female-vocal",
      name: "Female Vocal",
      parameters: { frequency: 7500, threshold: -16, ratio: 4, range: -9 },
    },
    {
      id: "male-vocal",
      name: "Male Vocal",
      parameters: { frequency: 5000, threshold: -14, ratio: 4, range: -10 },
    },
    {
      id: "broadcast",
      name: "Broadcast",
      parameters: { frequency: 6000, threshold: -18, ratio: 3, range: -6 },
    },
  ],
  vocoder: [
    {
      id: "robot",
      name: "Robot Voice",
      parameters: { bands: 16, modDepth: 100, attack: 5, release: 50 },
    },
    {
      id: "classic",
      name: "Classic Vocoder",
      parameters: { bands: 24, modDepth: 80, attack: 10, release: 100 },
    },
    {
      id: "warm",
      name: "Warm Vocoder",
      parameters: { bands: 12, modDepth: 70, attack: 20, release: 150 },
    },
    {
      id: "talk-box",
      name: "Talk Box",
      parameters: { bands: 8, modDepth: 90, attack: 2, release: 30 },
    },
    {
      id: "whisper",
      name: "Whisper",
      parameters: { bands: 32, modDepth: 50, attack: 30, release: 200 },
    },
    {
      id: "synth-voice",
      name: "Synth Voice",
      parameters: { bands: 20, modDepth: 100, attack: 1, release: 20 },
    },
    {
      id: "choir",
      name: "Choir Effect",
      parameters: { bands: 16, modDepth: 60, attack: 15, release: 120 },
    },
    {
      id: "alien",
      name: "Alien",
      parameters: { bands: 48, modDepth: 100, attack: 1, release: 10 },
    },
  ],
  dynamiceq: [
    {
      id: "surgical",
      name: "Surgical",
      parameters: { frequency: 3000, gain: -6, threshold: -20, ratio: 4 },
    },
    {
      id: "vocal-tame",
      name: "Vocal Tame",
      parameters: { frequency: 2500, gain: -4, threshold: -15, ratio: 3 },
    },
    {
      id: "bass-control",
      name: "Bass Control",
      parameters: { frequency: 80, gain: -8, threshold: -12, ratio: 5 },
    },
    {
      id: "harsh-tame",
      name: "Harsh Tame",
      parameters: { frequency: 4000, gain: -6, threshold: -18, ratio: 4 },
    },
    {
      id: "mud-cut",
      name: "Mud Cut",
      parameters: { frequency: 300, gain: -5, threshold: -20, ratio: 3 },
    },
    {
      id: "presence-boost",
      name: "Presence Boost",
      parameters: { frequency: 5000, gain: 4, threshold: -25, ratio: 2 },
    },
    {
      id: "multiband-comp",
      name: "Multiband Comp",
      parameters: { frequency: 1000, gain: -3, threshold: -15, ratio: 4 },
    },
    {
      id: "de-honk",
      name: "De-Honk",
      parameters: { frequency: 800, gain: -6, threshold: -16, ratio: 4 },
    },
  ],
};

const PLUGIN_INFO: Record<
  PluginType,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    tips: string[];
  }
> = {
  eq: {
    title: "Parametric EQ",
    description:
      "Shape the tonal balance of your audio with precision frequency control.",
    icon: <Activity className="h-5 w-5" />,
    color: "#3b82f6",
    tips: [
      "Cut before boosting - remove problem frequencies first",
      "Use narrow Q for surgical cuts, wide Q for gentle shaping",
      "High-pass filter vocals around 80-100Hz to remove rumble",
      "Boost presence (2-5kHz) to bring vocals forward in the mix",
    ],
  },
  compressor: {
    title: "Compressor",
    description:
      "Control dynamics and add punch to your tracks with professional compression.",
    icon: <Volume2 className="h-5 w-5" />,
    color: "#f59e0b",
    tips: [
      "Fast attack for control, slow attack for punch",
      "Use 2:1-4:1 for gentle compression, 8:1+ for limiting",
      "Match makeup gain to perceived loudness reduction",
      "Parallel compression: blend compressed with dry for punch",
    ],
  },
  reverb: {
    title: "Reverb",
    description: "Add space and depth with natural-sounding room simulations.",
    icon: <Waves className="h-5 w-5" />,
    color: "#8b5cf6",
    tips: [
      "Use short reverbs for intimate sounds, long for epic ambience",
      "Roll off high frequencies on reverb to keep it behind the source",
      "Pre-delay separates the dry sound from the reverb tail",
      "Less is more - subtle reverb often works best in dense mixes",
    ],
  },
  delay: {
    title: "Delay",
    description:
      "Create rhythmic echoes and spatial depth with tempo-synced repeats.",
    icon: <Clock className="h-5 w-5" />,
    color: "#06b6d4",
    tips: [
      "Sync delay time to tempo: 1/4 note = 60000/BPM ms",
      "Dotted 1/8 delays create classic rhythmic interest",
      "High feedback for ambient trails, low for subtle thickening",
      "Filter the delays to keep them from cluttering the mix",
    ],
  },
  distortion: {
    title: "Distortion",
    description:
      "Add harmonic saturation from subtle warmth to aggressive overdrive.",
    icon: <Sparkles className="h-5 w-5" />,
    color: "#ef4444",
    tips: [
      "Subtle saturation adds warmth and presence to digital recordings",
      "Use on parallel bus for added grit without losing dynamics",
      "Roll off highs after distortion to tame harshness",
      "Try on drums for more aggressive, punchy tones",
    ],
  },
  chorus: {
    title: "Chorus",
    description:
      "Thicken and widen sounds with modulated pitch and time variations.",
    icon: <Music className="h-5 w-5" />,
    color: "#10b981",
    tips: [
      "Slow rate + moderate depth = lush, subtle movement",
      "Fast rate creates vibrato-like effects",
      "Use sparingly on bass to avoid phase issues",
      "Great for making synth pads sound bigger and wider",
    ],
  },
  flanger: {
    title: "Flanger",
    description:
      "Create sweeping jet-like effects with comb filtering modulation.",
    icon: <Zap className="h-5 w-5" />,
    color: "#ec4899",
    tips: [
      "Low rate + high depth = classic jet plane sweep",
      "High feedback creates more pronounced metallic tones",
      "Negative feedback produces different harmonic content",
      "Automate rate for dramatic effect builds",
    ],
  },
  phaser: {
    title: "Phaser",
    description:
      "Add swirling, psychedelic movement with phase-shifted filtering.",
    icon: <Wind className="h-5 w-5" />,
    color: "#a855f7",
    tips: [
      "More stages = deeper, more complex phasing",
      "High feedback creates more resonant peaks",
      "Classic effect for electric piano and guitar",
      "Try slow rates on pads for subtle motion",
    ],
  },
  gate: {
    title: "Noise Gate",
    description: "Clean up audio by silencing signals below a threshold.",
    icon: <Volume2 className="h-5 w-5" />,
    color: "#64748b",
    tips: [
      "Set threshold just above the noise floor",
      "Fast attack for drums, slower for natural sounds",
      "Use range instead of full silence for more natural decay",
      "Gate before reverb to prevent noisy reverb tails",
    ],
  },
  limiter: {
    title: "Limiter",
    description: "Maximize loudness and prevent clipping on your master bus.",
    icon: <Volume2 className="h-5 w-5" />,
    color: "#dc2626",
    tips: [
      "Set ceiling at -0.1 to -1.0 dB for streaming headroom",
      "Aim for 2-4dB of gain reduction for transparent limiting",
      "Fast release for punch, slow release for smoother sound",
      "Always check for distortion artifacts at high gains",
    ],
  },
  deesser: {
    title: "De-Esser",
    description:
      "Remove harsh sibilance from vocals with frequency-targeted compression.",
    icon: <Volume2 className="h-5 w-5" />,
    color: "#14b8a6",
    tips: [
      "Focus on 4-8kHz range where sibilance typically occurs",
      "Use split-band mode for more transparent processing",
      "Female vocals often need higher frequency settings (7-9kHz)",
      "Avoid over-processing which can cause lisping artifacts",
    ],
  },
  vocoder: {
    title: "Vocoder",
    description:
      "Create robotic voice effects by modulating a carrier with voice input.",
    icon: <Volume2 className="h-5 w-5" />,
    color: "#d946ef",
    tips: [
      "Use a synth pad as the carrier for classic vocoder sounds",
      "More bands = clearer speech intelligibility",
      "Shorter attack/release = more robotic character",
      "Try different carrier waveforms for varied timbres",
    ],
  },
  dynamiceq: {
    title: "Dynamic EQ",
    description:
      "Apply frequency-dependent compression for surgical tone shaping.",
    icon: <Activity className="h-5 w-5" />,
    color: "#0ea5e9",
    tips: [
      "Use for taming problem frequencies only when they occur",
      "More transparent than static EQ for harsh vocal frequencies",
      "Great for controlling bass without losing punch on quiet passages",
      "Combine with regular EQ for comprehensive tone shaping",
    ],
  },
};

export const EXTENDED_PARAMETERS: Record<
  PluginType,
  {
    name: string;
    key: string;
    min: number;
    max: number;
    default: number;
    unit?: string;
    description?: string;
  }[]
> = {
  eq: [
    {
      name: "Low Gain",
      key: "low",
      min: -12,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Boost or cut low frequencies",
    },
    {
      name: "Low Freq",
      key: "lowFreq",
      min: 30,
      max: 400,
      default: 80,
      unit: "Hz",
      description: "Low band center frequency",
    },
    {
      name: "Mid Gain",
      key: "mid",
      min: -12,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Boost or cut mid frequencies",
    },
    {
      name: "Mid Freq",
      key: "midFreq",
      min: 200,
      max: 8000,
      default: 1000,
      unit: "Hz",
      description: "Mid band center frequency",
    },
    {
      name: "Mid Q",
      key: "midQ",
      min: 0.1,
      max: 10,
      default: 1,
      description: "Mid band bandwidth (Q factor)",
    },
    {
      name: "High Gain",
      key: "high",
      min: -12,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Boost or cut high frequencies",
    },
    {
      name: "High Freq",
      key: "highFreq",
      min: 2000,
      max: 16000,
      default: 8000,
      unit: "Hz",
      description: "High band center frequency",
    },
    {
      name: "Output",
      key: "output",
      min: -12,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Output gain adjustment",
    },
  ],
  compressor: [
    {
      name: "Threshold",
      key: "threshold",
      min: -60,
      max: 0,
      default: -20,
      unit: "dB",
      description: "Level where compression starts",
    },
    {
      name: "Ratio",
      key: "ratio",
      min: 1,
      max: 20,
      default: 4,
      description: "Compression ratio (input:output)",
    },
    {
      name: "Attack",
      key: "attack",
      min: 0.1,
      max: 100,
      default: 10,
      unit: "ms",
      description: "Time to reach full compression",
    },
    {
      name: "Release",
      key: "release",
      min: 10,
      max: 1000,
      default: 100,
      unit: "ms",
      description: "Time to release compression",
    },
    {
      name: "Knee",
      key: "knee",
      min: 0,
      max: 30,
      default: 6,
      unit: "dB",
      description: "Soft knee width",
    },
    {
      name: "Makeup",
      key: "makeup",
      min: 0,
      max: 24,
      default: 0,
      unit: "dB",
      description: "Output gain compensation",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 100,
      unit: "%",
      description: "Wet/dry blend (parallel compression)",
    },
    {
      name: "Sidechain HPF",
      key: "scHpf",
      min: 20,
      max: 300,
      default: 20,
      unit: "Hz",
      description: "Sidechain high-pass filter",
    },
  ],
  reverb: [
    {
      name: "Size",
      key: "size",
      min: 0,
      max: 100,
      default: 50,
      description: "Room size simulation",
    },
    {
      name: "Decay",
      key: "decay",
      min: 0.1,
      max: 10,
      default: 2,
      unit: "s",
      description: "Reverb tail length",
    },
    {
      name: "Pre-Delay",
      key: "preDelay",
      min: 0,
      max: 200,
      default: 20,
      unit: "ms",
      description: "Initial delay before reverb",
    },
    {
      name: "Damping",
      key: "damping",
      min: 0,
      max: 100,
      default: 50,
      description: "High frequency absorption",
    },
    {
      name: "Diffusion",
      key: "diffusion",
      min: 0,
      max: 100,
      default: 70,
      description: "Echo density",
    },
    {
      name: "Low Cut",
      key: "lowCut",
      min: 20,
      max: 500,
      default: 80,
      unit: "Hz",
      description: "Remove low frequencies from reverb",
    },
    {
      name: "High Cut",
      key: "highCut",
      min: 1000,
      max: 20000,
      default: 12000,
      unit: "Hz",
      description: "Remove high frequencies from reverb",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 30,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  delay: [
    {
      name: "Time",
      key: "time",
      min: 1,
      max: 2000,
      default: 250,
      unit: "ms",
      description: "Delay time",
    },
    {
      name: "Feedback",
      key: "feedback",
      min: 0,
      max: 95,
      default: 40,
      unit: "%",
      description: "Number of repeats",
    },
    {
      name: "Low Cut",
      key: "lowCut",
      min: 20,
      max: 500,
      default: 100,
      unit: "Hz",
      description: "Remove low frequencies from delays",
    },
    {
      name: "High Cut",
      key: "highCut",
      min: 1000,
      max: 20000,
      default: 8000,
      unit: "Hz",
      description: "Remove high frequencies from delays",
    },
    {
      name: "Modulation",
      key: "modulation",
      min: 0,
      max: 100,
      default: 0,
      description: "Pitch modulation amount",
    },
    {
      name: "Stereo Spread",
      key: "spread",
      min: 0,
      max: 100,
      default: 50,
      description: "Stereo width of delays",
    },
    {
      name: "Ping Pong",
      key: "pingPong",
      min: 0,
      max: 100,
      default: 0,
      description: "Left/right alternation",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 30,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  distortion: [
    {
      name: "Drive",
      key: "drive",
      min: 0,
      max: 100,
      default: 50,
      description: "Distortion amount",
    },
    {
      name: "Tone",
      key: "tone",
      min: 0,
      max: 100,
      default: 50,
      description: "Brightness control",
    },
    {
      name: "Character",
      key: "character",
      min: 0,
      max: 100,
      default: 50,
      description: "Distortion type/flavor",
    },
    {
      name: "Input Gain",
      key: "inputGain",
      min: -12,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Pre-distortion gain",
    },
    {
      name: "Output Gain",
      key: "outputGain",
      min: -12,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Post-distortion gain",
    },
    {
      name: "Low Cut",
      key: "lowCut",
      min: 20,
      max: 500,
      default: 20,
      unit: "Hz",
      description: "Pre-filter low frequencies",
    },
    {
      name: "High Cut",
      key: "highCut",
      min: 1000,
      max: 20000,
      default: 20000,
      unit: "Hz",
      description: "Post-filter high frequencies",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 100,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  chorus: [
    {
      name: "Rate",
      key: "rate",
      min: 0.1,
      max: 10,
      default: 1,
      unit: "Hz",
      description: "Modulation speed",
    },
    {
      name: "Depth",
      key: "depth",
      min: 0,
      max: 100,
      default: 50,
      description: "Modulation intensity",
    },
    {
      name: "Delay",
      key: "delay",
      min: 1,
      max: 50,
      default: 10,
      unit: "ms",
      description: "Base delay time",
    },
    {
      name: "Feedback",
      key: "feedback",
      min: 0,
      max: 100,
      default: 0,
      description: "Feedback amount",
    },
    {
      name: "Voices",
      key: "voices",
      min: 1,
      max: 4,
      default: 2,
      description: "Number of chorus voices",
    },
    {
      name: "Stereo Spread",
      key: "spread",
      min: 0,
      max: 100,
      default: 80,
      description: "Stereo width",
    },
    {
      name: "High Cut",
      key: "highCut",
      min: 1000,
      max: 20000,
      default: 12000,
      unit: "Hz",
      description: "Filter high frequencies",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 50,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  flanger: [
    {
      name: "Rate",
      key: "rate",
      min: 0.01,
      max: 10,
      default: 0.3,
      unit: "Hz",
      description: "Modulation speed",
    },
    {
      name: "Depth",
      key: "depth",
      min: 0,
      max: 100,
      default: 60,
      description: "Modulation intensity",
    },
    {
      name: "Delay",
      key: "delay",
      min: 0.1,
      max: 10,
      default: 2,
      unit: "ms",
      description: "Base delay time",
    },
    {
      name: "Feedback",
      key: "feedback",
      min: -100,
      max: 100,
      default: 50,
      description: "Feedback (negative for hollow sound)",
    },
    {
      name: "Manual",
      key: "manual",
      min: 0,
      max: 100,
      default: 50,
      description: "Manual sweep position",
    },
    {
      name: "Stereo Phase",
      key: "stereoPhase",
      min: 0,
      max: 180,
      default: 90,
      unit: "°",
      description: "Phase offset between channels",
    },
    {
      name: "High Cut",
      key: "highCut",
      min: 1000,
      max: 20000,
      default: 15000,
      unit: "Hz",
      description: "Filter high frequencies",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 50,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  phaser: [
    {
      name: "Rate",
      key: "rate",
      min: 0.01,
      max: 10,
      default: 0.5,
      unit: "Hz",
      description: "Modulation speed",
    },
    {
      name: "Depth",
      key: "depth",
      min: 0,
      max: 100,
      default: 60,
      description: "Modulation intensity",
    },
    {
      name: "Stages",
      key: "stages",
      min: 2,
      max: 12,
      default: 6,
      description: "Number of phase stages",
    },
    {
      name: "Feedback",
      key: "feedback",
      min: 0,
      max: 100,
      default: 50,
      description: "Resonance/feedback",
    },
    {
      name: "Center Freq",
      key: "centerFreq",
      min: 100,
      max: 5000,
      default: 1000,
      unit: "Hz",
      description: "Center frequency",
    },
    {
      name: "Spread",
      key: "spread",
      min: 0,
      max: 100,
      default: 50,
      description: "Frequency range",
    },
    {
      name: "Stereo Phase",
      key: "stereoPhase",
      min: 0,
      max: 180,
      default: 90,
      unit: "°",
      description: "Phase offset between channels",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 50,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  gate: [
    {
      name: "Threshold",
      key: "threshold",
      min: -80,
      max: 0,
      default: -40,
      unit: "dB",
      description: "Level to open gate",
    },
    {
      name: "Attack",
      key: "attack",
      min: 0.1,
      max: 50,
      default: 1,
      unit: "ms",
      description: "Time to open gate",
    },
    {
      name: "Hold",
      key: "hold",
      min: 0,
      max: 500,
      default: 50,
      unit: "ms",
      description: "Time to hold gate open",
    },
    {
      name: "Release",
      key: "release",
      min: 10,
      max: 500,
      default: 100,
      unit: "ms",
      description: "Time to close gate",
    },
    {
      name: "Range",
      key: "range",
      min: -80,
      max: 0,
      default: -80,
      unit: "dB",
      description: "Attenuation when closed",
    },
    {
      name: "Hysteresis",
      key: "hysteresis",
      min: 0,
      max: 12,
      default: 3,
      unit: "dB",
      description: "Threshold difference for closing",
    },
    {
      name: "Sidechain HPF",
      key: "scHpf",
      min: 20,
      max: 500,
      default: 20,
      unit: "Hz",
      description: "Sidechain high-pass filter",
    },
    {
      name: "Look-Ahead",
      key: "lookAhead",
      min: 0,
      max: 10,
      default: 0,
      unit: "ms",
      description: "Anticipate transients",
    },
  ],
  limiter: [
    {
      name: "Ceiling",
      key: "ceiling",
      min: -12,
      max: 0,
      default: -0.3,
      unit: "dB",
      description: "Maximum output level",
    },
    {
      name: "Threshold",
      key: "threshold",
      min: -24,
      max: 0,
      default: -6,
      unit: "dB",
      description: "Level where limiting starts",
    },
    {
      name: "Attack",
      key: "attack",
      min: 0.01,
      max: 10,
      default: 0.1,
      unit: "ms",
      description: "Attack time",
    },
    {
      name: "Release",
      key: "release",
      min: 10,
      max: 1000,
      default: 100,
      unit: "ms",
      description: "Release time",
    },
    {
      name: "Knee",
      key: "knee",
      min: 0,
      max: 12,
      default: 0,
      unit: "dB",
      description: "Soft knee width",
    },
    {
      name: "Look-Ahead",
      key: "lookAhead",
      min: 0,
      max: 10,
      default: 1,
      unit: "ms",
      description: "Anticipate peaks",
    },
    {
      name: "Stereo Link",
      key: "stereoLink",
      min: 0,
      max: 100,
      default: 100,
      unit: "%",
      description: "Channel linking",
    },
    {
      name: "Auto Release",
      key: "autoRelease",
      min: 0,
      max: 100,
      default: 50,
      description: "Program-dependent release",
    },
  ],
  deesser: [
    {
      name: "Frequency",
      key: "frequency",
      min: 2000,
      max: 12000,
      default: 6000,
      unit: "Hz",
      description: "Target sibilance frequency",
    },
    {
      name: "Threshold",
      key: "threshold",
      min: -40,
      max: 0,
      default: -15,
      unit: "dB",
      description: "Level to trigger de-essing",
    },
    {
      name: "Ratio",
      key: "ratio",
      min: 1,
      max: 10,
      default: 4,
      description: "Compression ratio",
    },
    {
      name: "Range",
      key: "range",
      min: -20,
      max: 0,
      default: -10,
      unit: "dB",
      description: "Maximum gain reduction",
    },
    {
      name: "Bandwidth",
      key: "bandwidth",
      min: 0.5,
      max: 4,
      default: 1.5,
      description: "Q/bandwidth of detection",
    },
    {
      name: "Attack",
      key: "attack",
      min: 0.1,
      max: 20,
      default: 2,
      unit: "ms",
      description: "Attack time",
    },
    {
      name: "Release",
      key: "release",
      min: 10,
      max: 200,
      default: 50,
      unit: "ms",
      description: "Release time",
    },
    {
      name: "Listen",
      key: "listen",
      min: 0,
      max: 100,
      default: 0,
      description: "Solo detection band",
    },
  ],
  vocoder: [
    {
      name: "Bands",
      key: "bands",
      min: 4,
      max: 64,
      default: 16,
      description: "Number of frequency bands",
    },
    {
      name: "Mod Depth",
      key: "modDepth",
      min: 0,
      max: 100,
      default: 100,
      unit: "%",
      description: "Modulation intensity",
    },
    {
      name: "Attack",
      key: "attack",
      min: 0.1,
      max: 100,
      default: 5,
      unit: "ms",
      description: "Envelope attack",
    },
    {
      name: "Release",
      key: "release",
      min: 10,
      max: 500,
      default: 50,
      unit: "ms",
      description: "Envelope release",
    },
    {
      name: "High Freq",
      key: "highFreq",
      min: 2000,
      max: 16000,
      default: 12000,
      unit: "Hz",
      description: "Upper frequency limit",
    },
    {
      name: "Low Freq",
      key: "lowFreq",
      min: 50,
      max: 500,
      default: 100,
      unit: "Hz",
      description: "Lower frequency limit",
    },
    {
      name: "Formant Shift",
      key: "formantShift",
      min: -24,
      max: 24,
      default: 0,
      unit: "st",
      description: "Shift formant frequencies",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 100,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
  dynamiceq: [
    {
      name: "Frequency",
      key: "frequency",
      min: 20,
      max: 20000,
      default: 3000,
      unit: "Hz",
      description: "Target frequency",
    },
    {
      name: "Gain",
      key: "gain",
      min: -18,
      max: 18,
      default: -6,
      unit: "dB",
      description: "Max gain change",
    },
    {
      name: "Threshold",
      key: "threshold",
      min: -60,
      max: 0,
      default: -20,
      unit: "dB",
      description: "Trigger level",
    },
    {
      name: "Ratio",
      key: "ratio",
      min: 1,
      max: 10,
      default: 4,
      description: "Compression ratio",
    },
    {
      name: "Q",
      key: "q",
      min: 0.1,
      max: 10,
      default: 1.5,
      description: "Bandwidth",
    },
    {
      name: "Attack",
      key: "attack",
      min: 0.1,
      max: 100,
      default: 5,
      unit: "ms",
      description: "Attack time",
    },
    {
      name: "Release",
      key: "release",
      min: 10,
      max: 1000,
      default: 100,
      unit: "ms",
      description: "Release time",
    },
    {
      name: "Mix",
      key: "mix",
      min: 0,
      max: 100,
      default: 100,
      unit: "%",
      description: "Wet/dry blend",
    },
  ],
};

export function PluginControlDialog({
  open,
  onOpenChange,
  plugin,
  onParameterChange,
  onBypassChange,
  onReset,
}: PluginControlDialogProps) {
  const [activeTab, setActiveTab] = useState("controls");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const info = plugin ? PLUGIN_INFO[plugin.type] : null;
  const presets = plugin ? PLUGIN_PRESETS[plugin.type] || [] : [];
  const extendedParams = plugin ? EXTENDED_PARAMETERS[plugin.type] || [] : [];

  const handlePresetSelect = (preset: PluginPreset) => {
    setSelectedPreset(preset.id);
    Object.entries(preset.parameters).forEach(([key, value]) => {
      onParameterChange(key, value);
    });
  };

  const formatValue = (value: number, param: (typeof extendedParams)[0]) => {
    const decimals = param.max <= 1 ? 2 : param.max <= 10 ? 1 : 0;
    return value.toFixed(decimals) + (param.unit || "");
  };

  if (!plugin || !info) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          background: "linear-gradient(180deg, #1a1a2e 0%, #16162a 100%)",
          border: `1px solid ${info.color}40`,
        }}
      >
        <DialogHeader className="flex-shrink-0 pb-2 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: `${info.color}20`, color: info.color }}
              >
                {info.icon}
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-white">
                  {info.title}
                </DialogTitle>
                <p className="text-xs text-white/60">{info.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="h-8 px-3 text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5">
                <span className="text-xs text-white/60">Bypass</span>
                <Switch
                  checked={!plugin.bypass}
                  onCheckedChange={(checked) => onBypassChange(!checked)}
                />
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0 mt-4"
        >
          <TabsList className="grid w-full grid-cols-3 bg-white/5 mb-4">
            <TabsTrigger value="controls" className="text-xs">
              Controls
            </TabsTrigger>
            <TabsTrigger value="presets" className="text-xs">
              Presets
            </TabsTrigger>
            <TabsTrigger value="tips" className="text-xs">
              Tips
            </TabsTrigger>
          </TabsList>

          <TabsContent value="controls" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-[400px] pr-4">
              <div className="grid grid-cols-4 gap-6 p-4">
                {extendedParams.map((param) => {
                  const value = plugin.parameters[param.key] ?? param.default;
                  return (
                    <div
                      key={param.key}
                      className="flex flex-col items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/8 transition-colors"
                    >
                      <Knob
                        value={value}
                        onChange={(val) => onParameterChange(param.key, val)}
                        min={param.min}
                        max={param.max}
                        size={60}
                        color={info.color}
                        disabled={plugin.bypass}
                      />
                      <div className="text-center">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                          {param.name}
                        </div>
                        <div className="text-sm font-mono text-white mt-0.5">
                          {formatValue(value, param)}
                        </div>
                      </div>
                      {param.description && (
                        <div className="text-[9px] text-white/40 text-center leading-tight">
                          {param.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="presets" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-[400px]">
              <div className="grid grid-cols-2 gap-3 p-4">
                {presets.map((preset) => (
                  <motion.button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`p-4 rounded-xl text-left transition-all ${
                      selectedPreset === preset.id
                        ? "bg-white/15 ring-2"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                    style={{
                      ringColor:
                        selectedPreset === preset.id ? info.color : undefined,
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="font-medium text-white text-sm">
                      {preset.name}
                    </div>
                    <div className="text-xs text-white/50 mt-1">
                      {Object.entries(preset.parameters)
                        .map(([key, val]) => {
                          const param = extendedParams.find(
                            (p) => p.key === key,
                          );
                          return param
                            ? `${param.name}: ${val}${param.unit || ""}`
                            : null;
                        })
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(" · ")}
                    </div>
                  </motion.button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tips" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-4">
                <h4 className="text-sm font-semibold text-white mb-4">
                  Pro Tips
                </h4>
                {info.tips.map((tip, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex gap-3 p-4 rounded-xl bg-white/5"
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={{
                        background: `${info.color}30`,
                        color: info.color,
                      }}
                    >
                      {index + 1}
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed">
                      {tip}
                    </p>
                  </motion.div>
                ))}

                <div className="mt-6 p-4 rounded-xl border border-white/10 bg-white/5">
                  <h5 className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
                    Keyboard Shortcuts
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
                    <div>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80">
                        B
                      </kbd>{" "}
                      Toggle bypass
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80">
                        R
                      </kbd>{" "}
                      Reset to default
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80">
                        ↑/↓
                      </kbd>{" "}
                      Adjust value
                    </div>
                    <div>
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80">
                        Shift
                      </kbd>{" "}
                      Fine adjust
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex-shrink-0 pt-4 mt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${plugin.bypass ? "bg-yellow-500" : "bg-green-500"}`}
            />
            <span className="text-xs text-white/60">
              {plugin.bypass ? "Bypassed" : "Active"}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
