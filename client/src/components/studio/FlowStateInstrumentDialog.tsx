import { useState, useCallback } from "react";
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
import { cn } from "@/lib/utils";
import { Power, RotateCcw, Music, Piano, Drum, Guitar, Mic2, Waves, Zap, Settings, Layers, Activity } from "lucide-react";

export type InstrumentType =
  | "synth"
  | "sampler"
  | "drumMachine"
  | "piano"
  | "organ"
  | "bass"
  | "strings"
  | "brass"
  | "pad"
  | "lead";

export interface InstrumentInstance {
  id: string;
  type: InstrumentType;
  name: string;
  bypass: boolean;
  parameters: Record<string, number>;
  preset?: string;
}

interface InstrumentPreset {
  id: string;
  name: string;
  parameters: Record<string, number>;
}

interface FlowStateInstrumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instrument: InstrumentInstance | null;
  onParameterChange: (key: string, value: number) => void;
  onBypassChange: (bypass: boolean) => void;
  onPresetChange?: (presetId: string) => void;
  onReset: () => void;
}

const INSTRUMENT_PRESETS: Record<InstrumentType, InstrumentPreset[]> = {
  synth: [
    {
      id: "init",
      name: "Init Patch",
      parameters: {
        osc1: 50,
        osc2: 0,
        filter: 100,
        resonance: 0,
        attack: 0,
        decay: 50,
        sustain: 80,
        release: 30,
        lfo: 0,
        detune: 0,
      },
    },
    {
      id: "saw-lead",
      name: "Saw Lead",
      parameters: {
        osc1: 100,
        osc2: 50,
        filter: 70,
        resonance: 30,
        attack: 0,
        decay: 30,
        sustain: 70,
        release: 20,
        lfo: 10,
        detune: 5,
      },
    },
    {
      id: "super-saw",
      name: "Super Saw",
      parameters: {
        osc1: 100,
        osc2: 100,
        filter: 80,
        resonance: 20,
        attack: 5,
        decay: 40,
        sustain: 80,
        release: 40,
        lfo: 5,
        detune: 15,
      },
    },
    {
      id: "pluck",
      name: "Pluck",
      parameters: {
        osc1: 80,
        osc2: 30,
        filter: 90,
        resonance: 40,
        attack: 0,
        decay: 20,
        sustain: 0,
        release: 10,
        lfo: 0,
        detune: 0,
      },
    },
    {
      id: "pad",
      name: "Soft Pad",
      parameters: {
        osc1: 40,
        osc2: 60,
        filter: 50,
        resonance: 10,
        attack: 80,
        decay: 60,
        sustain: 90,
        release: 70,
        lfo: 20,
        detune: 8,
      },
    },
    {
      id: "bass",
      name: "Sub Bass",
      parameters: {
        osc1: 100,
        osc2: 20,
        filter: 30,
        resonance: 0,
        attack: 0,
        decay: 50,
        sustain: 100,
        release: 20,
        lfo: 0,
        detune: 0,
      },
    },
    {
      id: "arp",
      name: "Arp Synth",
      parameters: {
        osc1: 70,
        osc2: 40,
        filter: 75,
        resonance: 35,
        attack: 0,
        decay: 15,
        sustain: 40,
        release: 15,
        lfo: 30,
        detune: 3,
      },
    },
    {
      id: "bell",
      name: "FM Bell",
      parameters: {
        osc1: 60,
        osc2: 80,
        filter: 100,
        resonance: 0,
        attack: 0,
        decay: 60,
        sustain: 30,
        release: 50,
        lfo: 5,
        detune: 0,
      },
    },
  ],
  sampler: [
    {
      id: "init",
      name: "Default",
      parameters: {
        start: 0,
        end: 100,
        loop: 0,
        attack: 0,
        decay: 50,
        sustain: 100,
        release: 20,
        pitch: 50,
        filter: 100,
      },
    },
    {
      id: "one-shot",
      name: "One Shot",
      parameters: {
        start: 0,
        end: 100,
        loop: 0,
        attack: 0,
        decay: 100,
        sustain: 100,
        release: 10,
        pitch: 50,
        filter: 100,
      },
    },
    {
      id: "loop",
      name: "Loop Mode",
      parameters: {
        start: 0,
        end: 100,
        loop: 100,
        attack: 0,
        decay: 50,
        sustain: 100,
        release: 30,
        pitch: 50,
        filter: 100,
      },
    },
    {
      id: "pad",
      name: "Pad Mode",
      parameters: {
        start: 0,
        end: 100,
        loop: 50,
        attack: 30,
        decay: 60,
        sustain: 90,
        release: 60,
        pitch: 50,
        filter: 80,
      },
    },
    {
      id: "chop",
      name: "Chop",
      parameters: {
        start: 25,
        end: 75,
        loop: 0,
        attack: 0,
        decay: 30,
        sustain: 80,
        release: 10,
        pitch: 50,
        filter: 100,
      },
    },
  ],
  drumMachine: [
    {
      id: "classic",
      name: "Classic 808",
      parameters: {
        kick: 80,
        snare: 70,
        hihat: 60,
        clap: 65,
        tom: 55,
        cymbal: 50,
        swing: 0,
        attack: 0,
        decay: 50,
      },
    },
    {
      id: "909",
      name: "909 Kit",
      parameters: {
        kick: 85,
        snare: 75,
        hihat: 65,
        clap: 60,
        tom: 50,
        cymbal: 55,
        swing: 5,
        attack: 0,
        decay: 40,
      },
    },
    {
      id: "trap",
      name: "Trap Kit",
      parameters: {
        kick: 100,
        snare: 60,
        hihat: 80,
        clap: 70,
        tom: 40,
        cymbal: 45,
        swing: 10,
        attack: 0,
        decay: 60,
      },
    },
    {
      id: "lofi",
      name: "Lo-Fi",
      parameters: {
        kick: 65,
        snare: 55,
        hihat: 45,
        clap: 50,
        tom: 40,
        cymbal: 35,
        swing: 30,
        attack: 5,
        decay: 70,
      },
    },
    {
      id: "acoustic",
      name: "Acoustic",
      parameters: {
        kick: 70,
        snare: 80,
        hihat: 70,
        clap: 0,
        tom: 75,
        cymbal: 65,
        swing: 0,
        attack: 0,
        decay: 45,
      },
    },
  ],
  piano: [
    {
      id: "grand",
      name: "Grand Piano",
      parameters: {
        brightness: 50,
        resonance: 60,
        hammer: 50,
        sustain: 70,
        release: 40,
        stereo: 60,
        dynamics: 70,
        tone: 50,
      },
    },
    {
      id: "upright",
      name: "Upright",
      parameters: {
        brightness: 40,
        resonance: 40,
        hammer: 60,
        sustain: 50,
        release: 30,
        stereo: 30,
        dynamics: 60,
        tone: 45,
      },
    },
    {
      id: "electric",
      name: "Electric Piano",
      parameters: {
        brightness: 60,
        resonance: 30,
        hammer: 40,
        sustain: 60,
        release: 35,
        stereo: 50,
        dynamics: 50,
        tone: 55,
      },
    },
    {
      id: "rhodes",
      name: "Rhodes",
      parameters: {
        brightness: 45,
        resonance: 25,
        hammer: 30,
        sustain: 55,
        release: 45,
        stereo: 40,
        dynamics: 65,
        tone: 40,
      },
    },
    {
      id: "wurlitzer",
      name: "Wurlitzer",
      parameters: {
        brightness: 55,
        resonance: 35,
        hammer: 45,
        sustain: 45,
        release: 25,
        stereo: 35,
        dynamics: 55,
        tone: 60,
      },
    },
    {
      id: "bright",
      name: "Bright Grand",
      parameters: {
        brightness: 75,
        resonance: 70,
        hammer: 55,
        sustain: 75,
        release: 45,
        stereo: 70,
        dynamics: 75,
        tone: 65,
      },
    },
  ],
  organ: [
    {
      id: "church",
      name: "Church Organ",
      parameters: {
        drawbar1: 80,
        drawbar2: 60,
        drawbar3: 50,
        drawbar4: 40,
        leslie: 30,
        drive: 0,
        click: 0,
        reverb: 70,
      },
    },
    {
      id: "hammond",
      name: "Hammond B3",
      parameters: {
        drawbar1: 88,
        drawbar2: 80,
        drawbar3: 68,
        drawbar4: 50,
        leslie: 60,
        drive: 30,
        click: 50,
        reverb: 30,
      },
    },
    {
      id: "gospel",
      name: "Gospel",
      parameters: {
        drawbar1: 100,
        drawbar2: 90,
        drawbar3: 80,
        drawbar4: 60,
        leslie: 80,
        drive: 40,
        click: 60,
        reverb: 40,
      },
    },
    {
      id: "jazz",
      name: "Jazz Organ",
      parameters: {
        drawbar1: 70,
        drawbar2: 65,
        drawbar3: 55,
        drawbar4: 45,
        leslie: 50,
        drive: 20,
        click: 40,
        reverb: 35,
      },
    },
    {
      id: "rock",
      name: "Rock Organ",
      parameters: {
        drawbar1: 95,
        drawbar2: 85,
        drawbar3: 75,
        drawbar4: 55,
        leslie: 70,
        drive: 50,
        click: 45,
        reverb: 25,
      },
    },
  ],
  bass: [
    {
      id: "electric",
      name: "Electric Bass",
      parameters: {
        pickup: 50,
        tone: 50,
        attack: 20,
        sustain: 80,
        drive: 0,
        compression: 30,
        lowend: 70,
        presence: 40,
      },
    },
    {
      id: "slap",
      name: "Slap Bass",
      parameters: {
        pickup: 70,
        tone: 60,
        attack: 0,
        sustain: 60,
        drive: 10,
        compression: 50,
        lowend: 60,
        presence: 70,
      },
    },
    {
      id: "synth",
      name: "Synth Bass",
      parameters: {
        pickup: 80,
        tone: 40,
        attack: 0,
        sustain: 100,
        drive: 20,
        compression: 40,
        lowend: 90,
        presence: 30,
      },
    },
    {
      id: "upright",
      name: "Upright Bass",
      parameters: {
        pickup: 30,
        tone: 35,
        attack: 30,
        sustain: 70,
        drive: 0,
        compression: 20,
        lowend: 80,
        presence: 25,
      },
    },
    {
      id: "moog",
      name: "Moog Bass",
      parameters: {
        pickup: 100,
        tone: 30,
        attack: 0,
        sustain: 100,
        drive: 30,
        compression: 60,
        lowend: 100,
        presence: 20,
      },
    },
  ],
  strings: [
    {
      id: "ensemble",
      name: "String Ensemble",
      parameters: {
        attack: 50,
        release: 60,
        brightness: 50,
        vibrato: 30,
        ensemble: 70,
        stereo: 80,
        expression: 70,
        reverb: 50,
      },
    },
    {
      id: "solo-violin",
      name: "Solo Violin",
      parameters: {
        attack: 30,
        release: 40,
        brightness: 60,
        vibrato: 50,
        ensemble: 0,
        stereo: 30,
        expression: 80,
        reverb: 40,
      },
    },
    {
      id: "cello",
      name: "Cello",
      parameters: {
        attack: 40,
        release: 50,
        brightness: 40,
        vibrato: 40,
        ensemble: 20,
        stereo: 40,
        expression: 75,
        reverb: 45,
      },
    },
    {
      id: "cinematic",
      name: "Cinematic",
      parameters: {
        attack: 70,
        release: 80,
        brightness: 55,
        vibrato: 25,
        ensemble: 90,
        stereo: 100,
        expression: 85,
        reverb: 70,
      },
    },
    {
      id: "pizzicato",
      name: "Pizzicato",
      parameters: {
        attack: 0,
        release: 15,
        brightness: 65,
        vibrato: 0,
        ensemble: 60,
        stereo: 70,
        expression: 60,
        reverb: 30,
      },
    },
  ],
  brass: [
    {
      id: "section",
      name: "Brass Section",
      parameters: {
        attack: 30,
        release: 40,
        brightness: 60,
        growl: 20,
        ensemble: 80,
        dynamics: 70,
        air: 40,
        reverb: 35,
      },
    },
    {
      id: "trumpet",
      name: "Solo Trumpet",
      parameters: {
        attack: 20,
        release: 30,
        brightness: 70,
        growl: 30,
        ensemble: 0,
        dynamics: 80,
        air: 50,
        reverb: 30,
      },
    },
    {
      id: "trombone",
      name: "Trombone",
      parameters: {
        attack: 25,
        release: 35,
        brightness: 50,
        growl: 40,
        ensemble: 20,
        dynamics: 75,
        air: 45,
        reverb: 35,
      },
    },
    {
      id: "french-horn",
      name: "French Horn",
      parameters: {
        attack: 40,
        release: 50,
        brightness: 45,
        growl: 15,
        ensemble: 40,
        dynamics: 70,
        air: 55,
        reverb: 50,
      },
    },
    {
      id: "epic",
      name: "Epic Brass",
      parameters: {
        attack: 50,
        release: 60,
        brightness: 65,
        growl: 35,
        ensemble: 100,
        dynamics: 90,
        air: 60,
        reverb: 60,
      },
    },
  ],
  pad: [
    {
      id: "warm",
      name: "Warm Pad",
      parameters: {
        attack: 80,
        release: 70,
        filter: 40,
        resonance: 10,
        modDepth: 20,
        stereo: 80,
        chorus: 50,
        reverb: 60,
      },
    },
    {
      id: "evolving",
      name: "Evolving",
      parameters: {
        attack: 90,
        release: 80,
        filter: 60,
        resonance: 20,
        modDepth: 60,
        stereo: 100,
        chorus: 40,
        reverb: 70,
      },
    },
    {
      id: "ambient",
      name: "Ambient",
      parameters: {
        attack: 100,
        release: 90,
        filter: 50,
        resonance: 15,
        modDepth: 40,
        stereo: 90,
        chorus: 60,
        reverb: 85,
      },
    },
    {
      id: "glass",
      name: "Glass",
      parameters: {
        attack: 60,
        release: 60,
        filter: 80,
        resonance: 30,
        modDepth: 30,
        stereo: 70,
        chorus: 30,
        reverb: 50,
      },
    },
    {
      id: "dark",
      name: "Dark Pad",
      parameters: {
        attack: 85,
        release: 75,
        filter: 25,
        resonance: 5,
        modDepth: 25,
        stereo: 85,
        chorus: 45,
        reverb: 65,
      },
    },
  ],
  lead: [
    {
      id: "classic",
      name: "Classic Lead",
      parameters: {
        osc: 70,
        filter: 75,
        resonance: 30,
        glide: 10,
        vibrato: 20,
        attack: 0,
        sustain: 100,
        release: 20,
      },
    },
    {
      id: "screamer",
      name: "Screamer",
      parameters: {
        osc: 100,
        filter: 90,
        resonance: 50,
        glide: 0,
        vibrato: 30,
        attack: 0,
        sustain: 100,
        release: 10,
      },
    },
    {
      id: "smooth",
      name: "Smooth Lead",
      parameters: {
        osc: 50,
        filter: 60,
        resonance: 20,
        glide: 30,
        vibrato: 40,
        attack: 10,
        sustain: 90,
        release: 30,
      },
    },
    {
      id: "acid",
      name: "Acid",
      parameters: {
        osc: 80,
        filter: 40,
        resonance: 80,
        glide: 50,
        vibrato: 10,
        attack: 0,
        sustain: 80,
        release: 15,
      },
    },
    {
      id: "vocal",
      name: "Vocal Lead",
      parameters: {
        osc: 60,
        filter: 55,
        resonance: 25,
        glide: 20,
        vibrato: 35,
        attack: 5,
        sustain: 95,
        release: 25,
      },
    },
  ],
};

