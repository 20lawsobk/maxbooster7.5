import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioStore, type AutoscrollMode } from "@/lib/studioStore";
import {
  AlignHorizontalJustifyCenter,
  AlignLeft,
  BookOpen,
  ArrowRight,
  Pause,
} from "lucide-react";

const AUTOSCROLL_MODES: {
  mode: AutoscrollMode;
  label: string;
  description: string;
}[] = [
  { mode: "off", label: "Off", description: "Autoscroll disabled" },
  {
    mode: "turnover",
    label: "Turn Over",
    description: "Classic - view jumps when cursor reaches edge",
  },
  {
    mode: "continuous-centered",
    label: "Continuous Centered",
    description: "Cursor stays centered, timeline moves",
  },
  {
    mode: "continuous-left",
    label: "Continuous Left",
    description: "Cursor stays left, timeline moves",
  },
];

function getAutoscrollIcon(mode: AutoscrollMode) {
  switch (mode) {
    case "turnover":
      return BookOpen;
    case "continuous-centered":
      return AlignHorizontalJustifyCenter;
    case "continuous-left":
      return AlignLeft;
    default:
      return ArrowRight;
  }
}

export function AutoscrollButton() {
  const {
    autoscrollMode,
    setAutoscrollMode,
    cycleAutoscrollMode,
    autoscrollPaused,
    resumeAutoscroll,
  } = useStudioStore();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClick = () => {
    // If autoscroll is paused due to manual scroll, resume it
    if (autoscrollPaused && autoscrollMode !== "off") {
      resumeAutoscroll();
    } else {
      cycleAutoscrollMode();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const handleModeSelect = (mode: AutoscrollMode) => {
    setAutoscrollMode(mode);
    resumeAutoscroll(); // Clear paused state when explicitly selecting a mode
    setShowMenu(false);
  };

  // Show Pause icon when paused, otherwise show mode icon
  const Icon =
    autoscrollPaused && autoscrollMode !== "off"
      ? Pause
      : getAutoscrollIcon(autoscrollMode);
  const isActive = autoscrollMode !== "off";
  const isPaused = autoscrollPaused && autoscrollMode !== "off";
  const currentModeInfo = AUTOSCROLL_MODES.find(
    (m) => m.mode === autoscrollMode,
  );

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={buttonRef}
            variant="ghost"
            size="sm"
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            className={`h-7 px-2 gap-1 ${
              isPaused
                ? "bg-amber-600/30 text-amber-400 hover:bg-amber-600/40"
                : isActive
                  ? "bg-blue-600/30 text-blue-400 hover:bg-blue-600/40"
                  : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[10px] font-medium uppercase tracking-wide">
              {isPaused
                ? "Paused"
                : autoscrollMode === "off"
                  ? "Auto"
                  : autoscrollMode.replace("continuous-", "").slice(0, 3)}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="font-medium">
            Autoscroll: {currentModeInfo?.label}
            {isPaused && " (Paused)"}
          </div>
          <div className="text-zinc-400 text-[10px]">
            {isPaused
              ? "Click or press F to resume"
              : "Click to cycle • Right-click for options • Press F"}
          </div>
        </TooltipContent>
      </Tooltip>

      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-md shadow-lg py-1"
        >
          <div className="px-2 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-medium border-b border-zinc-800 mb-1">
            Autoscroll Mode
          </div>
          {AUTOSCROLL_MODES.map(({ mode, label, description }) => {
            const ModeIcon = getAutoscrollIcon(mode);
            const isSelected = autoscrollMode === mode;
            return (
              <button
                key={mode}
                onClick={() => handleModeSelect(mode)}
                className={`w-full px-3 py-2 flex items-start gap-3 hover:bg-zinc-800 transition-colors ${
                  isSelected ? "bg-blue-600/20 text-blue-400" : "text-zinc-300"
                }`}
              >
                <ModeIcon
                  className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isSelected ? "text-blue-400" : "text-zinc-500"}`}
                />
                <div className="text-left">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-[10px] text-zinc-500">{description}</div>
                </div>
                {isSelected && (
                  <div className="ml-auto text-blue-400 text-sm">✓</div>
                )}
              </button>
            );
          })}
          <div className="border-t border-zinc-800 mt-1 pt-1 px-3 py-1">
            <div className="text-[10px] text-zinc-500">
              Shortcut: <kbd className="bg-zinc-800 px-1 rounded">F</kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
