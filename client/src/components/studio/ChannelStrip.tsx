import { useState, useCallback, useRef, useEffect } from "react";
import {
  Volume2,
  VolumeX,
  Headphones,
  Mic,
  Settings2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ProfessionalFader,
  valueToDb,
  dbToValue,
  MAX_DB,
} from "./ProfessionalFader";
import { VUMeter } from "./VUMeter";
import { Knob } from "./Knob";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";

interface ChannelStripProps {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed?: boolean;
  trackType: "audio" | "midi" | "instrument";
  effects?: {
    eq?: {
      lowGain: number;
      midGain: number;
      highGain: number;
      bypass?: boolean;
    };
    compressor?: { threshold: number; ratio: number; bypass?: boolean };
    reverb?: { mix: number; bypass?: boolean };
  };
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onArmedToggle?: () => void;
  onEffectChange?: (effectType: string, params: unknown) => void;
}

export function ChannelStrip({
  id,
  name,
  color,
  volume,
  pan,
  mute,
  solo,
  armed = false,
  trackType,
  effects,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmedToggle,
  onEffectChange,
}: ChannelStripProps) {
  const [showInserts, setShowInserts] = useState(false);
  const [showSends, setShowSends] = useState(false);
  const [meterLevel, setMeterLevel] = useState([0, 0]); // L, R
  const [peakLevel, setPeakLevel] = useState([0, 0]);

  // Realistic VU meter simulation with exponential decay + transient bursts + peak hold
  useEffect(() => {
    if (mute) {
      setMeterLevel([0, 0]);
      setPeakLevel([0, 0]);
      return;
    }

    // Internal state persisted between ticks via closure refs
    let levelL = 0;
    let levelR = 0;
    let peakHoldL = 0;
    let peakHoldR = 0;
    let peakHoldCounterL = 0;
    let peakHoldCounterR = 0;
    const PEAK_HOLD_TICKS = 40; // ~2 seconds at 50ms
    const DECAY = 0.82;
    const NOISE_SCALE = 0.12;

    const interval = setInterval(() => {
      // Occasional transient bursts (~15% chance each channel, independent)
      if (Math.random() < 0.15)
        levelL = Math.min(1, volume * (0.5 + Math.random() * 0.5));
      if (Math.random() < 0.15)
        levelR = Math.min(1, volume * (0.5 + Math.random() * 0.5));

      // Exponential decay + small continuous noise
      levelL = levelL * DECAY + Math.random() * NOISE_SCALE * volume;
      levelR = levelR * DECAY + Math.random() * NOISE_SCALE * volume;
      levelL = Math.min(1, Math.max(0, levelL));
      levelR = Math.min(1, Math.max(0, levelR));

      // Peak hold: reset hold timer when new peak exceeds stored peak
      if (levelL >= peakHoldL) {
        peakHoldL = levelL;
        peakHoldCounterL = PEAK_HOLD_TICKS;
      } else if (peakHoldCounterL > 0) {
        peakHoldCounterL--;
      } else {
        peakHoldL = peakHoldL * 0.97;
      }

      if (levelR >= peakHoldR) {
        peakHoldR = levelR;
        peakHoldCounterR = PEAK_HOLD_TICKS;
      } else if (peakHoldCounterR > 0) {
        peakHoldCounterR--;
      } else {
        peakHoldR = peakHoldR * 0.97;
      }

      setMeterLevel([levelL, levelR]);
      setPeakLevel([peakHoldL, peakHoldR]);
    }, 50);

    return () => clearInterval(interval);
  }, [volume, mute]);

  // Use consistent dB conversion with +30dB safety cap
  const formatDb = (normalizedValue: number) => {
    const db = valueToDb(normalizedValue);
    if (db === -Infinity) return "-∞";
    return db.toFixed(1);
  };

  return (
    <div
      className="w-24 h-full flex flex-col border-r"
      style={{
        borderColor: "var(--studio-border)",
        background:
          "linear-gradient(180deg, var(--studio-bg-medium) 0%, var(--studio-bg-deep) 100%)",
      }}
    >
      {/* Track Header */}
      <div
        className="h-12 p-2 flex flex-col gap-1 border-b"
        style={{
          borderColor: "var(--studio-border)",
          background: color + "15",
        }}
      >
        <div className="flex items-center justify-between">
          <div
            className="text-[10px] font-semibold truncate flex-1"
            style={{ color: "var(--studio-text)" }}
            title={name}
          >
            {name}
          </div>
          {trackType === "midi" && (
            <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold bg-purple-500/30 text-purple-300">
              M
            </div>
          )}
          {trackType === "instrument" && (
            <div className="w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold bg-blue-500/30 text-blue-300">
              I
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <Badge
            variant="outline"
            className="text-[8px] px-1 py-0 h-4 cursor-pointer"
            style={{
              borderColor: color,
              color: color,
              background: armed ? color + "30" : "transparent",
            }}
            onClick={onArmedToggle}
          >
            <Mic className="h-2.5 w-2.5" />
          </Badge>
        </div>
      </div>

      {/* Inserts Section */}
      <div className="border-b" style={{ borderColor: "var(--studio-border)" }}>
        <button
          onClick={() => setShowInserts(!showInserts)}
          className="w-full px-2 py-1.5 flex items-center justify-between text-[9px] font-medium hover:bg-white/5"
          style={{ color: "var(--studio-text-muted)" }}
        >
          <span>INSERTS</span>
          {showInserts ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        {showInserts && (
          <div className="p-2 space-y-1">
            {/* EQ */}
            {effects?.eq && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="w-full px-2 py-1 text-[9px] rounded hover:bg-white/10"
                    style={{
                      background: effects.eq.bypass
                        ? "transparent"
                        : color + "20",
                      color: "var(--studio-text)",
                      border: `1px solid ${color}40`,
                    }}
                  >
                    EQ
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" className="w-64">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">EQ</Label>
                      <Switch
                        checked={!effects.eq.bypass}
                        onCheckedChange={(checked) =>
                          onEffectChange?.("eq", {
                            ...effects.eq,
                            bypass: !checked,
                          })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[10px]">
                          Low: {effects.eq.lowGain}dB
                        </Label>
                        <Slider
                          value={[effects.eq.lowGain]}
                          onValueChange={([val]) =>
                            onEffectChange?.("eq", {
                              ...effects.eq,
                              lowGain: val,
                            })
                          }
                          min={-12}
                          max={12}
                          step={0.5}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">
                          Mid: {effects.eq.midGain}dB
                        </Label>
                        <Slider
                          value={[effects.eq.midGain]}
                          onValueChange={([val]) =>
                            onEffectChange?.("eq", {
                              ...effects.eq,
                              midGain: val,
                            })
                          }
                          min={-12}
                          max={12}
                          step={0.5}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">
                          High: {effects.eq.highGain}dB
                        </Label>
                        <Slider
                          value={[effects.eq.highGain]}
                          onValueChange={([val]) =>
                            onEffectChange?.("eq", {
                              ...effects.eq,
                              highGain: val,
                            })
                          }
                          min={-12}
                          max={12}
                          step={0.5}
                        />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Compressor */}
            {effects?.compressor && (
              <button
                className="w-full px-2 py-1 text-[9px] rounded hover:bg-white/10"
                style={{
                  background: effects.compressor.bypass
                    ? "transparent"
                    : color + "20",
                  color: "var(--studio-text)",
                  border: `1px solid ${color}40`,
                }}
              >
                COMP
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sends Section */}
      <div className="border-b" style={{ borderColor: "var(--studio-border)" }}>
        <button
          onClick={() => setShowSends(!showSends)}
          className="w-full px-2 py-1.5 flex items-center justify-between text-[9px] font-medium hover:bg-white/5"
          style={{ color: "var(--studio-text-muted)" }}
        >
          <span>SENDS</span>
          {showSends ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        {showSends && (
          <div className="p-2 space-y-2">
            <div className="flex items-center justify-between text-[9px]">
              <span style={{ color: "var(--studio-text-muted)" }}>Reverb</span>
              <span style={{ color: "var(--studio-text)" }}>
                {((effects?.reverb?.mix || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* VU Meters */}
      <div className="flex-1 flex justify-center items-end p-2 pt-4">
        <div className="flex gap-1.5 h-full">
          <VUMeter level={meterLevel[0]} peakLevel={peakLevel[0]} />
          <VUMeter level={meterLevel[1]} peakLevel={peakLevel[1]} />
        </div>
      </div>

      {/* Pan Knob */}
      <div
        className="p-2 flex flex-col items-center border-t"
        style={{ borderColor: "var(--studio-border)" }}
      >
        <Knob
          value={pan}
          onChange={onPanChange}
          min={-1}
          max={1}
          step={0.01}
          size={40}
          label="PAN"
          valueDisplay={(val) =>
            val === 0
              ? "C"
              : val < 0
                ? `${Math.abs(val * 100).toFixed(0)}L`
                : `${(val * 100).toFixed(0)}R`
          }
        />
      </div>

      {/* Volume Fader */}
      <div className="flex-1 flex flex-col items-center px-2 py-3">
        <ProfessionalFader
          value={volume}
          onChange={onVolumeChange}
          height="100%"
          color={color}
        />
        <div
          className="mt-2 text-[9px] font-mono text-center"
          style={{ color: "var(--studio-text-muted)" }}
        >
          {formatDb(volume)}dB
        </div>
      </div>

      {/* Mute/Solo Buttons */}
      <div className="p-2 space-y-1">
        <button
          onClick={onMuteToggle}
          className={`w-full h-7 text-xs font-bold rounded transition-all ${
            mute
              ? "bg-yellow-600 text-yellow-100"
              : "bg-gray-700 text-gray-400 hover:bg-gray-600"
          }`}
        >
          M
        </button>
        <button
          onClick={onSoloToggle}
          className={`w-full h-7 text-xs font-bold rounded transition-all ${
            solo
              ? "bg-green-600 text-green-100"
              : "bg-gray-700 text-gray-400 hover:bg-gray-600"
          }`}
        >
          S
        </button>
      </div>
    </div>
  );
}
