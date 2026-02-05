import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import {
  Command,
  Plus,
  Music,
  Share2,
  BarChart3,
  Settings,
  Upload,
  Home,
  Keyboard,
  Zap,
  ChevronUp,
  ChevronDown,
  Grip,
  X,
  Star,
  Clock,
  Sparkles,
  Folder,
  ShoppingBag,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/contexts/ShortcutContext';
import { ShortcutHint } from '@/components/shortcuts/ShortcutHint';

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
  color?: string;
  badge?: string;
  category?: 'navigation' | 'action' | 'tool';
  favorite?: boolean;
}

interface QuickActionsMenuProps {
  className?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  variant?: 'floating' | 'dock' | 'radial';
  enableGestures?: boolean;
  enableFavorites?: boolean;
  maxVisible?: number;
  customActions?: QuickAction[];
}

const STORAGE_KEY = 'max-booster-quick-actions-favorites';

export function QuickActionsMenu({
  className,
  position = 'bottom-right',
  variant = 'floating',
  enableGestures = true,
  enableFavorites = true,
  maxVisible = 6,
  customActions,
}: QuickActionsMenuProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const { openCommandPalette, openShortcutGuide } = useShortcuts();
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultActions: QuickAction[] = useMemo(() => [
    {
      id: 'command-palette',
      label: 'Command Palette',
      icon: Command,
      shortcut: 'cmd+k',
      action: openCommandPalette,
      color: 'text-amber-400',
      category: 'tool',
    },
    {
      id: 'new-project',
      label: 'New Project',
      icon: Plus,
      action: () => window.location.href = '/studio',
      color: 'text-green-400',
      category: 'action',
    },
    {
      id: 'studio',
      label: 'Open Studio',
      icon: Music,
      action: () => window.location.href = '/studio',
      color: 'text-purple-400',
      category: 'navigation',
    },
    {
      id: 'upload',
      label: 'Upload File',
      icon: Upload,
      action: () => {
        const event = new CustomEvent('open-upload-dialog');
        window.dispatchEvent(event);
      },
      category: 'action',
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      action: () => window.location.href = '/dashboard',
      category: 'navigation',
    },
    {
      id: 'projects',
      label: 'My Projects',
      icon: Folder,
      action: () => window.location.href = '/projects',
      category: 'navigation',
    },
    {
      id: 'social',
      label: 'Social Media',
      icon: Share2,
      action: () => window.location.href = '/social-media',
      color: 'text-blue-400',
      category: 'navigation',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      action: () => window.location.href = '/analytics',
      color: 'text-cyan-400',
      category: 'navigation',
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      icon: ShoppingBag,
      action: () => window.location.href = '/marketplace',
      color: 'text-pink-400',
      category: 'navigation',
    },
    {
      id: 'royalties',
      label: 'Royalties',
      icon: DollarSign,
      action: () => window.location.href = '/royalties',
      color: 'text-emerald-400',
      category: 'navigation',
    },
    {
      id: 'shortcuts',
      label: 'Shortcuts',
      icon: Keyboard,
      shortcut: 'cmd+/',
      action: openShortcutGuide,
      category: 'tool',
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      shortcut: 'cmd+,',
      action: () => window.location.href = '/settings',
      category: 'navigation',
    },
  ], [openCommandPalette, openShortcutGuide]);

  const actions = customActions || defaultActions;

  useEffect(() => {
    if (enableFavorites) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setFavorites(JSON.parse(stored));
        }
      } catch (e) {
        console.warn('Failed to load favorites:', e);
      }
    }
  }, [enableFavorites]);

  const toggleFavorite = useCallback((actionId: string) => {
    setFavorites(prev => {
      const next = prev.includes(actionId)
        ? prev.filter(id => id !== actionId)
        : [...prev, actionId];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const sortedActions = useMemo(() => {
    if (!enableFavorites) return actions;
    return [...actions].sort((a, b) => {
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [actions, favorites, enableFavorites]);

  const visibleActions = isExpanded ? sortedActions : sortedActions.slice(0, maxVisible);

  const positionClasses = {
    'bottom-right': 'right-4 bottom-4',
    'bottom-left': 'left-4 bottom-4',
    'top-right': 'right-4 top-4',
    'top-left': 'left-4 top-4',
  };

  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    const threshold = 50;
    
    if (Math.abs(info.velocity.y) > threshold) {
      if (info.velocity.y < 0 && !isExpanded) {
        setIsExpanded(true);
      } else if (info.velocity.y > 0 && isExpanded) {
        setIsExpanded(false);
      }
    }
  }, [isExpanded]);

  if (variant === 'radial') {
    return (
      <RadialQuickActions
        actions={visibleActions}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
        position={position}
        className={className}
        favorites={favorites}
        onToggleFavorite={enableFavorites ? toggleFavorite : undefined}
      />
    );
  }

  if (variant === 'dock') {
    return (
      <DockQuickActions
        actions={sortedActions}
        position={position}
        className={className}
        favorites={favorites}
        onToggleFavorite={enableFavorites ? toggleFavorite : undefined}
      />
    );
  }

  return (
    <TooltipProvider>
      <motion.div
        ref={containerRef}
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
                drag={enableGestures ? 'y' : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex flex-col gap-1 p-2 bg-zinc-950/95 backdrop-blur-md",
                  "border border-zinc-800 rounded-xl shadow-2xl",
                  "max-h-[70vh] overflow-y-auto"
                )}
              >
                {enableGestures && (
                  <div className="flex justify-center py-1 cursor-grab active:cursor-grabbing">
                    <Grip className="w-4 h-4 text-zinc-600" />
                  </div>
                )}

                {['navigation', 'action', 'tool'].map(category => {
                  const categoryActions = visibleActions.filter(a => a.category === category);
                  if (categoryActions.length === 0) return null;

                  return (
                    <div key={category}>
                      {category !== 'navigation' && <div className="h-px bg-zinc-800 my-1" />}
                      {categoryActions.map((action, index) => (
                        <QuickActionItem
                          key={action.id}
                          action={action}
                          index={index}
                          isFavorite={favorites.includes(action.id)}
                          onAction={() => {
                            action.action();
                            setIsExpanded(false);
                          }}
                          onToggleFavorite={enableFavorites ? () => toggleFavorite(action.id) : undefined}
                        />
                      ))}
                    </div>
                  );
                })}
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
              animate={{ rotate: isExpanded ? 45 : 0 }}
              transition={{ duration: 0.2 }}
            >
              {isExpanded ? <X className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
            </motion.div>
          </motion.button>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}

interface QuickActionItemProps {
  action: QuickAction;
  index: number;
  isFavorite: boolean;
  onAction: () => void;
  onToggleFavorite?: () => void;
}

function QuickActionItem({ action, index, isFavorite, onAction, onToggleFavorite }: QuickActionItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group flex items-center"
    >
      <button
        onClick={onAction}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg transition-all flex-1",
          "hover:bg-zinc-800 text-left min-w-[180px]",
          action.color || "text-zinc-300 hover:text-white"
        )}
      >
        <action.icon className="w-4 h-4 flex-shrink-0" />
        <span className="text-sm flex-1">{action.label}</span>
        {action.shortcut && (
          <ShortcutHint shortcut={action.shortcut} size="xs" variant="ghost" />
        )}
        {action.badge && (
          <Badge variant="secondary" className="h-4 text-[9px]">{action.badge}</Badge>
        )}
      </button>
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            "p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
            isFavorite ? "text-amber-400" : "text-zinc-500 hover:text-amber-400"
          )}
        >
          <Star className={cn("w-3.5 h-3.5", isFavorite && "fill-current")} />
        </button>
      )}
    </motion.div>
  );
}

