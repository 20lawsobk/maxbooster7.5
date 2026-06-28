import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  useStudioStore,
  type AutomationMode,
  type EditTool,
} from "@/lib/studioStore";
import { PluginRack, type PluginInstance } from "./PluginRack";
import { Settings2, ChevronDown, ChevronUp, Palette, Volume2, Sliders, Zap, Music, FileAudio, GripVertical, X, ArrowRight, Radio, AudioWaveform, Clock, Hash, MousePointer2, Scissors, Move, Pencil } from "lucide-react";

interface InspectorPanelProps {
  selectedTrack?: Record<string, unknown>;
  selectedClip?: Record<string, unknown>;
  onTrackUpdate?: (trackId: string, updates: unknown) => void;
  onClipUpdate?: (clipId: string, updates: unknown) => void;
  plugins?: PluginInstance[];
  onPluginsChange?: (plugins: PluginInstance[]) => void;
  onClose?: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b" style={{ borderColor: "var(--studio-border)" }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && (
            <div style={{ color: "var(--studio-text-muted)" }}>{icon}</div>
          )}
          <span
            className="text-sm font-bold tracking-wide"
            style={{ color: "var(--studio-text)" }}
          >
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp
            className="h-4 w-4"
            style={{ color: "var(--studio-text-muted)" }}
          />
        ) : (
          <ChevronDown
            className="h-4 w-4"
            style={{ color: "var(--studio-text-muted)" }}
          />
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

interface ParameterControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

function ParameterControl({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  onChange,
}: ParameterControlProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label
          className="text-xs"
          style={{ color: "var(--studio-text-muted)" }}
        >
          {label}
        </Label>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--studio-text)" }}
        >
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([val]) => onChange(val)}
        min={min}
        max={max}
        step={step}
        className="cursor-pointer"
      />
    </div>
  );
}

const TRACK_COLORS = [
  "#4ade80",
  "#f87171",
  "#60a5fa",
  "#facc15",
  "#c084fc",
  "#fb923c",
  "#2dd4bf",
  "#f472b6",
  "#a3e635",
  "#818cf8",
];

const AUTOMATION_MODES: {
  mode: AutomationMode;
  label: string;
  color: string;
}[] = [
  { mode: "off", label: "OFF", color: "#6b7280" },
  { mode: "read", label: "READ", color: "#22c55e" },
  { mode: "write", label: "WRITE", color: "#ef4444" },
  { mode: "touch", label: "TOUCH", color: "#f59e0b" },
  { mode: "latch", label: "LATCH", color: "#a855f7" },
];

const EDIT_TOOLS: { tool: EditTool; label: string; icon: React.ReactNode }[] = [
  {
    tool: "pointer",
    label: "Pointer",
    icon: <MousePointer2 className="h-3.5 w-3.5" />,
  },
  {
    tool: "range",
    label: "Range",
    icon: <GripVertical className="h-3.5 w-3.5" />,
  },
  { tool: "split", label: "Split", icon: <Scissors className="h-3.5 w-3.5" /> },
  { tool: "slip", label: "Slip", icon: <Move className="h-3.5 w-3.5" /> },
  { tool: "draw", label: "Draw", icon: <Pencil className="h-3.5 w-3.5" /> },
];

