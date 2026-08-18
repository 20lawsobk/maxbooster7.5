// @ts-nocheck
import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, Waveform, BarChart3, Zap, RefreshCw, Check, Play, Pause, Target, Sparkles, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FrequencyBand {
  name: string;
  range: string;
  reference: number;
  current: number;
  difference: number;
  suggestion: string;
}

interface DynamicsAnalysis {
  rms: number;
  peak: number;
  crestFactor: number;
  lufs: number;
  dynamicRange: number;
}

interface StereoAnalysis {
  width: number;
  correlation: number;
  balance: number;
}

interface ReferenceTrack {
  id: string;
  name: string;
  duration: number;
  waveform: number[];
  analysis: {
    frequency: FrequencyBand[];
    dynamics: DynamicsAnalysis;
    stereo: StereoAnalysis;
    tempo: number;
    key: string;
  };
}

interface FlowStateReferenceMatchProps {
  currentTrackName?: string;
  onApplyEQ?: (bands: FrequencyBand[]) => void;
  onApplyCompression?: (settings: DynamicsAnalysis) => void;
  className?: string;
}

export function FlowStateReferenceMatch({
  currentTrackName = "My Mix",
  onApplyEQ,
  onApplyCompression,
  className,
}: FlowStateReferenceMatchProps) {
  const { toast } = useToast();
  const [referenceTrack, setReferenceTrack] = useState<ReferenceTrack | null>(
    null,
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingTrack, setPlayingTrack] = useState<"reference" | "current">(
    "current",
  );
  const [loudnessMatch, setLoudnessMatch] = useState(true);
  const [abComparison, setAbComparison] = useState(false);
  const [matchIntensity, setMatchIntensity] = useState([75]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Static placeholder waveform for the current (un-uploaded) mix display
  const placeholderWaveform = useState<number[]>(() => {
    const pts: number[] = [];
    for (let i = 0; i < 200; i++)
      pts.push(
        0.25 +
          0.3 * Math.abs(Math.sin(i * 0.18)) +
          0.1 * Math.abs(Math.sin(i * 0.07)),
      );
    return pts;
  })[0];

  const [currentAnalysis] = useState<ReferenceTrack["analysis"]>({
    frequency: [
      {
        name: "Sub",
        range: "20-60Hz",
        reference: 0,
        current: -2,
        difference: -2,
        suggestion: "Boost sub frequencies by 2dB",
      },
      {
        name: "Bass",
        range: "60-250Hz",
        reference: 0,
        current: 1.5,
        difference: 1.5,
        suggestion: "Cut bass by 1.5dB",
      },
      {
        name: "Low Mid",
        range: "250-500Hz",
        reference: 0,
        current: 0.5,
        difference: 0.5,
        suggestion: "Slight cut at 300Hz",
      },
      {
        name: "Mid",
        range: "500-2kHz",
        reference: 0,
        current: -1,
        difference: -1,
        suggestion: "Boost mids slightly",
      },
      {
        name: "High Mid",
        range: "2k-4kHz",
        reference: 0,
        current: 2,
        difference: 2,
        suggestion: "Cut presence by 2dB",
      },
      {
        name: "Presence",
        range: "4k-6kHz",
        reference: 0,
        current: -0.5,
        difference: -0.5,
        suggestion: "Boost clarity slightly",
      },
      {
        name: "Brilliance",
        range: "6k-10kHz",
        reference: 0,
        current: 1,
        difference: 1,
        suggestion: "Cut air frequencies by 1dB",
      },
      {
        name: "Air",
        range: "10k-20kHz",
        reference: 0,
        current: -1.5,
        difference: -1.5,
        suggestion: "Add air with shelf at 12kHz",
      },
    ],
    dynamics: {
      rms: -14,
      peak: -1,
      crestFactor: 13,
      lufs: -14,
      dynamicRange: 8,
    },
    stereo: {
      width: 65,
      correlation: 0.85,
      balance: 2,
    },
    tempo: 128,
    key: "F Minor",
  });

  // ─── Real Web Audio API analysis helpers ─────────────────────────────────

  /** Radix-2 Cooley–Tukey FFT (in-place). Length must be a power of 2. */
  const fftInPlace = useCallback((re: Float64Array, im: Float64Array) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wRe = Math.cos(ang),
        wIm = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cRe = 1,
          cIm = 0;
        for (let k = 0; k < len >> 1; k++) {
          const uRe = re[i + k],
            uIm = im[i + k];
          const vRe = re[i + k + len / 2] * cRe - im[i + k + len / 2] * cIm;
          const vIm = re[i + k + len / 2] * cIm + im[i + k + len / 2] * cRe;
          re[i + k] = uRe + vRe;
          im[i + k] = uIm + vIm;
          re[i + k + len / 2] = uRe - vRe;
          im[i + k + len / 2] = uIm - vIm;
          const ncRe = cRe * wRe - cIm * wIm;
          cIm = cRe * wIm + cIm * wRe;
          cRe = ncRe;
        }
      }
    }
  }, []);

  /** Compute per-half-spectrum magnitudes from a real-valued segment (Hann windowed). */
  const computeFFTMagnitudes = useCallback(
    (samples: Float32Array, fftSize: number): Float32Array => {
      const n = Math.min(samples.length, fftSize);
      const size = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
      const re = new Float64Array(size);
      const im = new Float64Array(size);
      for (let i = 0; i < n; i++) {
        const win = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
        re[i] = (samples[i] || 0) * win;
      }
      fftInPlace(re, im);
      const mag = new Float32Array(size >> 1);
      for (let i = 0; i < size >> 1; i++) {
        mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / (size || 1);
      }
      return mag;
    },
    [fftInPlace],
  );

  /** Average dB in a Hz range from FFT magnitudes. */
  const getBandDb = useCallback(
    (
      mag: Float32Array,
      minHz: number,
      maxHz: number,
      sr: number,
      fftSize: number,
    ): number => {
      const bw = sr / fftSize;
      const lo = Math.max(0, Math.floor(minHz / bw));
      const hi = Math.min(mag.length - 1, Math.ceil(maxHz / bw));
      let s = 0;
      for (let i = lo; i <= hi; i++) s += mag[i];
      return +(
        20 * Math.log10(Math.max(s / Math.max(1, hi - lo + 1), 1e-9))
      ).toFixed(1);
    },
    [],
  );

  /** Energy-envelope BPM detection via autocorrelation (60–200 BPM). */
  const detectTempo = useCallback((data: Float32Array, sr: number): number => {
    const hop = Math.floor(sr * 0.01);
    const frames = Math.floor(data.length / hop);
    const energy: number[] = [];
    for (let i = 0; i < frames; i++) {
      let s = 0;
      const off = i * hop;
      for (let j = 0; j < hop; j++) {
        const v = data[off + j] || 0;
        s += v * v;
      }
      energy.push(s / hop);
    }
    const onset: number[] = energy.map((e, i) =>
      i ? Math.max(0, e - energy[i - 1]) : 0,
    );
    let bestBpm = 120,
      bestScore = -Infinity;
    for (let bpm = 60; bpm <= 200; bpm++) {
      const period = (60 / bpm) * (sr / hop);
      let score = 0;
      for (let i = 0; i < onset.length; i++) {
        const ph = i % period;
        if (ph < period * 0.06 || ph > period * 0.94) score += onset[i];
      }
      if (score > bestScore) {
        bestScore = score;
        bestBpm = bpm;
      }
    }
    return bestBpm;
  }, []);

  /** Krumhansl–Schmuckler key detection via chroma autocorrelation. */
  const detectKey = useCallback((data: Float32Array, sr: number): string => {
    const MAJOR = [
      6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const MINOR = [
      6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];
    const NOTES = [
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
    ];
    const chroma = new Float64Array(12);
    const segLen = Math.min(data.length, sr * 4);
    const start = Math.floor((data.length - segLen) / 2);
    for (let note = 0; note < 12; note++) {
      const freq = 261.63 * Math.pow(2, note / 12);
      for (let h = 1; h <= 3; h++) {
        const p = Math.round(sr / (freq * h));
        if (p < 2) continue;
        const n = Math.min(segLen - p, 1024);
        let c = 0;
        for (let i = 0; i < n; i++)
          c += (data[start + i] || 0) * (data[start + i + p] || 0);
        chroma[note] += Math.abs(c) / (Math.max(1, n) * h);
      }
    }
    const mx = Math.max(...chroma);
    if (mx > 0) for (let i = 0; i < 12; i++) chroma[i] /= mx;
    let best = -Infinity,
      bestKey = "C Major";
    for (let r = 0; r < 12; r++) {
      let maj = 0,
        min = 0;
      for (let i = 0; i < 12; i++) {
        maj += chroma[i] * MAJOR[(i - r + 12) % 12];
        min += chroma[i] * MINOR[(i - r + 12) % 12];
      }
      if (maj > best) {
        best = maj;
        bestKey = `${NOTES[r]} Major`;
      }
      if (min > best) {
        best = min;
        bestKey = `${NOTES[r]} Minor`;
      }
    }
    return bestKey;
  }, []);

  /** Stereo width, correlation, and L/R balance from a 2-channel AudioBuffer. */
  const analyzeStereo = useCallback((buf: AudioBuffer): StereoAnalysis => {
    if (buf.numberOfChannels < 2)
      return { width: 0, correlation: 1, balance: 0 };
    const L = buf.getChannelData(0),
      R = buf.getChannelData(1);
    const n = Math.min(L.length, R.length);
    let sL = 0,
      sR = 0,
      sLR = 0,
      sLL = 0,
      sRR = 0;
    for (let i = 0; i < n; i++) {
      sL += L[i];
      sR += R[i];
      sLR += L[i] * R[i];
      sLL += L[i] * L[i];
      sRR += R[i] * R[i];
    }
    const denom = Math.sqrt(sLL * sRR);
    const corr = denom > 0 ? Math.max(-1, Math.min(1, sLR / denom)) : 1;
    return {
      width: Math.round((1 - Math.max(0, corr)) * 100),
      correlation: +corr.toFixed(2),
      balance: Math.round(((sR - sL) / n) * 100),
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      toast({
        title: "Invalid file",
        description: "Please upload an audio file",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    try {
      setAnalysisProgress(10);
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      setAnalysisProgress(25);
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();
      setAnalysisProgress(40);

      const ch = audioBuffer.getChannelData(0);
      const sr = audioBuffer.sampleRate;

      // Waveform — 200 RMS-amplitude points
      const pts = 200,
        blk = Math.floor(ch.length / pts);
      const waveform: number[] = [];
      for (let i = 0; i < pts; i++) {
        let s = 0;
        const off = i * blk;
        for (let j = 0; j < blk; j++) s += Math.abs(ch[off + j] || 0);
        waveform.push(Math.min(1, (s / blk) * 3));
      }
      setAnalysisProgress(50);

      // Dynamics
      let sumSq = 0,
        peak = 0;
      for (let i = 0; i < ch.length; i++) {
        const v = ch[i];
        sumSq += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      const rmsLin = Math.sqrt(sumSq / (ch.length || 1));
      const rmsDb = +(20 * Math.log10(Math.max(rmsLin, 1e-7))).toFixed(1);
      const peakDb = +(20 * Math.log10(Math.max(peak, 1e-7))).toFixed(1);
      const crestFactor = +(peakDb - rmsDb).toFixed(1);
      const lufs = +(rmsDb - 3.01).toFixed(1);
      const dynamicRange = Math.min(20, Math.max(2, Math.round(crestFactor)));
      setAnalysisProgress(65);

      // Frequency analysis — FFT on middle segment
      const fftSize = 8192;
      const mid = Math.floor(ch.length / 2);
      const seg = ch.slice(Math.max(0, mid - fftSize / 2), mid + fftSize / 2);
      const mag = computeFFTMagnitudes(seg, fftSize);
      setAnalysisProgress(75);

      const BANDS = [
        { name: "Sub", range: "20-60Hz", lo: 20, hi: 60 },
        { name: "Bass", range: "60-250Hz", lo: 60, hi: 250 },
        { name: "Low Mid", range: "250-500Hz", lo: 250, hi: 500 },
        { name: "Mid", range: "500-2kHz", lo: 500, hi: 2000 },
        { name: "High Mid", range: "2k-4kHz", lo: 2000, hi: 4000 },
        { name: "Presence", range: "4k-6kHz", lo: 4000, hi: 6000 },
        { name: "Brilliance", range: "6k-10kHz", lo: 6000, hi: 10000 },
        { name: "Air", range: "10k-20kHz", lo: 10000, hi: 20000 },
      ];
      const TARGETS: Record<string, number> = {
        Sub: -18,
        Bass: -14,
        "Low Mid": -16,
        Mid: -14,
        "High Mid": -12,
        Presence: -12,
        Brilliance: -14,
        Air: -18,
      };
      const TIPS: Record<string, [string, string]> = {
        Sub: [
          "Cut sub with high-pass at 30 Hz to tighten low end",
          "Boost sub 2–3 dB for warmth",
        ],
        Bass: [
          "Tighten bass with multiband compression",
          "Add punch with 60 Hz boost",
        ],
        "Low Mid": [
          "Cut mud at 300 Hz for clarity",
          "Add body with gentle 250 Hz boost",
        ],
        Mid: ["Cut boxiness at 500–800 Hz", "Boost mids for vocal presence"],
        "High Mid": [
          "Reduce harshness at 2–3 kHz",
          "Add clarity with 2.5 kHz boost",
        ],
        Presence: [
          "De-ess at 4–6 kHz, reduce sibilance",
          "Boost for forward presence",
        ],
        Brilliance: [
          "Low-shelf cut above 8 kHz",
          "Add sparkle with 8 kHz air band",
        ],
        Air: [
          "Low-pass above 16 kHz to tame digital harshness",
          "Air-shelf boost at 12–16 kHz",
        ],
      };
      const frequency: FrequencyBand[] = BANDS.map((b) => {
        const current = getBandDb(mag, b.lo, b.hi, sr, fftSize);
        const reference = TARGETS[b.name] ?? -14;
        const diff = +(current - reference).toFixed(1);
        const [tipHigh, tipLow] = TIPS[b.name] ?? [
          "Reduce level",
          "Boost level",
        ];
        const suggestion =
          diff > 2
            ? tipHigh
            : diff < -2
              ? tipLow
              : `${b.name} balance is optimal`;
        return {
          name: b.name,
          range: b.range,
          reference,
          current,
          difference: diff,
          suggestion,
        };
      });
      setAnalysisProgress(85);

      const tempo = detectTempo(ch, sr);
      const key = detectKey(ch, sr);
      const stereo = analyzeStereo(audioBuffer);
      setAnalysisProgress(100);

      setReferenceTrack({
        id: `ref-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ""),
        duration: audioBuffer.duration,
        waveform,
        analysis: {
          frequency,
          dynamics: {
            rms: rmsDb,
            peak: peakDb,
            crestFactor,
            lufs,
            dynamicRange,
          },
          stereo,
          tempo,
          key,
        },
      });
      setIsAnalyzing(false);
      toast({
        title: "Analysis complete",
        description: `Analyzed "${file.name.replace(/\.[^/.]+$/, "")}" — Ready for matching!`,
      });
    } catch (err) {
      setIsAnalyzing(false);
      toast({
        title: "Analysis failed",
        description: "Could not decode audio file. Try WAV, MP3, or AAC.",
        variant: "destructive",
      });
      console.error("[ReferenceMatch] Audio analysis error:", err);
    }
  };

  const applyEQMatch = () => {
    if (!referenceTrack) return;
    onApplyEQ?.(referenceTrack.analysis.frequency);
    toast({
      title: "EQ matching applied",
      description: "Frequency balance matched to reference",
    });
  };

  const applyDynamicsMatch = () => {
    if (!referenceTrack) return;
    onApplyCompression?.(referenceTrack.analysis.dynamics);
    toast({
      title: "Dynamics matching applied",
      description: "Compression settings matched to reference",
    });
  };

  const getDifferenceColor = (diff: number): string => {
    const abs = Math.abs(diff);
    if (abs < 1) return "text-green-400";
    if (abs < 2) return "text-yellow-400";
    return "text-red-400";
  };

  const getDifferenceBar = (diff: number): React.ReactNode => {
    const abs = Math.abs(diff);
    const width = Math.min(abs * 20, 100);
    const color =
      abs < 1 ? "bg-green-500" : abs < 2 ? "bg-yellow-500" : "bg-red-500";

    return (
      <div className="flex items-center gap-2">
        <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-zinc-600" />
          </div>
          <motion.div
            className={cn("h-full rounded-full", color)}
            initial={{ width: 0 }}
            animate={{
              width: `${width}%`,
              marginLeft: diff < 0 ? `${50 - width}%` : "50%",
            }}
          />
        </div>
        <span
          className={cn("text-xs font-mono w-12", getDifferenceColor(diff))}
        >
          {diff > 0 ? "+" : ""}
          {diff.toFixed(1)}dB
        </span>
      </div>
    );
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold">Reference Match</h2>
            <p className="text-xs text-zinc-500">
              Match your mix to pro tracks
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch
              checked={loudnessMatch}
              onCheckedChange={setLoudnessMatch}
            />
            <Label className="text-sm text-zinc-400">Loudness Match</Label>
          </div>
          <Badge
            variant="outline"
            className="text-purple-400 border-purple-400/30"
          >
            <Sparkles className="w-3 h-3 mr-1" />
            AI Analysis
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Reference Upload & Waveforms */}
        <div className="w-96 border-r border-zinc-800 p-4 flex flex-col gap-4">
          {/* Upload Area */}
          <Card
            className={cn(
              "border-2 border-dashed transition-all cursor-pointer",
              referenceTrack
                ? "bg-purple-500/5 border-purple-500/30"
                : "bg-zinc-900 border-zinc-700 hover:border-purple-500/50",
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="p-6 text-center">
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-10 h-10 mx-auto mb-3 text-purple-400 animate-spin" />
                  <p className="text-sm font-medium mb-2">
                    Analyzing reference...
                  </p>
                  <Progress value={analysisProgress} className="h-2" />
                  <p className="text-xs text-zinc-500 mt-2">
                    {analysisProgress < 30
                      ? "Extracting frequency spectrum..."
                      : analysisProgress < 60
                        ? "Analyzing dynamics..."
                        : analysisProgress < 90
                          ? "Measuring stereo image..."
                          : "Generating suggestions..."}
                  </p>
                </>
              ) : referenceTrack ? (
                <>
                  <Check className="w-10 h-10 mx-auto mb-3 text-green-400" />
                  <p className="font-medium">{referenceTrack.name}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {Math.floor(referenceTrack.duration / 60)}:
                    {String(Math.floor(referenceTrack.duration % 60)).padStart(
                      2,
                      "0",
                    )}{" "}
                    • {referenceTrack.analysis.tempo} BPM •{" "}
                    {referenceTrack.analysis.key}
                  </p>
                  <p className="text-xs text-purple-400 mt-2">
                    Click to change reference
                  </p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
                  <p className="text-sm font-medium">Drop a reference track</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Upload a professionally mixed track to match
                  </p>
                </>
              )}
            </div>
          </Card>

          {/* Waveform Comparison */}
          {referenceTrack && (
            <Card className="bg-zinc-900 border-zinc-800 p-4 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Waveform Comparison</h3>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={playingTrack === "current" ? "default" : "outline"}
                    onClick={() => setPlayingTrack("current")}
                    className="h-7 text-xs"
                  >
                    Your Mix
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      playingTrack === "reference" ? "default" : "outline"
                    }
                    onClick={() => setPlayingTrack("reference")}
                    className="h-7 text-xs"
                  >
                    Reference
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Your Mix Waveform */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">
                      {currentTrackName}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {currentAnalysis.dynamics.lufs} LUFS
                    </span>
                  </div>
                  <div className="h-12 bg-zinc-950 rounded flex items-center px-1">
                    {placeholderWaveform.map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 mx-px bg-blue-500/60 rounded-sm"
                        style={{ height: `${v * 100}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Reference Waveform */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">
                      {referenceTrack.name}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {referenceTrack.analysis.dynamics.lufs} LUFS
                    </span>
                  </div>
                  <div className="h-12 bg-zinc-950 rounded flex items-center px-1">
                    {referenceTrack.waveform.map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 mx-px bg-purple-500/60 rounded-sm"
                        style={{ height: `${v * 100}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-zinc-800">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={abComparison}
                    onCheckedChange={setAbComparison}
                  />
                  <Label className="text-xs">A/B Auto-Switch</Label>
                </div>
              </div>
            </Card>
          )}

          {/* Match Intensity */}
          {referenceTrack && (
            <div className="space-y-2">
              <Label className="text-sm text-zinc-400">
                Match Intensity: {matchIntensity[0]}%
              </Label>
              <Slider
                value={matchIntensity}
                onValueChange={setMatchIntensity}
                min={0}
                max={100}
                step={5}
              />
              <p className="text-xs text-zinc-500">
                Higher values match the reference more closely
              </p>
            </div>
          )}
        </div>

        {/* Right Panel - Analysis Results */}
        <div className="flex-1 overflow-auto p-4">
          {referenceTrack ? (
            <Tabs defaultValue="frequency" className="h-full flex flex-col">
              <TabsList className="bg-zinc-900 mb-4">
                <TabsTrigger value="frequency">
                  <BarChart3 className="w-4 h-4 mr-1" />
                  Frequency
                </TabsTrigger>
                <TabsTrigger value="dynamics">
                  <Waveform className="w-4 h-4 mr-1" />
                  Dynamics
                </TabsTrigger>
                <TabsTrigger value="stereo">
                  <Layers className="w-4 h-4 mr-1" />
                  Stereo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="frequency" className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Frequency Balance Comparison</h3>
                  <Button
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600"
                    onClick={applyEQMatch}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Apply EQ Match
                  </Button>
                </div>

                <div className="space-y-3">
                  {referenceTrack.analysis.frequency.map((band, idx) => (
                    <motion.div
                      key={band.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-zinc-900 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{band.name}</span>
                          <span className="text-xs text-zinc-500 ml-2">
                            {band.range}
                          </span>
                        </div>
                        {getDifferenceBar(band.difference)}
                      </div>
                      <p className="text-xs text-zinc-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        {band.suggestion}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="dynamics" className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Dynamics Comparison</h3>
                  <Button
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600"
                    onClick={applyDynamicsMatch}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Apply Dynamics Match
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-2">Your Mix</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">LUFS</span>
                        <span className="font-mono">
                          {currentAnalysis.dynamics.lufs} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Peak</span>
                        <span className="font-mono">
                          {currentAnalysis.dynamics.peak} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Dynamic Range</span>
                        <span className="font-mono">
                          {currentAnalysis.dynamics.dynamicRange} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Crest Factor</span>
                        <span className="font-mono">
                          {currentAnalysis.dynamics.crestFactor} dB
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-2">Reference</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">LUFS</span>
                        <span className="font-mono text-purple-400">
                          {referenceTrack.analysis.dynamics.lufs} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Peak</span>
                        <span className="font-mono text-purple-400">
                          {referenceTrack.analysis.dynamics.peak} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Dynamic Range</span>
                        <span className="font-mono text-purple-400">
                          {referenceTrack.analysis.dynamics.dynamicRange} dB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Crest Factor</span>
                        <span className="font-mono text-purple-400">
                          {referenceTrack.analysis.dynamics.crestFactor} dB
                        </span>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    AI Suggestions
                  </h4>
                  <ul className="space-y-2 text-sm text-zinc-400">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>
                        Apply 2:1 compression with 5ms attack and 80ms release
                        on master bus
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>
                        Use a limiter with -0.3dB ceiling and 3dB gain reduction
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>
                        Your mix has more dynamic range - consider whether this
                        is intentional
                      </span>
                    </li>
                  </ul>
                </Card>
              </TabsContent>

              <TabsContent value="stereo" className="flex-1 space-y-4">
                <h3 className="font-medium">Stereo Image Comparison</h3>

                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-4">Your Mix</h4>

                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Stereo Width</span>
                          <span className="font-mono">
                            {currentAnalysis.stereo.width}%
                          </span>
                        </div>
                        <Progress
                          value={currentAnalysis.stereo.width}
                          className="h-2"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Correlation</span>
                          <span className="font-mono">
                            {currentAnalysis.stereo.correlation.toFixed(2)}
                          </span>
                        </div>
                        <Progress
                          value={currentAnalysis.stereo.correlation * 100}
                          className="h-2"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Balance</span>
                          <span className="font-mono">
                            {currentAnalysis.stereo.balance > 0 ? "+" : ""}
                            {currentAnalysis.stereo.balance}%
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full relative">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                          <div
                            className="absolute top-0 bottom-0 w-2 bg-blue-500 rounded-full"
                            style={{
                              left: `calc(50% + ${currentAnalysis.stereo.balance}%)`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-4">Reference</h4>

                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Stereo Width</span>
                          <span className="font-mono text-purple-400">
                            {referenceTrack.analysis.stereo.width}%
                          </span>
                        </div>
                        <Progress
                          value={referenceTrack.analysis.stereo.width}
                          className="h-2"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Correlation</span>
                          <span className="font-mono text-purple-400">
                            {referenceTrack.analysis.stereo.correlation.toFixed(
                              2,
                            )}
                          </span>
                        </div>
                        <Progress
                          value={
                            referenceTrack.analysis.stereo.correlation * 100
                          }
                          className="h-2"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Balance</span>
                          <span className="font-mono text-purple-400">
                            {referenceTrack.analysis.stereo.balance > 0
                              ? "+"
                              : ""}
                            {referenceTrack.analysis.stereo.balance}%
                          </span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full relative">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                          <div
                            className="absolute top-0 bottom-0 w-2 bg-purple-500 rounded-full"
                            style={{
                              left: `calc(50% + ${referenceTrack.analysis.stereo.balance}%)`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    AI Suggestions
                  </h4>
                  <ul className="space-y-2 text-sm text-zinc-400">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>
                        Widen your mix by{" "}
                        {referenceTrack.analysis.stereo.width -
                          currentAnalysis.stereo.width}
                        % using mid/side processing
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>
                        Reference has lower correlation - try adding subtle
                        stereo widening effects
                      </span>
                    </li>
                  </ul>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Target className="w-20 h-20 mb-4 opacity-20" />
              <p className="text-lg font-medium">No Reference Track</p>
              <p className="text-sm mt-1">
                Upload a professionally mixed track to compare
              </p>
              <p className="text-xs mt-4 max-w-xs text-center">
                The AI will analyze frequency balance, dynamics, and stereo
                image, then suggest exactly how to match your mix
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateReferenceMatch;