interface RadialQuickActionsProps {
  actions: QuickAction[];
  isExpanded: boolean;
  onToggle: () => void;
  position: string;
  className?: string;
  favorites: string[];
  onToggleFavorite?: (id: string) => void;
}

function RadialQuickActions({ 
  actions, 
  isExpanded, 
  onToggle, 
  position, 
  className,
  favorites,
  onToggleFavorite,
}: RadialQuickActionsProps) {
  const visibleActions = actions.slice(0, 8);
  const radius = 80;
  const startAngle = -90;
  const angleStep = 360 / Math.min(visibleActions.length, 8);

  return (
    <TooltipProvider>
      <div className={cn("fixed z-40", position, className)}>
        <div className="relative">
          <AnimatePresence>
            {isExpanded && visibleActions.map((action, index) => {
              const angle = startAngle + index * angleStep;
              const rad = (angle * Math.PI) / 180;
              const x = Math.cos(rad) * radius;
              const y = Math.sin(rad) * radius;

              return (
                <Tooltip key={action.id}>
                  <TooltipTrigger asChild>
                    <motion.button
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
                      animate={{ opacity: 1, x, y, scale: 1 }}
                      exit={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        action.action();
                        onToggle();
                      }}
                      className={cn(
                        "absolute p-3 rounded-full shadow-lg",
                        "bg-zinc-900 border border-zinc-800",
                        action.color || "text-zinc-300 hover:text-white",
                        "hover:bg-zinc-800 transition-colors"
                      )}
                      style={{ transform: `translate(${x}px, ${y}px)` }}
                    >
                      <action.icon className="w-5 h-5" />
                    </motion.button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="flex items-center gap-2">
                      <span>{action.label}</span>
                      {action.shortcut && (
                        <ShortcutHint shortcut={action.shortcut} size="xs" variant="ghost" />
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </AnimatePresence>

          <motion.button
            onClick={onToggle}
            className={cn(
              "relative z-10 p-4 rounded-full shadow-xl",
              "bg-gradient-to-r from-amber-500 to-orange-600",
              "text-white"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            animate={{ rotate: isExpanded ? 45 : 0 }}
          >
            {isExpanded ? <X className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
          </motion.button>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface DockQuickActionsProps {
  actions: QuickAction[];
  position: string;
  className?: string;
  favorites: string[];
  onToggleFavorite?: (id: string) => void;
}

function DockQuickActions({ actions, position, className, favorites }: DockQuickActionsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          "fixed z-40 flex items-center gap-1 p-2",
          "bg-zinc-950/90 backdrop-blur-md border border-zinc-800 rounded-2xl shadow-2xl",
          position.includes('bottom') ? 'bottom-4' : 'top-4',
          position.includes('right') ? 'right-4' : 'left-4',
          className
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {actions.slice(0, 8).map((action) => {
          const isHovered = hoveredId === action.id;
          const isFavorite = favorites.includes(action.id);

          return (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <motion.button
                  onMouseEnter={() => setHoveredId(action.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={action.action}
                  className={cn(
                    "relative p-3 rounded-xl transition-colors",
                    "hover:bg-zinc-800",
                    action.color || "text-zinc-400 hover:text-white"
                  )}
                  animate={{ scale: isHovered ? 1.2 : 1, y: isHovered ? -5 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <action.icon className="w-5 h-5" />
                  {isFavorite && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>{action.label}</span>
                  {action.shortcut && (
                    <ShortcutHint shortcut={action.shortcut} size="xs" variant="ghost" />
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </motion.div>
    </TooltipProvider>
  );
}

export default QuickActionsMenu;