export function InspectorPanel({
  selectedTrack,
  selectedClip,
  onTrackUpdate,
  onClipUpdate,
  plugins = [],
  onPluginsChange,
  onClose,
}: InspectorPanelProps) {
  const {
    selectedTrackId,
    selectedClipId,
    automationMode,
    setAutomationMode,
    currentTool,
    setCurrentTool,
    selectedAutomationParameter,
  } = useStudioStore();

  const activePlugins = plugins;
  const handlePluginsChange = onPluginsChange || (() => {});

  const hasSelection = selectedTrackId || selectedClipId;

  if (!hasSelection) {
    return (
      <div
        className="h-full flex flex-col border-l"
        style={{
          background: "var(--studio-bg-medium)",
          borderColor: "var(--studio-border)",
        }}
      >
        <div
          className="h-12 px-4 flex items-center justify-between border-b"
          style={{ borderColor: "var(--studio-border)" }}
        >
          <h3
            className="text-sm font-bold tracking-wide"
            style={{ color: "var(--studio-text)" }}
          >
            INSPECTOR
          </h3>
          {onClose && (
            <button
              type="button"
              className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-white/10 active:bg-white/20 touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              title="Close Inspector"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <X
                className="h-5 w-5"
                style={{ color: "var(--studio-text-muted)" }}
              />
            </button>
          )}
        </div>
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3 p-6"
          style={{ color: "var(--studio-text-muted)" }}
        >
          <Settings2 className="h-16 w-16 opacity-30" />
          <p className="text-sm text-center">
            Select a track or clip to view properties
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col border-l"
      style={{
        background: "var(--studio-bg-medium)",
        borderColor: "var(--studio-border)",
      }}
    >
      <div
        className="h-12 px-4 flex items-center justify-between border-b"
        style={{ borderColor: "var(--studio-border)" }}
      >
        <h3
          className="text-sm font-bold tracking-wide"
          style={{ color: "var(--studio-text)" }}
        >
          INSPECTOR
        </h3>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{
              borderColor: "var(--studio-accent)",
              color: "var(--studio-accent)",
            }}
          >
            {selectedTrackId ? "Track" : "Clip"}
          </Badge>
          {onClose && (
            <button
              type="button"
              className="h-10 w-10 flex items-center justify-center rounded-md hover:bg-white/10 active:bg-white/20 touch-manipulation"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              title="Close Inspector"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              <X
                className="h-5 w-5"
                style={{ color: "var(--studio-text-muted)" }}
              />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {/* Edit Tools Quick Access */}
        <CollapsibleSection
          title="EDIT TOOLS"
          icon={<MousePointer2 className="h-4 w-4" />}
          defaultExpanded={false}
        >
          <div className="flex flex-wrap gap-1">
            {EDIT_TOOLS.map(({ tool, label, icon }) => (
              <Button
                key={tool}
                variant="ghost"
                size="sm"
                className="h-8 px-2 flex items-center gap-1.5"
                style={{
                  background:
                    currentTool === tool
                      ? "var(--studio-accent)"
                      : "var(--studio-bg-deep)",
                  color: currentTool === tool ? "#000" : "var(--studio-text)",
                  border: "1px solid var(--studio-border)",
                }}
                onClick={() => setCurrentTool(tool)}
                title={label}
              >
                {icon}
                <span className="text-[10px]">{label}</span>
              </Button>
            ))}
          </div>
        </CollapsibleSection>

        {/* Track Properties */}
        {selectedTrackId && (
          <>
            <CollapsibleSection
              title="TRACK PROPERTIES"
              icon={<Palette className="h-4 w-4" />}
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Track Name
                  </Label>
                  <Input
                    value={selectedTrack?.name || "Untitled"}
                    onChange={(e) => {
                      if (onTrackUpdate) {
                        onTrackUpdate(selectedTrackId, {
                          name: e.target.value,
                        });
                      }
                    }}
                    className="h-8 text-sm"
                    style={{
                      background: "var(--studio-bg-deep)",
                      borderColor: "var(--studio-border)",
                      color: "var(--studio-text)",
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Track Color
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TRACK_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() =>
                          onTrackUpdate?.(selectedTrackId, { color })
                        }
                        className="w-6 h-6 rounded-sm border-2 transition-all hover:scale-110"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            selectedTrack?.color === color
                              ? "#fff"
                              : "transparent",
                        }}
                        title={color}
                      />
                    ))}
                    <Input
                      type="color"
                      value={selectedTrack?.color || "#4ade80"}
                      onChange={(e) => {
                        if (onTrackUpdate) {
                          onTrackUpdate(selectedTrackId, {
                            color: e.target.value,
                          });
                        }
                      }}
                      className="w-6 h-6 p-0 border-0 cursor-pointer"
                      title="Custom color"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Track Type
                  </Label>
                  <div className="flex gap-1.5">
                    {["Audio", "MIDI", "Instrument"].map((type) => (
                      <Badge
                        key={type}
                        variant="outline"
                        className="text-[10px] cursor-pointer"
                        style={{
                          borderColor:
                            selectedTrack?.type === type.toLowerCase()
                              ? "var(--studio-accent)"
                              : "var(--studio-border)",
                          color:
                            selectedTrack?.type === type.toLowerCase()
                              ? "var(--studio-accent)"
                              : "var(--studio-text-muted)",
                          background:
                            selectedTrack?.type === type.toLowerCase()
                              ? "var(--studio-accent)/10"
                              : "transparent",
                        }}
                        onClick={() =>
                          onTrackUpdate?.(selectedTrackId, {
                            type: type.toLowerCase(),
                          })
                        }
                      >
                        {type === "Audio" && (
                          <AudioWaveform className="h-3 w-3 mr-1" />
                        )}
                        {type === "MIDI" && <Hash className="h-3 w-3 mr-1" />}
                        {type === "Instrument" && (
                          <Music className="h-3 w-3 mr-1" />
                        )}
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="TRACK CONTROLS"
              icon={<Volume2 className="h-4 w-4" />}
            >
              <div className="space-y-4">
                <ParameterControl
                  label="Volume"
                  value={selectedTrack?.volume || 75}
                  min={0}
                  max={100}
                  onChange={(val) =>
                    onTrackUpdate?.(selectedTrackId, { volume: val })
                  }
                  unit="%"
                />

                <ParameterControl
                  label="Pan"
                  value={selectedTrack?.pan || 0}
                  min={-100}
                  max={100}
                  onChange={(val) =>
                    onTrackUpdate?.(selectedTrackId, { pan: val })
                  }
                  unit="%"
                />

                <Separator style={{ background: "var(--studio-border)" }} />

                <div className="flex items-center justify-between">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Mute
                  </Label>
                  <Switch
                    checked={selectedTrack?.mute || false}
                    onCheckedChange={(checked) =>
                      onTrackUpdate?.(selectedTrackId, { mute: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Solo
                  </Label>
                  <Switch
                    checked={selectedTrack?.solo || false}
                    onCheckedChange={(checked) =>
                      onTrackUpdate?.(selectedTrackId, { solo: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Record Arm
                  </Label>
                  <Switch
                    checked={selectedTrack?.armed || false}
                    onCheckedChange={(checked) =>
                      onTrackUpdate?.(selectedTrackId, { armed: checked })
                    }
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Quick Automation Controls */}
            <CollapsibleSection
              title="AUTOMATION"
              icon={<Zap className="h-4 w-4" />}
              defaultExpanded={false}
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Mode
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {AUTOMATION_MODES.map(({ mode, label, color }) => (
                      <Button
                        key={mode}
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px] font-bold"
                        style={{
                          background:
                            automationMode === mode
                              ? color
                              : "var(--studio-bg-deep)",
                          color:
                            automationMode === mode
                              ? "#fff"
                              : "var(--studio-text-muted)",
                          border: `1px solid ${automationMode === mode ? color : "var(--studio-border)"}`,
                        }}
                        onClick={() => setAutomationMode(mode)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {selectedAutomationParameter && (
                  <div className="space-y-1.5">
                    <Label
                      className="text-xs"
                      style={{ color: "var(--studio-text-muted)" }}
                    >
                      Current Parameter
                    </Label>
                    <div
                      className="text-xs font-mono px-2 py-1.5 rounded"
                      style={{
                        background: "var(--studio-bg-deep)",
                        color: "var(--studio-accent)",
                        border: "1px solid var(--studio-border)",
                      }}
                    >
                      {selectedAutomationParameter}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="PLUGINS"
              icon={<Sliders className="h-4 w-4" />}
            >
              <PluginRack
                trackId={selectedTrackId || "master"}
                plugins={activePlugins}
                onPluginsChange={handlePluginsChange}
              />
            </CollapsibleSection>

            {/* Routing Section */}
            <CollapsibleSection
              title="ROUTING"
              icon={<Radio className="h-4 w-4" />}
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Input
                  </Label>
                  <select
                    value={selectedTrack?.inputSource || "none"}
                    onChange={(e) =>
                      onTrackUpdate?.(selectedTrackId, {
                        inputSource: e.target.value,
                      })
                    }
                    className="w-full h-8 px-2 text-sm rounded-md"
                    style={{
                      background: "var(--studio-bg-deep)",
                      borderColor: "var(--studio-border)",
                      color: "var(--studio-text)",
                      border: "1px solid var(--studio-border)",
                    }}
                  >
                    <option value="none">No Input</option>
                    <option value="input-1">Input 1</option>
                    <option value="input-2">Input 2</option>
                    <option value="input-1-2">Input 1/2 (Stereo)</option>
                    <option value="input-3-4">Input 3/4 (Stereo)</option>
                    <option value="virtual-1">Virtual Input 1</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Output
                  </Label>
                  <select
                    value={selectedTrack?.outputBus || "master"}
                    onChange={(e) =>
                      onTrackUpdate?.(selectedTrackId, {
                        outputBus: e.target.value,
                      })
                    }
                    className="w-full h-8 px-2 text-sm rounded-md"
                    style={{
                      background: "var(--studio-bg-deep)",
                      borderColor: "var(--studio-border)",
                      color: "var(--studio-text)",
                      border: "1px solid var(--studio-border)",
                    }}
                  >
                    <option value="master">Main Out</option>
                    <option value="bus-1">Bus 1</option>
                    <option value="bus-2">Bus 2</option>
                    <option value="bus-3">Bus 3</option>
                    <option value="bus-4">Bus 4</option>
                    <option value="group-1">Group 1</option>
                    <option value="group-2">Group 2</option>
                  </select>
                </div>

                <Separator style={{ background: "var(--studio-border)" }} />

                <div className="space-y-1.5">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Sends
                  </Label>
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((sendNum) => (
                      <div key={sendNum} className="flex items-center gap-2">
                        <span
                          className="text-[10px] w-12"
                          style={{ color: "var(--studio-text-muted)" }}
                        >
                          Send {sendNum}
                        </span>
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: "var(--studio-bg-deep)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${selectedTrack?.[`send${sendNum}`] || 0}%`,
                              background: "var(--studio-accent)",
                            }}
                          />
                        </div>
                        <span
                          className="text-[10px] font-mono w-8 text-right"
                          style={{ color: "var(--studio-text)" }}
                        >
                          {selectedTrack?.[`send${sendNum}`] || 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* Enhanced Clip Properties */}
        {selectedClipId && (
          <CollapsibleSection
            title="CLIP PROPERTIES"
            icon={<FileAudio className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label
                  className="text-xs"
                  style={{ color: "var(--studio-text-muted)" }}
                >
                  Clip Name
                </Label>
                <Input
                  value={selectedClip?.name || "Untitled Clip"}
                  onChange={(e) => {
                    if (onClipUpdate) {
                      onClipUpdate(selectedClipId, { name: e.target.value });
                    }
                  }}
                  className="h-8 text-sm"
                  style={{
                    background: "var(--studio-bg-deep)",
                    borderColor: "var(--studio-border)",
                    color: "var(--studio-text)",
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label
                    className="text-[10px] flex items-center gap-1"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    <Clock className="h-3 w-3" />
                    Start Time
                  </Label>
                  <Input
                    value={selectedClip?.start || "0.00"}
                    onChange={(e) =>
                      onClipUpdate?.(selectedClipId, {
                        start: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                    style={{
                      background: "var(--studio-bg-deep)",
                      borderColor: "var(--studio-border)",
                      color: "var(--studio-text)",
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    className="text-[10px] flex items-center gap-1"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    <ArrowRight className="h-3 w-3" />
                    Duration
                  </Label>
                  <Input
                    value={selectedClip?.duration || "0.00"}
                    onChange={(e) =>
                      onClipUpdate?.(selectedClipId, {
                        duration: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-7 text-xs font-mono"
                    style={{
                      background: "var(--studio-bg-deep)",
                      borderColor: "var(--studio-border)",
                      color: "var(--studio-text)",
                    }}
                  />
                </div>
              </div>

              <Separator style={{ background: "var(--studio-border)" }} />

              <ParameterControl
                label="Gain"
                value={selectedClip?.gain || 0}
                min={-24}
                max={12}
                step={0.1}
                onChange={(val) =>
                  onClipUpdate?.(selectedClipId, { gain: val })
                }
                unit=" dB"
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Pitch Shift
                  </Label>
                  <div
                    className="text-xs font-mono"
                    style={{ color: "var(--studio-text)" }}
                  >
                    {selectedClip?.pitchShift || 0} st
                    <span
                      className="text-[10px] ml-1"
                      style={{ color: "var(--studio-text-muted)" }}
                    >
                      (
                      {(((selectedClip?.pitchShift || 0) * 100) % 100).toFixed(
                        0,
                      )}{" "}
                      cents)
                    </span>
                  </div>
                </div>
                <Slider
                  value={[selectedClip?.pitchShift || 0]}
                  onValueChange={([val]) =>
                    onClipUpdate?.(selectedClipId, { pitchShift: val })
                  }
                  min={-12}
                  max={12}
                  step={0.01}
                  className="cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    className="text-xs"
                    style={{ color: "var(--studio-text-muted)" }}
                  >
                    Time Stretch
                  </Label>
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--studio-text)" }}
                  >
                    {selectedClip?.timeStretch || 100}%
                  </span>
                </div>
                <Slider
                  value={[selectedClip?.timeStretch || 100]}
                  onValueChange={([val]) =>
                    onClipUpdate?.(selectedClipId, { timeStretch: val })
                  }
                  min={50}
                  max={200}
                  step={1}
                  className="cursor-pointer"
                />
              </div>

              <Separator style={{ background: "var(--studio-border)" }} />

              <ParameterControl
                label="Fade In"
                value={selectedClip?.fadeIn || 0}
                min={0}
                max={5}
                step={0.01}
                onChange={(val) =>
                  onClipUpdate?.(selectedClipId, { fadeIn: val })
                }
                unit=" s"
              />

              <ParameterControl
                label="Fade Out"
                value={selectedClip?.fadeOut || 0}
                min={0}
                max={5}
                step={0.01}
                onChange={(val) =>
                  onClipUpdate?.(selectedClipId, { fadeOut: val })
                }
                unit=" s"
              />
            </div>
          </CollapsibleSection>
        )}
      </ScrollArea>
    </div>
  );
}
