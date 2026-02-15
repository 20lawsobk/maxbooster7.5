import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  Volume2,
  Sliders,
  Send,
  Activity,
  Plug,
  Minimize2,
  Maximize2,
  Settings2,
  PanelTop,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Layers,
  Music,
  Grid3X3,
  ListMusic,
} from 'lucide-react';
import { useStudioLayoutStore, type ConsoleSections, type StudioMode } from '@/lib/studioLayoutStore';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`
            w-8 h-8 flex items-center justify-center rounded transition-all
            ${active 
              ? 'bg-[var(--s1-accent-blue)]/20 text-[var(--s1-accent-blue)]' 
              : 'text-[var(--s1-text-muted)] hover:text-[var(--s1-text-secondary)] hover:bg-white/5'
            }
          `}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ConsoleNavColumn() {
  const {
    mode,
    setMode,
    consoleSections,
    toggleConsoleSection,
    channelWidth,
    setChannelWidth,
    browserPanel,
    inspectorPanel,
    consolePanel,
    togglePanel,
  } = useStudioLayoutStore();

  return (
    <div 
      className="w-10 flex flex-col items-center py-2 gap-1 border-r"
      style={{
        background: studioOneTheme.colors.bg.deep,
        borderColor: studioOneTheme.colors.border.primary,
      }}
    >
      {/* Mode Selector */}
      <div className="flex flex-col gap-1 pb-2">
        <NavButton
          icon={<ListMusic className="h-4 w-4" />}
          label="Arrange View"
          active={mode === 'arrange'}
          onClick={() => setMode('arrange')}
        />
        <NavButton
          icon={<Sliders className="h-4 w-4" />}
          label="Mix View"
          active={mode === 'mix'}
          onClick={() => setMode('mix')}
        />
        <NavButton
          icon={<Layers className="h-4 w-4" />}
          label="Project View"
          active={mode === 'project'}
          onClick={() => setMode('project')}
        />
        <NavButton
          icon={<Grid3X3 className="h-4 w-4" />}
          label="Launcher"
          active={mode === 'launcher'}
          onClick={() => setMode('launcher')}
        />
      </div>

      <Separator className="w-6 bg-[var(--s1-border-primary)]" />

      {/* Console Section Toggles */}
      <div className="flex flex-col gap-1 py-2">
        <NavButton
          icon={<Volume2 className="h-4 w-4" />}
          label="Inputs"
          active={consoleSections.inputs}
          onClick={() => toggleConsoleSection('inputs')}
        />
        <NavButton
          icon={<Plug className="h-4 w-4" />}
          label="Inserts"
          active={consoleSections.inserts}
          onClick={() => toggleConsoleSection('inserts')}
        />
        <NavButton
          icon={<Send className="h-4 w-4" />}
          label="Sends"
          active={consoleSections.sends}
          onClick={() => toggleConsoleSection('sends')}
        />
        <NavButton
          icon={<Activity className="h-4 w-4" />}
          label="Meters"
          active={consoleSections.meters}
          onClick={() => toggleConsoleSection('meters')}
        />
      </div>

      <Separator className="w-6 bg-[var(--s1-border-primary)]" />

      {/* Panel Toggles */}
      <div className="flex flex-col gap-1 py-2">
        <NavButton
          icon={<PanelLeft className="h-4 w-4" />}
          label="Inspector"
          active={inspectorPanel.visible}
          onClick={() => togglePanel('inspector')}
        />
        <NavButton
          icon={<PanelRight className="h-4 w-4" />}
          label="Browser"
          active={browserPanel.visible}
          onClick={() => togglePanel('browser')}
        />
        <NavButton
          icon={<PanelBottom className="h-4 w-4" />}
          label="Console"
          active={consolePanel.visible}
          onClick={() => togglePanel('console')}
        />
      </div>

      <Separator className="w-6 bg-[var(--s1-border-primary)]" />

      {/* Channel Width Toggle */}
      <div className="flex flex-col gap-1 py-2">
        <NavButton
          icon={<Minimize2 className="h-4 w-4" />}
          label="Narrow Channels"
          active={channelWidth === 'narrow'}
          onClick={() => setChannelWidth('narrow')}
        />
        <NavButton
          icon={<Maximize2 className="h-4 w-4" />}
          label="Wide Channels"
          active={channelWidth === 'wide'}
          onClick={() => setChannelWidth('wide')}
        />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Settings */}
      <NavButton
        icon={<Settings2 className="h-4 w-4" />}
        label="Console Settings"
        onClick={() => {}}
      />
    </div>
  );
}
