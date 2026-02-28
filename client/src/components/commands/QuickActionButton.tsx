import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  X,
  Command,
  Plus,
  Music,
  Share2,
  BarChart3,
  Home,
  Keyboard,
  Settings,
  Rocket,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/contexts/ShortcutContext';
import { ShortcutHint } from '@/components/shortcuts/ShortcutHint';

export interface QuickActionItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  color?: string;
  badge?: string;
}

interface QuickActionButtonProps {
  className?: string;
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right';
  variant?: 'default' | 'compact' | 'power';
  actions?: QuickActionItem[];
  powerUserMode?: boolean;
  onPowerUserModeChange?: (enabled: boolean) => void;
}

export function QuickActionButton({ 
  className, 
  position = 'bottom-right',
  variant = 'default',
  actions,
  powerUserMode = false,
  onPowerUserModeChange,
}: QuickActionButtonProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPowerMode, setIsPowerMode] = useState(powerUserMode);
  const { openCommandPalette, openShortcutGuide } = useShortcuts();
  const [, navigate] = useLocation();

  const defaultActions: QuickActionItem[] = useMemo(() => [
    {
      id: 'command-palette',
      label: 'Command Palette',
      icon: Command,
      shortcut: 'cmd+k',
      action: openCommandPalette,
      color: 'text-amber-400',
    },
    {
      id: 'new-project',
      label: 'New Project',
      icon: Plus,
      shortcut: 'N',
      action: () => navigate('/studio'),
      color: 'text-green-400',
    },
    {
      id: 'studio',
      label: 'Open Studio',
      icon: Music,
      action: () => navigate('/studio'),
      color: 'text-purple-400',
    },
    {
      id: 'social',
      label: 'Social Media',
      icon: Share2,
      action: () => navigate('/social-media'),
      color: 'text-blue-400',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      action: () => navigate('/analytics'),
      color: 'text-cyan-400',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      action: () => navigate('/dashboard'),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard Shortcuts',
      icon: Keyboard,
      shortcut: 'cmd+/',
      action: openShortcutGuide,
    },
  ], [openCommandPalette, openShortcutGuide, navigate]);

  const displayActions = actions || defaultActions;
  const visibleActions = isExpanded 
    ? displayActions 
    : isPowerMode 
      ? displayActions.slice(0, 5) 
      : displayActions.slice(0, 3);

  const positionClasses = {
    'bottom-right': 'right-4 bottom-4',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-4',
    'bottom-left': 'left-4 bottom-4',
    'top-right': 'right-4 top-4',
  };

  const handleTogglePowerMode = () => {
    const newMode = !isPowerMode;
    setIsPowerMode(newMode);
    onPowerUserModeChange?.(newMode);
  };

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={openCommandPalette}
              className={cn(
                "fixed z-40 w-12 h-12 rounded-full shadow-lg",
                "bg-gradient-to-r from-amber-500 to-orange-600",
                positionClasses[position],
                className
              )}
            >
              <Command className="w-5 h-5 text-white" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex items-center gap-2">
              <span>Quick Actions</span>
              <ShortcutHint shortcut="cmd+k" size="xs" variant="ghost" />
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          "fixed z-40",
          positionClasses[position],
          className
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex flex-col items-end gap-2">
          <AnimatePresence mode="popLayout">
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className={cn(
                  "flex flex-col gap-1 p-2 bg-zinc-950/95 backdrop-blur-md",
                  "border border-zinc-800 rounded-xl shadow-2xl"
                )}
              >
                {isPowerMode && (
                  <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-zinc-800">
                    <div className="flex items-center gap-1.5">
                      <Rocket className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] font-medium text-amber-400 uppercase">Power User</span>
                    </div>
                    <Badge variant="secondary" className="h-4 text-[9px] px-1">
                      {displayActions.length} actions
                    </Badge>
                  </div>
                )}

                {visibleActions.map((action, index) => (
                  <Tooltip key={action.id}>
                    <TooltipTrigger asChild>
                      <motion.button
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => {
                          action.action();
                          setIsExpanded(false);
                        }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                          "hover:bg-zinc-800 text-left w-full min-w-[180px]",
                          action.color || "text-zinc-300 hover:text-white"
                        )}
                      >
                        <action.icon className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm flex-1">{action.label}</span>
                        {action.shortcut && (
                          <ShortcutHint shortcut={action.shortcut} size="xs" variant="ghost" />
                        )}
                        {action.badge && (
                          <Badge variant="secondary" className="h-4 text-[9px]">
                            {action.badge}
                          </Badge>
                        )}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="hidden md:block">
                      {action.label}
                    </TooltipContent>
                  </Tooltip>
                ))}

                <div className="border-t border-zinc-800 mt-1 pt-1">
                  <button
                    onClick={handleTogglePowerMode}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors",
                      isPowerMode 
                        ? "text-amber-400 bg-amber-500/10" 
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                    )}
                  >
                    <Rocket className="w-3 h-3" />
                    <span>{isPowerMode ? 'Power Mode Active' : 'Enable Power Mode'}</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "p-4 rounded-full shadow-xl transition-all",
              isPowerMode
                ? "bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-400 hover:to-pink-500"
                : "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500",
              "text-white"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              {isExpanded ? (
                <ChevronUp className="w-6 h-6" />
              ) : isPowerMode ? (
                <Zap className="w-6 h-6" />
              ) : (
                <Command className="w-6 h-6" />
              )}
            </motion.div>
          </motion.button>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}

export { QuickActionBar } from '@/components/shortcuts/QuickActionBar';

export default QuickActionButton;