const INSTRUMENT_INFO: Record<
  InstrumentType,
  {
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    parameterGroups: {
      name: string;
      keys: string[];
    }[];
  }
> = {
  synth: {
    title: "Synthesizer",
    description:
      "Virtual analog synthesizer with oscillators, filters, and modulation.",
    icon: <Waves className="h-5 w-5" />,
    color: "#8b5cf6",
    parameterGroups: [
      { name: "Oscillators", keys: ["osc1", "osc2", "detune"] },
      { name: "Filter", keys: ["filter", "resonance"] },
      { name: "Envelope", keys: ["attack", "decay", "sustain", "release"] },
      { name: "Modulation", keys: ["lfo"] },
    ],
  },
  sampler: {
    title: "Sampler",
    description:
      "Sample playback engine with loop points and envelope shaping.",
    icon: <Layers className="h-5 w-5" />,
    color: "#06b6d4",
    parameterGroups: [
      { name: "Sample", keys: ["start", "end", "loop"] },
      { name: "Envelope", keys: ["attack", "decay", "sustain", "release"] },
      { name: "Pitch & Filter", keys: ["pitch", "filter"] },
    ],
  },
  drumMachine: {
    title: "Drum Machine",
    description: "Classic drum synthesis with individual sound controls.",
    icon: <Drum className="h-5 w-5" />,
    color: "#ef4444",
    parameterGroups: [
      { name: "Drums", keys: ["kick", "snare", "hihat", "clap"] },
      { name: "Percussion", keys: ["tom", "cymbal"] },
      { name: "Feel", keys: ["swing", "attack", "decay"] },
    ],
  },
  piano: {
    title: "Piano",
    description: "Acoustic and electric piano with realistic response.",
    icon: <Piano className="h-5 w-5" />,
    color: "#f59e0b",
    parameterGroups: [
      { name: "Tone", keys: ["brightness", "tone", "resonance"] },
      { name: "Action", keys: ["hammer", "dynamics"] },
      { name: "Space", keys: ["sustain", "release", "stereo"] },
    ],
  },
  organ: {
    title: "Organ",
    description: "Tonewheel organ with drawbars and rotary speaker.",
    icon: <Music className="h-5 w-5" />,
    color: "#10b981",
    parameterGroups: [
      {
        name: "Drawbars",
        keys: ["drawbar1", "drawbar2", "drawbar3", "drawbar4"],
      },
      { name: "Character", keys: ["leslie", "drive", "click"] },
      { name: "Space", keys: ["reverb"] },
    ],
  },
  bass: {
    title: "Bass",
    description: "Electric and synth bass with powerful low-end.",
    icon: <Guitar className="h-5 w-5" />,
    color: "#3b82f6",
    parameterGroups: [
      { name: "Pickup", keys: ["pickup", "tone"] },
      { name: "Dynamics", keys: ["attack", "sustain", "compression"] },
      { name: "Character", keys: ["drive", "lowend", "presence"] },
    ],
  },
  strings: {
    title: "Strings",
    description: "Orchestral string section with expressive articulations.",
    icon: <Mic2 className="h-5 w-5" />,
    color: "#a855f7",
    parameterGroups: [
      { name: "Envelope", keys: ["attack", "release"] },
      { name: "Expression", keys: ["brightness", "vibrato", "expression"] },
      { name: "Space", keys: ["ensemble", "stereo", "reverb"] },
    ],
  },
  brass: {
    title: "Brass",
    description: "Brass section from solo instruments to full ensemble.",
    icon: <Zap className="h-5 w-5" />,
    color: "#eab308",
    parameterGroups: [
      { name: "Envelope", keys: ["attack", "release"] },
      { name: "Character", keys: ["brightness", "growl", "air"] },
      { name: "Space", keys: ["ensemble", "dynamics", "reverb"] },
    ],
  },
  pad: {
    title: "Pad",
    description: "Lush atmospheric pads for ambient textures.",
    icon: <Waves className="h-5 w-5" />,
    color: "#ec4899",
    parameterGroups: [
      { name: "Envelope", keys: ["attack", "release"] },
      { name: "Filter", keys: ["filter", "resonance"] },
      { name: "Modulation", keys: ["modDepth", "chorus"] },
      { name: "Space", keys: ["stereo", "reverb"] },
    ],
  },
  lead: {
    title: "Lead",
    description: "Expressive lead synth for melodies and solos.",
    icon: <Activity className="h-5 w-5" />,
    color: "#f97316",
    parameterGroups: [
      { name: "Oscillator", keys: ["osc"] },
      { name: "Filter", keys: ["filter", "resonance"] },
      { name: "Expression", keys: ["glide", "vibrato"] },
      { name: "Envelope", keys: ["attack", "sustain", "release"] },
    ],
  },
};

