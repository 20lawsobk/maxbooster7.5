// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRequireAdmin } from "@/hooks/useRequireAuth";
import {
  Brain,
  Play,
  Square,
  RefreshCw,
  Database,
  Activity,
  Cpu,
  Clock,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  Layers,
  BarChart2,
  HardDrive,
} from "lucide-react";

interface TrainStatus {
  status: "idle" | "running" | "stopping" | "stopped" | "error";
  phase: number;
  phase_name: string;
  epoch: number;
  step: number;
  loss: number | null;
  loss_history: Array<{
    session: number;
    loss: number;
    phase: number;
    ts: number;
  }>;
  total_samples: number;
  session_count: number;
  start_time: number | null;
  elapsed_sec: number;
  error: string | null;
  weights_path: string | null;
  last_save: number | null;
  dataset_stats: Record<string, number | boolean | string>;
}

interface DatasetInfo {
  success: boolean;
  stats: {
    hmdb51_clips: number;
    ucf101_clips: number;
    musiccaps_captions: number;
    audiocaps_captions: number;
    fma_tracks: number;
    has_video_data: boolean;
    has_prompt_data: boolean;
    total_video_clips: number;
    total_text_items: number;
  };
  disk_gb: Record<string, number>;
  total_gb: number;
}

interface ScheduleInfo {
  success: boolean;
  schedule: Array<{
    phase_id: number;
    name: string;
    T: number;
    res: number;
    lr: number;
    days: string;
    training_focus: string;
    datasets: string[];
  }>;
  current_status: {
    current_day: number;
    current_phase: number;
    phase_name: string;
    progress_pct: number;
  };
}

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as Record<string, unknown>).error || res.statusText);
  }
  return res.json();
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusBadge({ status }: { status: TrainStatus["status"] }) {
  const map: Record<
    TrainStatus["status"],
    { label: string; className: string }
  > = {
    idle: { label: "Idle", className: "bg-gray-500/20 text-gray-400" },
    running: {
      label: "Training",
      className: "bg-green-500/20 text-green-400 animate-pulse",
    },
    stopping: {
      label: "Stopping",
      className: "bg-yellow-500/20 text-yellow-400",
    },
    stopped: { label: "Stopped", className: "bg-blue-500/20 text-blue-400" },
    error: { label: "Error", className: "bg-red-500/20 text-red-400" },
  };
  const { label, className } = map[status] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
      )}
      {label}
    </span>
  );
}

