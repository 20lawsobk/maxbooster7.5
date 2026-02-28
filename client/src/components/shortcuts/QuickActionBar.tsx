import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Command,
  Search,
  Plus,
  Upload,
  Music,
  BarChart3,
  Share2,
  Settings,
  HelpCircle,
  ChevronUp,
  Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useShortcuts, useCommandPalette } from '@/contexts/ShortcutContext';
import { ShortcutHint, ShortcutTooltipContent } from './ShortcutHint';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  color?: string;
}

interface QuickActionBarProps {
  className?: string;
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  showLabels?: boolean;
}

export function QuickActionBar({ 
  className, 
  position = 'bottom-right',
  showLabels = false 
}: QuickActionBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { openCommandPalette, openShortcutGuide } = useShortcuts();
  const [, navigate] = useLocation();

  const quickActions: QuickAction[] = useMemo(() => [
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
      action: () => navigate('/studio'),
      color: 'text-green-400',
    },
    {
      id: 'upload',
      label: 'Upload',
      icon: Upload,
      action: () => {
        const event = new CustomEvent('open-upload-dialog');
        window.dispatchEvent(event);
      },
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      action: () => navigate('/dashboard'),
    },
    {
      id: 'studio',
      label: 'Studio',
      icon: Music,
      action: () => navigate('/studio'),
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      action: () => navigate('/analytics'),
    },
    {
      id: 'help',
      label: 'Shortcuts',
      icon: HelpCircle,
      shortcut: 'cmd+/',
      action: openShortcutGuide,
    },
  ], [openCommandPalette, openShortcutGuide, navigate]);

  const visibleActions = isExpanded ? quickActions : quickActions.slice(0, 3);

  const positionClasses = {
    'bottom-right': 'right-4 bottom-20 lg:bottom-4',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-20 lg:bottom-4',
    'bottom-left': 'left-4 bottom-20 lg:bottom-4',
  };

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
                  "flex gap-2 p-2 bg-zinc-950/90 backdrop-blur-sm border border-zinc-800 rounded-xl shadow-xl",
                  position === 'bottom-center' && "flex-row",
                  position !== 'bottom-center' && "flex-col"
                )}
              >
                {visibleActions.map((action, index) => (
                  <Tooltip key={action.id}>
                    <TooltipTrigger asChild>
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.05 }}
                        onClick={action.action}
                        className={cn(
                          "p-3 rounded-lg transition-all hover:bg-zinc-800",
                          "flex items-center gap-2",
                          action.color || "text-zinc-400 hover:text-white"
                        )}
                      >
                        <action.icon className="w-5 h-5" />
                        {showLabels && (
                          <span className="text-sm whitespace-nowrap">{action.label}</span>
                        )}
                      </motion.button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {action.shortcut ? (
                        <ShortcutTooltipContent 
                          action={action.label} 
                          shortcut={action.shortcut} 
                        />
                      ) : (
                        action.label
                      )}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "p-4 rounded-full shadow-xl transition-all",
              "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500",
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

interface QuickActionButtonProps {
  action: QuickAction;
  size?: 'sm' | 'md' | 'lg';
  showShortcut?: boolean;
  className?: string;
}

export function QuickActionButton({ 
  action, 
  size = 'md', 
  showShortcut = true,
  className 
}: QuickActionButtonProps) {
  const sizeClasses = {
    sm: 'p-2',
    md: 'p-3',
    lg: 'p-4',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={action.action}
            className={cn(
              "rounded-lg transition-all bg-zinc-900 hover:bg-zinc-800 border border-zinc-800",
              sizeClasses[size],
              action.color || "text-zinc-400 hover:text-white",
              className
            )}
          >
            <action.icon className={iconSizes[size]} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <span>{action.label}</span>
            {showShortcut && action.shortcut && (
              <ShortcutHint shortcut={action.shortcut} size="xs" variant="ghost" />
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default QuickActionBar;