const PARAMETER_LABELS: Record<
  string,
  { label: string; unit?: string; min: number; max: number }
> = {
  osc1: { label: "Osc 1", min: 0, max: 100 },
  osc2: { label: "Osc 2", min: 0, max: 100 },
  osc: { label: "Oscillator", min: 0, max: 100 },
  filter: { label: "Filter", min: 0, max: 100 },
  resonance: { label: "Resonance", min: 0, max: 100 },
  attack: { label: "Attack", unit: "ms", min: 0, max: 100 },
  decay: { label: "Decay", unit: "ms", min: 0, max: 100 },
  sustain: { label: "Sustain", min: 0, max: 100 },
  release: { label: "Release", unit: "ms", min: 0, max: 100 },
  lfo: { label: "LFO", min: 0, max: 100 },
  detune: { label: "Detune", unit: "ct", min: 0, max: 100 },
  start: { label: "Start", unit: "%", min: 0, max: 100 },
  end: { label: "End", unit: "%", min: 0, max: 100 },
  loop: { label: "Loop", min: 0, max: 100 },
  pitch: { label: "Pitch", unit: "st", min: 0, max: 100 },
  kick: { label: "Kick", min: 0, max: 100 },
  snare: { label: "Snare", min: 0, max: 100 },
  hihat: { label: "Hi-Hat", min: 0, max: 100 },
  clap: { label: "Clap", min: 0, max: 100 },
  tom: { label: "Tom", min: 0, max: 100 },
  cymbal: { label: "Cymbal", min: 0, max: 100 },
  swing: { label: "Swing", unit: "%", min: 0, max: 100 },
  brightness: { label: "Brightness", min: 0, max: 100 },
  hammer: { label: "Hammer", min: 0, max: 100 },
  stereo: { label: "Stereo", min: 0, max: 100 },
  dynamics: { label: "Dynamics", min: 0, max: 100 },
  tone: { label: "Tone", min: 0, max: 100 },
  drawbar1: { label: "16'", min: 0, max: 100 },
  drawbar2: { label: "8'", min: 0, max: 100 },
  drawbar3: { label: "4'", min: 0, max: 100 },
  drawbar4: { label: "2'", min: 0, max: 100 },
  leslie: { label: "Leslie", min: 0, max: 100 },
  drive: { label: "Drive", min: 0, max: 100 },
  click: { label: "Click", min: 0, max: 100 },
  reverb: { label: "Reverb", min: 0, max: 100 },
  pickup: { label: "Pickup", min: 0, max: 100 },
  compression: { label: "Compression", min: 0, max: 100 },
  lowend: { label: "Low End", min: 0, max: 100 },
  presence: { label: "Presence", min: 0, max: 100 },
  vibrato: { label: "Vibrato", min: 0, max: 100 },
  ensemble: { label: "Ensemble", min: 0, max: 100 },
  expression: { label: "Expression", min: 0, max: 100 },
  growl: { label: "Growl", min: 0, max: 100 },
  air: { label: "Air", min: 0, max: 100 },
  modDepth: { label: "Mod Depth", min: 0, max: 100 },
  chorus: { label: "Chorus", min: 0, max: 100 },
  glide: { label: "Glide", unit: "ms", min: 0, max: 100 },
};

