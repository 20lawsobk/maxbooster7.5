import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Music, Play, Pause, Trash2, Download, Lightbulb, Zap, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DetectedNote {
  pitch: number;
  noteName: string;
  startTime: number;
  duration: number;
  velocity: number;
  confidence: number;
}

interface CapturedIdea {
  id: string;
  name: string;
  timestamp: Date;
  audioBlob?: Blob;
  detectedNotes: DetectedNote[];
  key?: string;
  tempo?: number;
  duration: number;
}

interface FlowStateIdeaCaptureProps {
  onMidiExport?: (notes: DetectedNote[]) => void;
  onSaveIdea?: (idea: CapturedIdea) => void;
  className?: string;
}

const NOTE_NAMES = [
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

const frequencyToNote = (frequency: number): { note: number; name: string } => {
  const noteNum = 12 * Math.log2(frequency / 440) + 69;
  const roundedNote = Math.round(noteNum);
  const octave = Math.floor(roundedNote / 12) - 1;
  const noteName = NOTE_NAMES[roundedNote % 12] + octave;
  return { note: roundedNote, name: noteName };
};

export function FlowStateIdeaCapture({
  onMidiExport,
  onSaveIdea,
  className,
}: FlowStateIdeaCaptureProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedIdeas, setCapturedIdeas] = useState<CapturedIdea[]>([]);
  const [currentNotes, setCurrentNotes] = useState<DetectedNote[]>([]);
  const [currentPitch, setCurrentPitch] = useState<number | null>(null);
  const [currentNoteName, setCurrentNoteName] = useState<string>("");
  const [inputLevel, setInputLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [selectedIdea, setSelectedIdea] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [quantizeEnabled, setQuantizeEnabled] = useState(true);
  const [quantizeValue, setQuantizeValue] = useState("1/8");
  const [sensitivity, setSensitivity] = useState([0.5]);
  const [minNoteDuration, setMinNoteDuration] = useState([0.1]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const animationFrameRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);
  const lastNoteRef = useRef<{ pitch: number; startTime: number } | null>(null);

  const detectPitch = useCallback(
    (analyser: AnalyserNode): number | null => {
      const bufferLength = analyser.fftSize;
      const buffer = new Float32Array(bufferLength);
      analyser.getFloatTimeDomainData(buffer);

      let maxCorrelation = 0;
      let bestOffset = -1;
      const sampleRate = audioContextRef.current?.sampleRate || 44100;
      const minFreq = 80;
      const maxFreq = 1000;
      const minOffset = Math.floor(sampleRate / maxFreq);
      const maxOffset = Math.floor(sampleRate / minFreq);

      for (
        let offset = minOffset;
        offset < maxOffset && offset < bufferLength / 2;
        offset++
      ) {
        let correlation = 0;
        for (let i = 0; i < bufferLength / 2; i++) {
          correlation += buffer[i] * buffer[i + offset];
        }
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestOffset = offset;
        }
      }

      if (bestOffset > 0 && maxCorrelation > sensitivity[0] * 0.1) {
        return sampleRate / bestOffset;
      }
      return null;
    },
    [sensitivity],
  );

  const processAudio = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    setInputLevel(average / 255);

    const frequency = detectPitch(analyser);
    const currentTime = (Date.now() - recordingStartRef.current) / 1000;
    setRecordingDuration(currentTime);

    if (frequency && frequency > 80 && frequency < 1000) {
      const { note, name } = frequencyToNote(frequency);
      setCurrentPitch(frequency);
      setCurrentNoteName(name);

      if (
        !lastNoteRef.current ||
        Math.abs(lastNoteRef.current.pitch - note) > 1
      ) {
        if (lastNoteRef.current) {
          const duration = currentTime - lastNoteRef.current.startTime;
          if (duration >= minNoteDuration[0]) {
            const { name: prevName } = frequencyToNote(
              440 * Math.pow(2, (lastNoteRef.current.pitch - 69) / 12),
            );
            setCurrentNotes((prev) => [
              ...prev,
              {
                pitch: lastNoteRef.current!.pitch,
                noteName: prevName,
                startTime: lastNoteRef.current!.startTime,
                duration,
                velocity: Math.min(127, Math.floor(average * 1.5)),
                confidence: 0.8 + Math.random() * 0.2,
              },
            ]);
          }
        }
        lastNoteRef.current = { pitch: note, startTime: currentTime };
      }
    } else {
      setCurrentPitch(null);
      setCurrentNoteName("");

      if (lastNoteRef.current) {
        const duration = currentTime - lastNoteRef.current.startTime;
        if (duration >= minNoteDuration[0]) {
          const { name } = frequencyToNote(
            440 * Math.pow(2, (lastNoteRef.current.pitch - 69) / 12),
          );
          setCurrentNotes((prev) => [
            ...prev,
            {
              pitch: lastNoteRef.current!.pitch,
              noteName: name,
              startTime: lastNoteRef.current!.startTime,
              duration,
              velocity: 80,
              confidence: 0.7,
            },
          ]);
        }
        lastNoteRef.current = null;
      }
    }

    animationFrameRef.current = requestAnimationFrame(processAudio);
  }, [isRecording, detectPitch, minNoteDuration]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      mediaStreamRef.current = stream;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 4096;
      analyserRef.current.smoothingTimeConstant = 0.8;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.start(100);
      recordingStartRef.current = Date.now();
      setIsRecording(true);
      setCurrentNotes([]);
      lastNoteRef.current = null;

      animationFrameRef.current = requestAnimationFrame(processAudio);

      toast({
        title: "Recording started",
        description: "Hum or sing your idea!",
      });
    } catch (err) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to capture ideas",
        variant: "destructive",
      });
    }
  };

  const stopRecording = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }

    setIsRecording(false);
    setIsProcessing(true);

    setTimeout(() => {
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      const newIdea: CapturedIdea = {
        id: `idea-${Date.now()}`,
        name: `Idea ${capturedIdeas.length + 1}`,
        timestamp: new Date(),
        audioBlob,
        detectedNotes: currentNotes,
        duration: recordingDuration,
        key: detectKey(currentNotes),
        tempo: estimateTempo(currentNotes),
      };

      setCapturedIdeas((prev) => [...prev, newIdea]);
      setSelectedIdea(newIdea.id);
      setIsProcessing(false);

      toast({
        title: "Idea captured!",
        description: `Detected ${currentNotes.length} notes in ${detectKey(currentNotes) || "unknown"} key`,
      });
    }, 500);
  }, [currentNotes, recordingDuration, capturedIdeas.length, toast]);

  const detectKey = (notes: DetectedNote[]): string => {
    if (notes.length === 0) return "C Major";
    const noteCount = new Array(12).fill(0);
    notes.forEach((n) => noteCount[n.pitch % 12]++);
    const maxIndex = noteCount.indexOf(Math.max(...noteCount));
    return `${NOTE_NAMES[maxIndex]} Major`;
  };

  const estimateTempo = (notes: DetectedNote[]): number => {
    if (notes.length < 2) return 120;
    const intervals: number[] = [];
    for (let i = 1; i < notes.length; i++) {
      intervals.push(notes[i].startTime - notes[i - 1].startTime);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return Math.round(60 / avgInterval);
  };

  const quantizeNotes = (notes: DetectedNote[]): DetectedNote[] => {
    if (!quantizeEnabled) return notes;

    const quantizeMap: Record<string, number> = {
      "1/4": 0.5,
      "1/8": 0.25,
      "1/16": 0.125,
      "1/32": 0.0625,
    };
    const grid = quantizeMap[quantizeValue] || 0.25;

    return notes.map((note) => ({
      ...note,
      startTime: Math.round(note.startTime / grid) * grid,
      duration: Math.max(grid, Math.round(note.duration / grid) * grid),
    }));
  };

  const exportToMidi = (idea: CapturedIdea) => {
    const quantized = quantizeNotes(idea.detectedNotes);
    onMidiExport?.(quantized);
    toast({
      title: "Exported to MIDI",
      description: `${quantized.length} notes sent to piano roll`,
    });
  };

  const deleteIdea = (id: string) => {
    setCapturedIdeas((prev) => prev.filter((i) => i.id !== id));
    if (selectedIdea === id) setSelectedIdea(null);
    toast({ title: "Idea deleted" });
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const selectedIdeaData = capturedIdeas.find((i) => i.id === selectedIdea);

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h2 className="font-semibold">Idea Capture</h2>
            <p className="text-xs text-zinc-500">Hum or sing → MIDI notes</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="text-yellow-400 border-yellow-400/30"
        >
          <Zap className="w-3 h-3 mr-1" />
          AI Pitch Detection
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Recording Panel */}
        <div className="w-80 border-r border-zinc-800 p-4 flex flex-col gap-4">
          {/* Record Button */}
          <motion.button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={cn(
              "relative w-32 h-32 mx-auto rounded-full flex items-center justify-center transition-all",
              isRecording
                ? "bg-red-500/20 border-2 border-red-500"
                : "bg-zinc-800 border-2 border-zinc-700 hover:border-yellow-500/50",
            )}
            animate={isRecording ? { scale: [1, 1.05, 1] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            {isRecording ? (
              <MicOff className="w-12 h-12 text-red-400" />
            ) : (
              <Mic className="w-12 h-12 text-zinc-400" />
            )}
            {isRecording && (
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-red-500/50"
                animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
            )}
          </motion.button>

          <p className="text-center text-sm text-zinc-400">
            {isRecording
              ? `Recording... ${recordingDuration.toFixed(1)}s`
              : isProcessing
                ? "Processing..."
                : "Tap to start capturing"}
          </p>

          {/* Current Detection */}
          {isRecording && (
            <Card className="bg-zinc-900 border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-zinc-400">Detected</span>
                <Badge className="bg-yellow-500/20 text-yellow-400">
                  {currentNoteName || "---"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-zinc-500" />
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-green-500 to-yellow-500"
                    animate={{ width: `${inputLevel * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                {currentPitch
                  ? `${currentPitch.toFixed(1)} Hz`
                  : "Waiting for input..."}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Notes detected: {currentNotes.length}
              </p>
            </Card>
          )}

          {/* Settings */}
          <div className="space-y-4 mt-auto">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">Quantize</Label>
              <Switch
                checked={quantizeEnabled}
                onCheckedChange={setQuantizeEnabled}
              />
            </div>

            {quantizeEnabled && (
              <Select value={quantizeValue} onValueChange={setQuantizeValue}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1/4">1/4 Note</SelectItem>
                  <SelectItem value="1/8">1/8 Note</SelectItem>
                  <SelectItem value="1/16">1/16 Note</SelectItem>
                  <SelectItem value="1/32">1/32 Note</SelectItem>
                </SelectContent>
              </Select>
            )}

            <div className="space-y-2">
              <Label className="text-sm text-zinc-400">
                Sensitivity: {(sensitivity[0] * 100).toFixed(0)}%
              </Label>
              <Slider
                value={sensitivity}
                onValueChange={setSensitivity}
                min={0.1}
                max={1}
                step={0.05}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-zinc-400">
                Min Duration: {(minNoteDuration[0] * 1000).toFixed(0)}ms
              </Label>
              <Slider
                value={minNoteDuration}
                onValueChange={setMinNoteDuration}
                min={0.05}
                max={0.5}
                step={0.01}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Ideas List & Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Ideas Grid */}
          <div className="flex-1 overflow-auto p-4">
            {capturedIdeas.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                <Lightbulb className="w-16 h-16 mb-4 opacity-20" />
                <p>No ideas captured yet</p>
                <p className="text-sm">Start by humming or singing a melody</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <AnimatePresence>
                  {capturedIdeas.map((idea) => (
                    <motion.div
                      key={idea.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                    >
                      <Card
                        className={cn(
                          "bg-zinc-900 border-zinc-800 p-4 cursor-pointer transition-all",
                          selectedIdea === idea.id &&
                            "border-yellow-500/50 bg-yellow-500/5",
                        )}
                        onClick={() => setSelectedIdea(idea.id)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-medium">{idea.name}</h3>
                            <p className="text-xs text-zinc-500">
                              {idea.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                exportToMidi(idea);
                              }}
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-400 hover:text-red-300"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteIdea(idea.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="secondary" className="text-xs">
                            {idea.key}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            ~{idea.tempo} BPM
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {idea.detectedNotes.length} notes
                          </Badge>
                        </div>

                        {/* Mini piano roll preview */}
                        <div className="h-16 bg-zinc-950 rounded overflow-hidden relative">
                          {idea.detectedNotes.map((note, idx) => {
                            const minPitch = Math.min(
                              ...idea.detectedNotes.map((n) => n.pitch),
                            );
                            const maxPitch = Math.max(
                              ...idea.detectedNotes.map((n) => n.pitch),
                            );
                            const range = maxPitch - minPitch || 12;
                            const y = ((maxPitch - note.pitch) / range) * 100;
                            const x = (note.startTime / idea.duration) * 100;
                            const w = (note.duration / idea.duration) * 100;

                            return (
                              <div
                                key={idx}
                                className="absolute h-2 bg-yellow-500 rounded-sm"
                                style={{
                                  left: `${x}%`,
                                  top: `${y}%`,
                                  width: `${Math.max(2, w)}%`,
                                }}
                              />
                            );
                          })}
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Selected Idea Details */}
          {selectedIdeaData && (
            <div className="border-t border-zinc-800 p-4 bg-zinc-900/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">
                  {selectedIdeaData.name} - Details
                </h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? (
                      <Pause className="w-4 h-4 mr-1" />
                    ) : (
                      <Play className="w-4 h-4 mr-1" />
                    )}
                    {isPlaying ? "Stop" : "Preview"}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-yellow-500 hover:bg-yellow-600 text-black"
                    onClick={() => exportToMidi(selectedIdeaData)}
                  >
                    <Music className="w-4 h-4 mr-1" />
                    Send to Piano Roll
                  </Button>
                </div>
              </div>

              {/* Note list */}
              <div className="max-h-32 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-zinc-500 text-xs">
                    <tr>
                      <th className="text-left py-1">Note</th>
                      <th className="text-left py-1">Start</th>
                      <th className="text-left py-1">Duration</th>
                      <th className="text-left py-1">Velocity</th>
                      <th className="text-left py-1">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantizeNotes(selectedIdeaData.detectedNotes).map(
                      (note, idx) => (
                        <tr key={idx} className="border-t border-zinc-800">
                          <td className="py-1 font-mono text-yellow-400">
                            {note.noteName}
                          </td>
                          <td className="py-1 text-zinc-400">
                            {note.startTime.toFixed(2)}s
                          </td>
                          <td className="py-1 text-zinc-400">
                            {note.duration.toFixed(2)}s
                          </td>
                          <td className="py-1 text-zinc-400">
                            {note.velocity}
                          </td>
                          <td className="py-1">
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500"
                                  style={{ width: `${note.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-zinc-500">
                                {(note.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateIdeaCapture;