function MiniLossChart({ history }: { history: TrainStatus["loss_history"] }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 text-gray-500 text-xs">
        No loss data yet — start training to see the curve
      </div>
    );
  }

  const maxLoss = Math.max(...history.map((h) => h.loss));
  const minLoss = Math.min(...history.map((h) => h.loss));
  const range = maxLoss - minLoss || 1;
  const W = 400,
    H = 80,
    pad = 4;

  const pts = history
    .map((h, i) => {
      const x = pad + (i / ((history.length - 1 || 1))) * (W - pad * 2);
      const y = pad + (1 - (h.loss - minLoss) / range) * (H - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <defs>
          <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={pts}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x={pad} y={H - 2} fontSize="8" fill="#6b7280">
          s{history[0].session}
        </text>
        <text x={W - pad - 20} y={H - 2} fontSize="8" fill="#6b7280">
          s{history[history.length - 1].session}
        </text>
        <text x={pad} y={10} fontSize="8" fill="#6b7280">
          {maxLoss.toFixed(4)}
        </text>
        <text x={pad} y={H - 12} fontSize="8" fill="#6b7280">
          {minLoss.toFixed(4)}
        </text>
      </svg>
    </div>
  );
}

export default function TrainingDashboard() {
  const {  isLoading: authLoading } = useRequireAdmin();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"session" | "day" | "continuous">("session");
  const [nSessions, setNSessions] = useState(3);

  const { data: status, isError: statusError } = useQuery<TrainStatus>({
    queryKey: ["training-status"],
    queryFn: () => apiFetch("/api/training/status"),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ||
      query.state.data?.status === "stopping"
        ? 3000
        : 15000,
    retry: false,
  });

  const { data: datasets } = useQuery<DatasetInfo>({
    queryKey: ["training-datasets"],
    queryFn: () => apiFetch("/api/training/datasets"),
    staleTime: 60_000,
    retry: false,
  });

  const { data: schedule } = useQuery<ScheduleInfo>({
    queryKey: ["training-schedule"],
    queryFn: () => apiFetch("/api/training/schedule"),
    staleTime: 300_000,
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/training/start", {
        method: "POST",
        body: JSON.stringify({ mode, n_sessions: nSessions }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-status"] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => apiFetch("/api/training/stop", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-status"] }),
  });

  const isRunning = status?.status === "running";
  const isStopping = status?.status === "stopping";
  const canStart = !isRunning && !isStopping;

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-7 h-7 text-indigo-400" />
            <div>
              <h1 className="text-xl font-semibold text-white">
                Model Training
              </h1>
              <p className="text-sm text-gray-400">
                UNetV4 · 463M params · 30-day curriculum
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && <StatusBadge status={status.status} />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                qc.invalidateQueries({ queryKey: ["training-status"] })
              }
              className="text-gray-400"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Error alert */}
        {status?.error && (
          <Alert className="border-red-500/30 bg-red-500/10">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <AlertDescription className="text-red-300 text-sm">
              {status.error}
            </AlertDescription>
          </Alert>
        )}

        {statusError && (
          <Alert className="border-yellow-500/30 bg-yellow-500/10">
            <AlertTriangle className="w-4 h-4 text-yellow-400" />
            <AlertDescription className="text-yellow-300 text-sm">
              Python AI service unavailable — make sure the server is running.
            </AlertDescription>
          </Alert>
        )}

        {/* Top stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">
                  Phase
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {status?.phase ?? "—"}
                <span className="text-gray-500 text-sm">/4</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 truncate">
                {status?.phase_name || "Not started"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-green-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">
                  Loss
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {status?.loss != null ? status.loss.toFixed(4) : "—"}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {status?.session_count ?? 0} sessions completed
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">
                  Samples
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {status?.total_samples != null
                  ? status.total_samples >= 1000
                    ? `${(status.total_samples / 1000).toFixed(1)}K`
                    : status.total_samples
                  : "—"}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">total trained</div>
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-400 uppercase tracking-wide">
                  Time
                </span>
              </div>
              <div className="text-2xl font-bold text-white">
                {status?.elapsed_sec ? formatDuration(status.elapsed_sec) : "—"}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">training time</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="control" className="space-y-4">
          <TabsList className="bg-gray-800 border border-gray-700">
            <TabsTrigger
              value="control"
              className="data-[state=active]:bg-gray-700"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Control
            </TabsTrigger>
            <TabsTrigger
              value="loss"
              className="data-[state=active]:bg-gray-700"
            >
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" />
              Loss Curve
            </TabsTrigger>
            <TabsTrigger
              value="datasets"
              className="data-[state=active]:bg-gray-700"
            >
              <Database className="w-3.5 h-3.5 mr-1.5" />
              Datasets
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="data-[state=active]:bg-gray-700"
            >
              <Cpu className="w-3.5 h-3.5 mr-1.5" />
              Curriculum
            </TabsTrigger>
          </TabsList>

          {/* Control Tab */}
          <TabsContent value="control" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm font-medium">
                    Start Training
                  </CardTitle>
                  <CardDescription className="text-gray-400 text-xs">
                    Runs the curriculum trainer which automatically advances
                    through phases
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">
                        Mode
                      </label>
                      <Select
                        value={mode}
                        onValueChange={(v) => setMode(v as typeof mode)}
                        disabled={!canStart}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200 text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-600">
                          <SelectItem
                            value="session"
                            className="text-gray-200 text-sm"
                          >
                            Single Session
                          </SelectItem>
                          <SelectItem
                            value="day"
                            className="text-gray-200 text-sm"
                          >
                            Day ({nSessions} sessions)
                          </SelectItem>
                          <SelectItem
                            value="continuous"
                            className="text-gray-200 text-sm"
                          >
                            Continuous (until stopped)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 block mb-1.5">
                        Sessions (Day mode)
                      </label>
                      <Select
                        value={String(nSessions)}
                        onValueChange={(v) => setNSessions(Number(v))}
                        disabled={!canStart || mode !== "day"}
                      >
                        <SelectTrigger className="bg-gray-800 border-gray-600 text-gray-200 text-sm h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-gray-600">
                          {[1, 2, 3, 5, 10].map((n) => (
                            <SelectItem
                              key={n}
                              value={String(n)}
                              className="text-gray-200 text-sm"
                            >
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
                      disabled={!canStart || startMutation.isPending}
                      onClick={() => startMutation.mutate()}
                    >
                      {startMutation.isPending ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Starting…
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 mr-1.5" />
                          Start Training
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm"
                      disabled={!isRunning || stopMutation.isPending}
                      onClick={() => stopMutation.mutate()}
                    >
                      {stopMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>

                  {startMutation.isError && (
                    <p className="text-red-400 text-xs">
                      {(startMutation.error as Error).message}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm font-medium">
                    Current Session
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-400">Status</span>
                      {status ? (
                        <StatusBadge status={status.status} />
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-400">Phase</span>
                      <span>
                        {status?.phase
                          ? `${status.phase} — ${status.phase_name}`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-400">Current Loss</span>
                      <span className="font-mono text-green-400">
                        {status?.loss != null ? status.loss.toFixed(5) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-400">Sessions Done</span>
                      <span>{status?.session_count ?? 0}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-400">Last Weights Save</span>
                      <span className="text-xs">
                        {status?.last_save
                          ? new Date(
                              status.last_save * 1000,
                            ).toLocaleTimeString()
                          : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span className="text-gray-400">Weights File</span>
                      <span className="text-xs text-gray-500 truncate max-w-[140px]">
                        {status?.weights_path
                          ? status.weights_path.split("/").pop()
                          : "weights_v4.npz"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 30-day progress */}
            {schedule?.current_status && (
              <Card className="bg-gray-900 border-gray-700">
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300">
                      30-Day Curriculum Progress
                    </span>
                    <span className="text-xs text-gray-400">
                      Day {schedule.current_status.current_day} / 30
                    </span>
                  </div>
                  <Progress
                    value={schedule.current_status.progress_pct ?? 0}
                    className="h-2"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    Phase {schedule.current_status.current_phase}:{" "}
                    {schedule.current_status.phase_name}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Loss Curve Tab */}
          <TabsContent value="loss">
            <Card className="bg-gray-900 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-green-400" />
                  Training Loss History
                </CardTitle>
                <CardDescription className="text-gray-400 text-xs">
                  {status?.loss_history?.length ?? 0} data points across{" "}
                  {status?.session_count ?? 0} sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MiniLossChart history={status?.loss_history ?? []} />

                {status?.loss_history && status.loss_history.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-gray-400 mb-1">First Loss</div>
                      <div className="text-white font-mono">
                        {status.loss_history[0].loss.toFixed(4)}
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-gray-400 mb-1">Best Loss</div>
                      <div className="text-green-400 font-mono">
                        {Math.min(
                          ...status.loss_history.map((h) => h.loss),
                        ).toFixed(4)}
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded p-2">
                      <div className="text-gray-400 mb-1">Latest Loss</div>
                      <div className="text-indigo-400 font-mono">
                        {status.loss_history[
                          status.loss_history.length - 1
                        ].loss.toFixed(4)}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Datasets Tab */}
          <TabsContent value="datasets">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {
                    label: "HMDB-51 Clips",
                    value: datasets.stats?.hmdb51_clips,
                    icon: "🎬",
                    color: "text-blue-400",
                  },
                  {
                    label: "UCF-101 Clips",
                    value: datasets.stats?.ucf101_clips,
                    icon: "🎬",
                    color: "text-blue-400",
                  },
                  {
                    label: "MusicCaps Captions",
                    value: datasets.stats?.musiccaps_captions,
                    icon: "🎵",
                    color: "text-purple-400",
                  },
                  {
                    label: "AudioCaps Captions",
                    value: datasets.stats?.audiocaps_captions,
                    icon: "🔊",
                    color: "text-teal-400",
                  },
                  {
                    label: "FMA Tracks",
                    value: datasets.stats?.fma_tracks,
                    icon: "🎼",
                    color: "text-orange-400",
                  },
                  {
                    label: "Total Disk Used",
                    value:
                      datasets?.total_gb != null
                        ? `${datasets.total_gb} GB`
                        : null,
                    icon: "💾",
                    color: "text-gray-300",
                  },
                ].map(({ label, value, icon, color }) => (
                  <Card key={label} className="bg-gray-900 border-gray-700">
                    <CardContent className="pt-3 pb-3">
                      <div className="text-lg mb-0.5">{icon}</div>
                      <div className={`text-xl font-bold ${color}`}>
                        {value != null ? (
                          typeof value === "number" ? (
                            value.toLocaleString()
                          ) : (
                            value
                          )
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {label}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-gray-400" />
                    Dataset Sizes on Disk
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {datasets?.disk_gb &&
                  Object.keys(datasets.disk_gb).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(datasets.disk_gb)
                        .filter(([, gb]) => gb > 0)
                        .sort(([, a], [, b]) => b - a)
                        .map(([name, gb]) => (
                          <div key={name} className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 w-32 truncate">
                              {name}
                            </span>
                            <div className="flex-1">
                              <Progress
                                value={Math.min(
                                  100,
                                  (gb / (datasets.total_gb || 1)) * 100,
                                )}
                                className="h-1.5"
                              />
                            </div>
                            <span className="text-xs text-gray-300 w-14 text-right">
                              {gb.toFixed(2)} GB
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      Loading dataset info…
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-700">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle
                      className={`w-4 h-4 ${datasets?.stats?.has_video_data ? "text-green-400" : "text-gray-600"}`}
                    />
                    <span className="text-sm text-gray-300">
                      Real video frames (
                      {datasets?.stats?.has_video_data
                        ? "active — 25% of training samples"
                        : "not yet available"}
                      )
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle
                      className={`w-4 h-4 ${datasets?.stats?.has_prompt_data ? "text-green-400" : "text-gray-600"}`}
                    />
                    <span className="text-sm text-gray-300">
                      Real music captions (
                      {datasets?.stats?.has_prompt_data
                        ? "active — 20% of training prompts"
                        : "not yet available"}
                      )
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Curriculum Tab */}
          <TabsContent value="schedule">
            <Card className="bg-gray-900 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm font-medium">
                  30-Day Training Curriculum
                </CardTitle>
                <CardDescription className="text-gray-400 text-xs">
                  Automatic phase progression based on loss targets
                </CardDescription>
              </CardHeader>
              <CardContent>
                {schedule?.schedule ? (
                  <div className="space-y-3">
                    {schedule.schedule.map((phase) => {
                      const isCurrent =
                        phase.phase_id ===
                        schedule.current_status?.current_phase;
                      return (
                        <div
                          key={phase.phase_id}
                          className={`rounded-lg p-3 border ${
                            isCurrent
                              ? "border-indigo-500/50 bg-indigo-500/10"
                              : "border-gray-700 bg-gray-800/50"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {isCurrent && (
                                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                              )}
                              <span className="text-sm font-medium text-white">
                                Phase {phase.phase_id}: {phase.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="text-xs border-gray-600 text-gray-400"
                              >
                                T={phase.T}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-xs border-gray-600 text-gray-400"
                              >
                                {phase.res}×{phase.res}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-xs border-gray-600 text-gray-400"
                              >
                                {phase.days}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-gray-400">
                            {phase.training_focus}
                          </p>
                          {phase.datasets?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {phase.datasets.slice(0, 4).map((d) => (
                                <span
                                  key={d}
                                  className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded"
                                >
                                  {d}
                                </span>
                              ))}
                              {phase.datasets.length > 4 && (
                                <span className="text-xs text-gray-500">
                                  +{phase.datasets.length - 4} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Loading curriculum…
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
