import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Headphones,
  Mic,
  MicOff,
  Volume2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileAudioDialogProps {
  open: boolean;
  onClose: () => void;
}

type PermissionState = "unknown" | "granted" | "denied" | "requesting";

export default function MobileAudioDialog({
  open,
  onClose,
}: MobileAudioDialogProps) {
  const [micPermission, setMicPermission] =
    useState<PermissionState>("unknown");
  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const SAMPLE_RATES = [44100, 48000, 96000];

  const checkPermissions = useCallback(async () => {
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        setMicPermission(
          result.state === "granted"
            ? "granted"
            : result.state === "denied"
              ? "denied"
              : "unknown",
        );
        result.addEventListener("change", () => {
          setMicPermission(
            result.state === "granted"
              ? "granted"
              : result.state === "denied"
                ? "denied"
                : "unknown",
          );
        });
      }
    } catch {
      setMicPermission("unknown");
    }
  }, []);

  useEffect(() => {
    if (open) checkPermissions();
  }, [open, checkPermissions]);

  const requestMicPermission = useCallback(async () => {
    setMicPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  }, []);

  const testAudio = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const ctx = new AudioContext({ sampleRate });
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      gain.gain.value = 0.15;
      osc.start();
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.3, 0.1);
      setTimeout(async () => {
        osc.stop();
        await ctx.close();
        setTestResult(`OK — ${sampleRate / 1000}kHz @ ${ctx.sampleRate}Hz`);
        setIsTesting(false);
      }, 500);
    } catch (err) {
      setTestResult("Failed: " + String(err));
      setIsTesting(false);
    }
  }, [sampleRate]);

  if (!open) return null;

  const micGranted = micPermission === "granted";
  const micDenied = micPermission === "denied";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-lg bg-[#1a1a2e] rounded-t-2xl border border-white/10 shadow-2xl pb-safe">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-blue-400" />
            <span className="font-semibold text-white">Audio Settings</span>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
              Microphone Access
            </p>
            <div
              className={cn(
                "flex items-center justify-between p-4 rounded-xl border transition-colors",
                micGranted
                  ? "bg-emerald-900/20 border-emerald-500/30"
                  : micDenied
                    ? "bg-red-900/20 border-red-500/30"
                    : "bg-white/5 border-white/10",
              )}
            >
              <div className="flex items-center gap-3">
                {micGranted ? (
                  <Mic className="h-5 w-5 text-emerald-400" />
                ) : micDenied ? (
                  <MicOff className="h-5 w-5 text-red-400" />
                ) : (
                  <Mic className="h-5 w-5 text-white/40" />
                )}
                <div>
                  <p className="text-sm font-medium text-white">
                    {micGranted
                      ? "Microphone enabled"
                      : micDenied
                        ? "Access denied"
                        : "Microphone access"}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {micGranted
                      ? "Recording is available"
                      : micDenied
                        ? "Enable in device settings"
                        : "Required for recording"}
                  </p>
                </div>
              </div>
              {!micGranted && !micDenied && (
                <button
                  onClick={requestMicPermission}
                  disabled={micPermission === "requesting"}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                >
                  {micPermission === "requesting" ? "Requesting…" : "Allow"}
                </button>
              )}
              {micGranted && (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              )}
              {micDenied && <AlertCircle className="h-5 w-5 text-red-400" />}
            </div>
          </div>

          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
              Sample Rate
            </p>
            <div className="flex gap-2">
              {SAMPLE_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setSampleRate(rate)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                    sampleRate === rate
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white",
                  )}
                >
                  {rate / 1000}kHz
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">
              Output
            </p>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
              <Volume2 className="h-5 w-5 text-white/50" />
              <div>
                <p className="text-sm text-white">System Default</p>
                <p className="text-xs text-white/40">Managed by your device</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={testAudio}
              disabled={isTesting}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border transition-colors",
                isTesting
                  ? "bg-white/5 border-white/10 text-white/40"
                  : "bg-white/5 border-white/10 text-white hover:bg-white/10",
              )}
            >
              <Volume2 className="h-4 w-4" />
              {isTesting ? "Testing…" : "Test Audio"}
            </button>
            <button
              onClick={checkPermissions}
              className="h-12 w-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {testResult && (
            <div
              className={cn(
                "p-3 rounded-xl text-xs font-mono border",
                testResult.startsWith("OK")
                  ? "bg-emerald-900/20 border-emerald-500/30 text-emerald-300"
                  : "bg-red-900/20 border-red-500/30 text-red-300",
              )}
            >
              {testResult}
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
