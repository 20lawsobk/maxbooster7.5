import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Mic,
  Scissors,
  Sliders,
  Disc,
  ChevronRight,
  Check,
  Clock,
  AlertCircle,
  Settings2,
  FileOutput,
} from 'lucide-react';

export type WorkflowState = 'setup' | 'recording' | 'editing' | 'mixing' | 'mastering' | 'delivery';

interface WorkflowStep {
  id: WorkflowState;
  label: string;
  icon: React.ElementType;
  description: string;
  tasks: string[];
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'setup',
    label: 'Setup',
    icon: Settings2,
    description: 'Configure project settings and prepare for recording',
    tasks: ['Set tempo and key', 'Configure audio I/O', 'Add track templates', 'Set up metronome'],
  },
  {
    id: 'recording',
    label: 'Recording',
    icon: Mic,
    description: 'Capture audio and MIDI performances',
    tasks: ['Record vocals', 'Record instruments', 'Capture MIDI', 'Review takes'],
  },
  {
    id: 'editing',
    label: 'Editing',
    icon: Scissors,
    description: 'Edit, arrange, and polish your recordings',
    tasks: ['Comp takes', 'Time alignment', 'Pitch correction', 'Arrange sections'],
  },
  {
    id: 'mixing',
    label: 'Mixing',
    icon: Sliders,
    description: 'Balance levels, EQ, and add effects',
    tasks: ['Set levels', 'Pan positions', 'EQ and compression', 'Add effects'],
  },
  {
    id: 'mastering',
    label: 'Mastering',
    icon: Disc,
    description: 'Final polish and loudness optimization',
    tasks: ['Apply mastering chain', 'Check loudness', 'A/B reference', 'Final tweaks'],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: FileOutput,
    description: 'Export and distribute your final product',
    tasks: ['Export formats', 'Quality check', 'Metadata', 'Distribution'],
  },
];

interface WorkflowStateBarProps {
  currentState: WorkflowState;
  onStateChange: (state: WorkflowState) => void;
  completedSteps?: WorkflowState[];
  projectProgress?: number;
  className?: string;
}

export function WorkflowStateBar({
  currentState,
  onStateChange,
  completedSteps = [],
  projectProgress = 0,
  className = '',
}: WorkflowStateBarProps) {
  const [showDetails, setShowDetails] = useState(false);
  const currentIndex = WORKFLOW_STEPS.findIndex(s => s.id === currentState);

  const getStepStatus = useCallback((step: WorkflowStep, index: number) => {
    if (completedSteps.includes(step.id)) return 'completed';
    if (step.id === currentState) return 'current';
    if (index < currentIndex) return 'passed';
    return 'upcoming';
  }, [currentState, currentIndex, completedSteps]);

  return (
    <TooltipProvider>
      <div className={`bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 ${className}`}>
        <div className="flex items-center justify-between px-2 md:px-4 py-2 gap-2">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent pb-1 md:pb-0 flex-1 min-w-0">
            {WORKFLOW_STEPS.map((step, index) => {
              const status = getStepStatus(step, index);
              const Icon = step.icon;
              const isLast = index === WORKFLOW_STEPS.length - 1;

              return (
                <div key={step.id} className="flex items-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onStateChange(step.id)}
                        className={`
                          flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-2 md:py-1.5 rounded-md transition-all shrink-0
                          min-h-[44px] md:min-h-0 touch-manipulation
                          ${status === 'current' 
                            ? 'bg-purple-600 text-white' 
                            : status === 'completed'
                            ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                            : status === 'passed'
                            ? 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                          }
                        `}
                      >
                        {status === 'completed' ? (
                          <Check className="h-4 w-4 md:h-4 md:w-4" />
                        ) : (
                          <Icon className="h-4 w-4 md:h-4 md:w-4" />
                        )}
                        <span className="text-xs md:text-sm font-medium hidden sm:inline">{step.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700">
                      <div className="space-y-2 p-1">
                        <p className="font-medium text-white">{step.label}</p>
                        <p className="text-xs text-zinc-400">{step.description}</p>
                        <div className="space-y-1 pt-1 border-t border-zinc-700">
                          {step.tasks.map((task, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                              {task}
                            </div>
                          ))}
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>

                  {!isLast && (
                    <ChevronRight className={`h-4 w-4 mx-1 ${
                      index < currentIndex ? 'text-green-500' : 'text-zinc-600'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2">
              <Clock className="h-4 w-4 text-zinc-500" />
              <span className="text-xs text-zinc-400">
                Step {currentIndex + 1} of {WORKFLOW_STEPS.length}
              </span>
            </div>

            {projectProgress > 0 && (
              <div className="hidden lg:flex items-center gap-2 min-w-[120px]">
                <Progress value={projectProgress} className="h-1.5 bg-zinc-700" />
                <span className="text-xs text-zinc-400 w-8">{projectProgress}%</span>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
              className="text-zinc-400 hover:text-white"
            >
              {showDetails ? 'Hide' : 'Details'}
            </Button>
          </div>
        </div>

        {showDetails && (
          <div className="px-2 md:px-4 pb-4 pt-2 border-t border-zinc-800 overflow-x-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 md:gap-4 min-w-0">
              {WORKFLOW_STEPS.map((step, index) => {
                const status = getStepStatus(step, index);
                const Icon = step.icon;

                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-lg border ${
                      status === 'current'
                        ? 'bg-purple-600/10 border-purple-500'
                        : status === 'completed'
                        ? 'bg-green-600/10 border-green-600/50'
                        : 'bg-zinc-800/50 border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${
                        status === 'current' ? 'text-purple-400' :
                        status === 'completed' ? 'text-green-400' : 'text-zinc-500'
                      }`} />
                      <span className={`text-sm font-medium ${
                        status === 'current' ? 'text-white' :
                        status === 'completed' ? 'text-green-400' : 'text-zinc-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {step.tasks.slice(0, 3).map((task, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-zinc-400">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            status === 'completed' ? 'bg-green-500' : 'bg-zinc-600'
                          }`} />
                          {task}
                        </div>
                      ))}
                      {step.tasks.length > 3 && (
                        <div className="text-xs text-zinc-500">
                          +{step.tasks.length - 3} more...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

interface WorkflowStateBadgeProps {
  state: WorkflowState;
  size?: 'sm' | 'md';
}

export function WorkflowStateBadge({ state, size = 'sm' }: WorkflowStateBadgeProps) {
  const step = WORKFLOW_STEPS.find(s => s.id === state);
  if (!step) return null;

  const Icon = step.icon;
  const colors: Record<WorkflowState, string> = {
    setup: 'bg-blue-600/20 text-blue-400 border-blue-500/50',
    recording: 'bg-red-600/20 text-red-400 border-red-500/50',
    editing: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50',
    mixing: 'bg-purple-600/20 text-purple-400 border-purple-500/50',
    mastering: 'bg-orange-600/20 text-orange-400 border-orange-500/50',
    delivery: 'bg-green-600/20 text-green-400 border-green-500/50',
  };

  return (
    <Badge variant="outline" className={`${colors[state]} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      <Icon className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} mr-1`} />
      {step.label}
    </Badge>
  );
}