export function FlowStateInstrumentDialog({
  open,
  onOpenChange,
  instrument,
  onParameterChange,
  onBypassChange,
  onPresetChange,
  onReset,
}: FlowStateInstrumentDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);

  const info = instrument ? INSTRUMENT_INFO[instrument.type] : null;
  const presets = instrument ? INSTRUMENT_PRESETS[instrument.type] : [];

  const handlePresetSelect = useCallback(
    (preset: InstrumentPreset) => {
      setSelectedPreset(preset.id);
      Object.entries(preset.parameters).forEach(([key, value]) => {
        onParameterChange(key, value);
      });
      onPresetChange?.(preset.id);
      setShowPresets(false);
    },
    [onParameterChange, onPresetChange],
  );

  const handleReset = useCallback(() => {
    setSelectedPreset(null);
    onReset();
  }, [onReset]);

  if (!instrument || !info) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-gradient-to-b from-[#1a1a2e] to-[#16162a] border-white/10 p-0 overflow-hidden">
        <div
          className="h-2 w-full"
          style={{
            background: `linear-gradient(90deg, ${info.color}, ${info.color}80)`,
          }}
        />

        <DialogHeader className="px-6 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${info.color}20` }}
              >
                <span style={{ color: info.color }}>{info.icon}</span>
              </div>
              <div>
                <DialogTitle className="text-white text-lg font-medium">
                  {instrument.name || info.title}
                </DialogTitle>
                <p className="text-white/50 text-sm">{info.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <Power
                  className={cn(
                    "h-4 w-4",
                    instrument.bypass ? "text-white/30" : "text-green-400",
                  )}
                />
                <Switch
                  checked={!instrument.bypass}
                  onCheckedChange={(checked) => onBypassChange(!checked)}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-white/50 hover:text-white hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="controls" className="px-6">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger
              value="controls"
              className="data-[state=active]:bg-white/10"
            >
              <Settings className="h-4 w-4 mr-2" />
              Controls
            </TabsTrigger>
            <TabsTrigger
              value="presets"
              className="data-[state=active]:bg-white/10"
            >
              <Layers className="h-4 w-4 mr-2" />
              Presets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="controls" className="mt-4 pb-6">
            <div className="space-y-6">
              {info.parameterGroups.map((group) => (
                <div key={group.name}>
                  <h4 className="text-white/70 text-sm font-medium mb-3">
                    {group.name}
                  </h4>
                  <div className="grid grid-cols-4 gap-4">
                    {group.keys.map((key) => {
                      const param = PARAMETER_LABELS[key];
                      const value = instrument.parameters[key] ?? 50;

                      return (
                        <div
                          key={key}
                          className="flex flex-col items-center gap-2"
                        >
                          <Knob
                            value={value}
                            onChange={(v) => onParameterChange(key, v)}
                            min={param?.min ?? 0}
                            max={param?.max ?? 100}
                            size="md"
                            color={info.color}
                          />
                          <div className="text-center">
                            <span className="text-white/70 text-xs block">
                              {param?.label ?? key}
                            </span>
                            <span className="text-white/40 text-xs">
                              {Math.round(value)}
                              {param?.unit ?? ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="presets" className="mt-4 pb-6">
            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-2 gap-2">
                {presets.map((preset) => (
                  <motion.button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={cn(
                      "p-3 rounded-lg text-left transition-all border",
                      selectedPreset === preset.id
                        ? "bg-white/10 border-white/20"
                        : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10",
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="text-white font-medium text-sm">
                      {preset.name}
                    </span>
                  </motion.button>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export { INSTRUMENT_PRESETS, INSTRUMENT_INFO };
