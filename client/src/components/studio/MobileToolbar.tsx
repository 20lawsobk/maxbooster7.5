import {
  FolderOpen,
  Settings,
  Sliders,
  Music2,
  Layers,
  FileAudio,
  Undo2,
  Redo2,
  MoreHorizontal,
  Save,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { studioOneTheme } from '@/lib/studioOneTheme';
import { DrawerTriggerButton } from './StudioDrawer';

interface MobileToolbarProps {
  projectName?: string;
  onOpenBrowser: () => void;
  onOpenInspector: () => void;
  onOpenMixer: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onOpenSettings?: () => void;
  onOpenAI?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isSaving?: boolean;
  browserActive?: boolean;
  inspectorActive?: boolean;
  mixerActive?: boolean;
  className?: string;
}

export function MobileToolbar({
  projectName = 'Untitled Project',
  onOpenBrowser,
  onOpenInspector,
  onOpenMixer,
  onUndo,
  onRedo,
  onSave,
  onOpenSettings,
  onOpenAI,
  canUndo = true,
  canRedo = false,
  isSaving = false,
  browserActive = false,
  inspectorActive = false,
  mixerActive = false,
  className,
}: MobileToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-2 border-b',
        className
      )}
      style={{
        height: 48,
        background: studioOneTheme.colors.bg.secondary,
        borderColor: studioOneTheme.colors.border.primary,
      }}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 touch-manipulation"
          style={{ color: studioOneTheme.colors.text.secondary }}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
        
        <span
          className="text-sm font-medium truncate max-w-[120px]"
          style={{ color: studioOneTheme.colors.text.primary }}
        >
          {projectName}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(
            'p-2 rounded-lg touch-manipulation transition-colors',
            canUndo ? 'hover:bg-white/10 active:bg-white/20' : 'opacity-40'
          )}
          style={{ color: studioOneTheme.colors.text.secondary }}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={cn(
            'p-2 rounded-lg touch-manipulation transition-colors',
            canRedo ? 'hover:bg-white/10 active:bg-white/20' : 'opacity-40'
          )}
          style={{ color: studioOneTheme.colors.text.secondary }}
        >
          <Redo2 className="w-4 h-4" />
        </button>
        
        <button
          onClick={onSave}
          disabled={isSaving}
          className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 touch-manipulation"
          style={{ color: isSaving ? studioOneTheme.colors.accent.blue : studioOneTheme.colors.text.secondary }}
        >
          <Save className="w-4 h-4" />
        </button>
        
        {onOpenAI && (
          <button
            onClick={onOpenAI}
            className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 touch-manipulation"
            style={{ color: studioOneTheme.colors.accent.purple }}
          >
            <Wand2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface MobileBottomBarProps {
  onOpenBrowser: () => void;
  onOpenInspector: () => void;
  onOpenMixer: () => void;
  onOpenLayers?: () => void;
  browserActive?: boolean;
  inspectorActive?: boolean;
  mixerActive?: boolean;
  layersActive?: boolean;
  className?: string;
}

export function MobileBottomBar({
  onOpenBrowser,
  onOpenInspector,
  onOpenMixer,
  onOpenLayers,
  browserActive,
  inspectorActive,
  mixerActive,
  layersActive,
  className,
}: MobileBottomBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-around px-2 border-t',
        className
      )}
      style={{
        height: 60,
        background: studioOneTheme.colors.bg.secondary,
        borderColor: studioOneTheme.colors.border.primary,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <DrawerTriggerButton
        onClick={onOpenBrowser}
        icon={<FolderOpen className="w-5 h-5" />}
        label="Browser"
        active={browserActive}
      />
      
      <DrawerTriggerButton
        onClick={onOpenInspector}
        icon={<Sliders className="w-5 h-5" />}
        label="Inspector"
        active={inspectorActive}
      />
      
      <DrawerTriggerButton
        onClick={onOpenMixer}
        icon={<Music2 className="w-5 h-5" />}
        label="Mixer"
        active={mixerActive}
      />
      
      {onOpenLayers && (
        <DrawerTriggerButton
          onClick={onOpenLayers}
          icon={<Layers className="w-5 h-5" />}
          label="Layers"
          active={layersActive}
        />
      )}
    </div>
  );
}
