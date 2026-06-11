import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useStudioStore,
  type MasteringProject,
  type MasteringSong,
} from "@/lib/studioStore";
import { useToast } from "@/hooks/use-toast";
import { Disc3, Music, Play, Pause, Plus, Trash2, GripVertical, Volume2, Activity, Download, Loader2, RefreshCw, AudioWaveform, Gauge, Settings2, Sparkles } from "lucide-react";

interface ProjectPageProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MasterChainSettings {
  eq: {
    lowGain: number;
    midGain: number;
    highGain: number;
    bypass: boolean;
  };
  compressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    bypass: boolean;
  };
  limiter: {
    ceiling: number;
    release: number;
    bypass: boolean;
  };
}

const DEFAULT_MASTER_CHAIN: MasterChainSettings = {
  eq: { lowGain: 0, midGain: 0, highGain: 0, bypass: false },
  compressor: {
    threshold: -12,
    ratio: 4,
    attack: 10,
    release: 100,
    bypass: false,
  },
  limiter: { ceiling: -0.3, release: 50, bypass: false },
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getLoudnessColor(lufs: number): string {
  if (lufs >= -6) return "#ef4444";
  if (lufs >= -9) return "#f97316";
  if (lufs >= -12) return "#eab308";
  return "#22c55e";
}


function MockWaveform({
  color = "#3b82f6",
  height = 40,
}: {
  color?: string;
  height?: number;
}) {
  const bars = Array.from({ length: 60 }, () => Math.random() * 0.8 + 0.2);
  return (
    <div className="flex items-center gap-[1px] h-full" style={{ height }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${h * 100}%`,
            backgroundColor: color,
            opacity: 0.6 + h * 0.4,
          }}
        />
      ))}
    </div>
  );
}


function SongRow({
  song,
  index,
  onPlay,
  onAnalyze,
  onMaster,
  onRemove,
  isPlaying,
  targetLoudness,
}: {
  song: MasteringSong;
  index: number;
  onPlay: () => void;
  onAnalyze: () => void;
  onMaster: () => void;
  onRemove: () => void;
  isPlaying: boolean;
  targetLoudness: number;
}) {
  const needsRemaster =
    song.masteredFileUrl && song.lastUpdated > Date.now() - 60000;
  const loudnessColor = song.loudness
    ? getLoudnessColor(song.loudness)
    : "#6b7280";

  return (
    <div
      className="group flex items-center gap-3 p-3 rounded-lg border transition-all hover:bg-muted/50"
      style={{ borderColor: "var(--studio-border-subtle)" }}
    >
      <div className="flex items-center gap-2 w-8">
        <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
        <span className="text-sm font-mono text-muted-foreground">
          {index + 1}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onPlay}
        disabled={song.isProcessing}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{song.title}</span>
          {needsRemaster && (
            <Badge
              variant="outline"
              className="text-amber-500 border-amber-500/50"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Needs Update
            </Badge>
          )}
          {song.isProcessing && (
            <Badge variant="secondary">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Processing
            </Badge>
          )}
        </div>

        <div className="h-8 bg-muted/30 rounded overflow-hidden">
          <MockWaveform color={loudnessColor} height={32} />
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="text-right min-w-[60px]">
          <div className="text-muted-foreground">Duration</div>
          <div className="font-mono">{formatDuration(song.duration)}</div>
        </div>

        <div className="text-right min-w-[80px]">
          <div className="text-muted-foreground">Loudness</div>
          {song.loudness !== undefined ? (
            <div className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: loudnessColor }}
              />
              <span className="font-mono">{song.loudness.toFixed(1)} LUFS</span>
            </div>
          ) : (
            <span className="text-muted-foreground italic">Not analyzed</span>
          )}
        </div>

        <div className="text-right min-w-[60px]">
          <div className="text-muted-foreground">Peak</div>
          {song.peakLevel !== undefined ? (
            <span
              className="font-mono"
              style={{ color: song.peakLevel > -1 ? "#ef4444" : "inherit" }}
            >
              {song.peakLevel.toFixed(1)} dB
            </span>
          ) : (
            <span className="text-muted-foreground italic">—</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onAnalyze}
                disabled={song.isProcessing}
              >
                <Activity className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Analyze Loudness</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onMaster}
                disabled={song.isProcessing}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Master Track</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={onRemove}
                disabled={song.isProcessing}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove from Project</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}

export function ProjectPage({ isOpen, onClose }: ProjectPageProps) {
  const { toast } = useToast();
  const {
    masteringProjects,
    activeMasteringProjectId,
    
    createMasteringProject,
    
    setActiveMasteringProject,
    addSongToProject,
    removeSongFromProject,
    
    updateMasteringSettings,
    updateMasteringSong,
    setMasteringProcessing,
    getActiveMasteringProject,
  } = useStudioStore();

  const [newProjectName, setNewProjectName] = useState("");
  const [masterChain, setMasterChain] =
    useState<MasterChainSettings>(DEFAULT_MASTER_CHAIN);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [masteringProgress, setMasteringProgress] = useState(0);
  const [isMasteringAll, setIsMasteringAll] = useState(false);

  const activeProject = getActiveMasteringProject();

  const handleCreateProject = useCallback(() => {
    if (!newProjectName.trim()) {
      toast({
        title: "Project name required",
        description: "Please enter a name for your mastering project.",
        variant: "destructive",
      });
      return;
    }
    createMasteringProject(newProjectName.trim());
    setNewProjectName("");
    toast({
      title: "Project created",
      description: `"${newProjectName}" has been created.`,
    });
  }, [newProjectName, createMasteringProject, toast]);

  const handleAddDemoSong = useCallback(() => {
    if (!activeProject) return;
    const demoSong: Partial<MasteringSong> = {
      title: `Track ${activeProject.songs.length + 1}`,
      duration: Math.floor(Math.random() * 180) + 120,
      sourceFileUrl: "/demo/track.wav",
    };
    addSongToProject(activeProject.id, demoSong);
  }, [activeProject, addSongToProject]);

  const analyzeLoudness = useCallback(
    async (projectId: string, songId: string) => {
      updateMasteringSong(projectId, songId, { isProcessing: true });
      await new Promise((r) => setTimeout(r, 1500));
      const loudness = -(Math.random() * 10 + 8);
      const peakLevel = -(Math.random() * 3 + 0.5);
      updateMasteringSong(projectId, songId, {
        isProcessing: false,
        loudness,
        peakLevel,
      });
      toast({
        title: "Analysis complete",
        description: `Measured loudness: ${loudness.toFixed(1)} LUFS`,
      });
    },
    [updateMasteringSong, toast],
  );

  const masterSong = useCallback(
    async (projectId: string, songId: string) => {
      updateMasteringSong(projectId, songId, { isProcessing: true });
      for (let i = 0; i <= 100; i += 10) {
        await new Promise((r) => setTimeout(r, 200));
      }
      const project = masteringProjects.find((p) => p.id === projectId);
      updateMasteringSong(projectId, songId, {
        isProcessing: false,
        masteredFileUrl: `/mastered/${songId}.wav`,
        loudness: project.targetLoudness || -14,
        peakLevel: -1.0,
        lastUpdated: Date.now(),
      });
      toast({
        title: "Mastering complete",
        description: "Track has been mastered successfully.",
      });
    },
    [masteringProjects, updateMasteringSong, toast],
  );

  const masterAllSongs = useCallback(async () => {
    if (!activeProject || activeProject.songs.length === 0) return;
    setIsMasteringAll(true);
    setMasteringProcessing(true);
    setMasteringProgress(0);

    const totalSongs = activeProject.songs.length;
    for (let i = 0; i < totalSongs; i++) {
      const song = activeProject.songs[i];
      updateMasteringSong(activeProject.id, song.id, { isProcessing: true });
      for (let p = 0; p <= 100; p += 20) {
        await new Promise((r) => setTimeout(r, 100));
        setMasteringProgress(((i + p / 100) / totalSongs) * 100);
      }
      updateMasteringSong(activeProject.id, song.id, {
        isProcessing: false,
        masteredFileUrl: `/mastered/${song.id}.wav`,
        loudness: activeProject.targetLoudness,
        peakLevel: -1.0,
        lastUpdated: Date.now(),
      });
    }

    setMasteringProgress(100);
    setMasteringProcessing(false);
    setIsMasteringAll(false);
    toast({
      title: "All tracks mastered",
      description: `${totalSongs} tracks have been processed.`,
    });
  }, [activeProject, updateMasteringSong, setMasteringProcessing, toast]);

  const exportMaster = useCallback(() => {
    if (!activeProject) return;
    toast({
      title: "Export started",
      description: `Exporting ${activeProject.songs.length} tracks as ${activeProject.format.toUpperCase()}...`,
    });
    setTimeout(() => {
      toast({
        title: "Export complete",
        description: "Your mastered files are ready for download.",
      });
    }, 2000);
  }, [activeProject, toast]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden bg-background p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Disc3 className="h-6 w-6" />
            Mastering Suite
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-[calc(90vh-100px)]">
          <div
            className="w-64 border-r p-4 space-y-4"
            style={{ borderColor: "var(--studio-border)" }}
          >
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Projects
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="New project name..."
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                  className="h-8 text-sm"
                />
                <Button
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCreateProject}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="h-[200px]">
              <div className="space-y-1">
                {masteringProjects.map((project) => (
                  <div
                    key={project.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      project.id === activeMasteringProjectId
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setActiveMasteringProject(project.id)}
                  >
                    <Music className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">
                        {project.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {project.songs.length} tracks
                      </div>
                    </div>
                  </div>
                ))}
                {masteringProjects.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No projects yet
                  </div>
                )}
              </div>
            </ScrollArea>

            <Separator />

            {activeProject && (
              <div className="space-y-4">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Export Settings
                </Label>

                <div className="space-y-3">
                  <div>
                    <Label className="text-xs mb-1 block">Format</Label>
                    <Select
                      value={activeProject.format}
                      onValueChange={(v) =>
                        updateMasteringSettings(activeProject.id, {
                          format: v as MasteringProject["format"],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wav">WAV</SelectItem>
                        <SelectItem value="mp3">MP3</SelectItem>
                        <SelectItem value="flac">FLAC</SelectItem>
                        <SelectItem value="aiff">AIFF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs mb-1 block">Sample Rate</Label>
                    <Select
                      value={String(activeProject.sampleRate)}
                      onValueChange={(v) =>
                        updateMasteringSettings(activeProject.id, {
                          sampleRate: Number(
                            v,
                          ) as MasteringProject["sampleRate"],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="44100">44.1 kHz</SelectItem>
                        <SelectItem value="48000">48 kHz</SelectItem>
                        <SelectItem value="96000">96 kHz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs mb-1 block">Bit Depth</Label>
                    <Select
                      value={String(activeProject.bitDepth)}
                      onValueChange={(v) =>
                        updateMasteringSettings(activeProject.id, {
                          bitDepth: Number(v) as MasteringProject["bitDepth"],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16">16-bit</SelectItem>
                        <SelectItem value="24">24-bit</SelectItem>
                        <SelectItem value="32">32-bit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Target Loudness</Label>
                      <span className="text-xs font-mono">
                        {activeProject.targetLoudness} LUFS
                      </span>
                    </div>
                    <Slider
                      value={[activeProject.targetLoudness]}
                      min={-18}
                      max={-6}
                      step={0.5}
                      onValueChange={([v]) =>
                        updateMasteringSettings(activeProject.id, {
                          targetLoudness: v,
                        })
                      }
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>-18</span>
                      <span>-6</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col">
            {activeProject ? (
              <>
                <div
                  className="p-4 border-b flex items-center justify-between"
                  style={{ borderColor: "var(--studio-border)" }}
                >
                  <div>
                    <h2 className="text-lg font-semibold">
                      {activeProject.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {activeProject.songs.length} tracks •{" "}
                      {formatDuration(
                        activeProject.songs.reduce(
                          (acc, s) => acc + s.duration,
                          0,
                        ),
                      )}{" "}
                      total
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddDemoSong}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Track
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={masterAllSongs}
                      disabled={
                        isMasteringAll || activeProject.songs.length === 0
                      }
                    >
                      {isMasteringAll ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Mastering...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          Master All
                        </>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={exportMaster}
                      disabled={activeProject.songs.length === 0}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </div>
                </div>

                {isMasteringAll && (
                  <div
                    className="px-4 py-2 bg-primary/5 border-b"
                    style={{ borderColor: "var(--studio-border)" }}
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>Mastering all tracks...</span>
                          <span className="font-mono">
                            {Math.round(masteringProgress)}%
                          </span>
                        </div>
                        <Progress value={masteringProgress} className="h-2" />
                      </div>
                    </div>
                  </div>
                )}

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {activeProject.songs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <AudioWaveform className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="font-medium mb-1">No tracks yet</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Add tracks to start mastering your project
                        </p>
                        <Button variant="outline" onClick={handleAddDemoSong}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Demo Track
                        </Button>
                      </div>
                    ) : (
                      activeProject.songs
                        .sort((a, b) => a.order - b.order)
                        .map((song, index) => (
                          <SongRow
                            key={song.id}
                            song={song}
                            index={index}
                            isPlaying={playingSongId === song.id}
                            targetLoudness={activeProject.targetLoudness}
                            onPlay={() =>
                              setPlayingSongId(
                                playingSongId === song.id ? null : song.id,
                              )
                            }
                            onAnalyze={() =>
                              analyzeLoudness(activeProject.id, song.id)
                            }
                            onMaster={() =>
                              masterSong(activeProject.id, song.id)
                            }
                            onRemove={() =>
                              removeSongFromProject(activeProject.id, song.id)
                            }
                          />
                        ))
                    )}
                  </div>
                </ScrollArea>

                <div
                  className="p-4 border-t"
                  style={{ borderColor: "var(--studio-border)" }}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground mb-2 block">
                        Master Chain
                      </Label>
                      <div className="flex items-center gap-2">
                        <Card className="flex-1 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Settings2 className="h-4 w-4" />
                            <span className="text-sm font-medium">EQ</span>
                            <Badge
                              variant={
                                masterChain.eq.bypass ? "secondary" : "default"
                              }
                              className="text-xs cursor-pointer"
                              onClick={() =>
                                setMasterChain((p) => ({
                                  ...p,
                                  eq: { ...p.eq, bypass: !p.eq.bypass },
                                }))
                              }
                            >
                              {masterChain.eq.bypass ? "OFF" : "ON"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">Low</span>
                              <span className="font-mono">
                                {masterChain.eq.lowGain > 0 ? "+" : ""}
                                {masterChain.eq.lowGain}dB
                              </span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">Mid</span>
                              <span className="font-mono">
                                {masterChain.eq.midGain > 0 ? "+" : ""}
                                {masterChain.eq.midGain}dB
                              </span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">
                                High
                              </span>
                              <span className="font-mono">
                                {masterChain.eq.highGain > 0 ? "+" : ""}
                                {masterChain.eq.highGain}dB
                              </span>
                            </div>
                          </div>
                        </Card>

                        <Card className="flex-1 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Gauge className="h-4 w-4" />
                            <span className="text-sm font-medium">
                              Compressor
                            </span>
                            <Badge
                              variant={
                                masterChain.compressor.bypass
                                  ? "secondary"
                                  : "default"
                              }
                              className="text-xs cursor-pointer"
                              onClick={() =>
                                setMasterChain((p) => ({
                                  ...p,
                                  compressor: {
                                    ...p.compressor,
                                    bypass: !p.compressor.bypass,
                                  },
                                }))
                              }
                            >
                              {masterChain.compressor.bypass ? "OFF" : "ON"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">
                                Thresh
                              </span>
                              <span className="font-mono">
                                {masterChain.compressor.threshold}dB
                              </span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">
                                Ratio
                              </span>
                              <span className="font-mono">
                                {masterChain.compressor.ratio}:1
                              </span>
                            </div>
                          </div>
                        </Card>

                        <Card className="flex-1 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Volume2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Limiter</span>
                            <Badge
                              variant={
                                masterChain.limiter.bypass
                                  ? "secondary"
                                  : "default"
                              }
                              className="text-xs cursor-pointer"
                              onClick={() =>
                                setMasterChain((p) => ({
                                  ...p,
                                  limiter: {
                                    ...p.limiter,
                                    bypass: !p.limiter.bypass,
                                  },
                                }))
                              }
                            >
                              {masterChain.limiter.bypass ? "OFF" : "ON"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">
                                Ceiling
                              </span>
                              <span className="font-mono">
                                {masterChain.limiter.ceiling}dB
                              </span>
                            </div>
                            <div className="flex flex-col items-center">
                              <span className="text-muted-foreground">
                                Release
                              </span>
                              <span className="font-mono">
                                {masterChain.limiter.release}ms
                              </span>
                            </div>
                          </div>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <Disc3 className="h-16 w-16 text-muted-foreground/30 mb-6" />
                <h2 className="text-xl font-semibold mb-2">
                  Welcome to the Mastering Suite
                </h2>
                <p className="text-muted-foreground max-w-md mb-6">
                  Create a mastering project to organize and master your tracks
                  with professional loudness targeting, EQ, compression, and
                  limiting.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter project name..."
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleCreateProject()
                    }
                    className="w-64"
                  />
                  <Button onClick={handleCreateProject}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create Project
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
