import { Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUndoActions, useUndoHistory } from '@/contexts/UndoContext';
import { getActionLabel } from '@/lib/undo/types';
import { cn } from '@/lib/utils';

export interface UndoRedoButtonsProps {
  className?: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  showLabels?: boolean;
  showTooltips?: boolean;
}

export function UndoRedoButtons({
  className,
  size = 'icon',
  variant = 'ghost',
  showLabels = false,
  showTooltips = true,
}: UndoRedoButtonsProps) {
  const { undo, redo, canUndo, canRedo } = useUndoActions();
  const { history, redoStack } = useUndoHistory();

  const lastAction = history.filter(a => !a.isUndone).slice(-1)[0];
  const nextRedoAction = redoStack.slice(-1)[0];

  const undoTooltip = canUndo && lastAction
    ? `Undo: ${getActionLabel(lastAction)} (Ctrl+Z)`
    : 'Nothing to undo';

  const redoTooltip = canRedo && nextRedoAction
    ? `Redo: ${getActionLabel(nextRedoAction)} (Ctrl+Shift+Z)`
    : 'Nothing to redo';

  const buttons = (
    <div className={cn('flex items-center gap-1', className)}>
      <Button
        variant={variant}
        size={size}
        onClick={() => undo()}
        disabled={!canUndo}
        aria-label="Undo"
        className={showLabels ? 'gap-1' : ''}
      >
        <Undo2 className={size === 'icon' ? 'w-4 h-4' : 'w-3 h-3'} />
        {showLabels && <span>Undo</span>}
      </Button>
      <Button
        variant={variant}
        size={size}
        onClick={() => redo()}
        disabled={!canRedo}
        aria-label="Redo"
        className={showLabels ? 'gap-1' : ''}
      >
        <Redo2 className={size === 'icon' ? 'w-4 h-4' : 'w-3 h-3'} />
        {showLabels && <span>Redo</span>}
      </Button>
    </div>
  );

  if (!showTooltips) {
    return buttons;
  }

  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-1', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={() => undo()}
              disabled={!canUndo}
              aria-label="Undo"
              className={showLabels ? 'gap-1' : ''}
            >
              <Undo2 className={size === 'icon' ? 'w-4 h-4' : 'w-3 h-3'} />
              {showLabels && <span>Undo</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{undoTooltip}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={() => redo()}
              disabled={!canRedo}
              aria-label="Redo"
              className={showLabels ? 'gap-1' : ''}
            >
              <Redo2 className={size === 'icon' ? 'w-4 h-4' : 'w-3 h-3'} />
              {showLabels && <span>Redo</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{redoTooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export function UndoButton({
  className,
  size = 'icon',
  variant = 'ghost',
  showLabel = false,
}: {
  className?: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  showLabel?: boolean;
}) {
  const { undo, canUndo } = useUndoActions();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={() => undo()}
            disabled={!canUndo}
            aria-label="Undo"
            className={cn(showLabel && 'gap-1', className)}
          >
            <Undo2 className={size === 'icon' ? 'w-4 h-4' : 'w-3 h-3'} />
            {showLabel && <span>Undo</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Undo (Ctrl+Z)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RedoButton({
  className,
  size = 'icon',
  variant = 'ghost',
  showLabel = false,
}: {
  className?: string;
  size?: 'sm' | 'default' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  showLabel?: boolean;
}) {
  const { redo, canRedo } = useUndoActions();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={() => redo()}
            disabled={!canRedo}
            aria-label="Redo"
            className={cn(showLabel && 'gap-1', className)}
          >
            <Redo2 className={size === 'icon' ? 'w-4 h-4' : 'w-3 h-3'} />
            {showLabel && <span>Redo</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Redo (Ctrl+Shift+Z)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
