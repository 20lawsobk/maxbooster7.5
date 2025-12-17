import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { X, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { announce } from '@/lib/accessibility';
import { useToast } from '@/hooks/use-toast';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  spotlightSelector: string;
  arrowPosition?: 'top' | 'bottom' | 'left' | 'right';
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: 'Welcome to Your Professional Studio',
    description: "Let's take a quick tour of the tools that will help you create amazing music",
    spotlightSelector: '.studio-container',
    arrowPosition: undefined,
  },
  {
    id: 2,
    title: 'Track Panel',
    description:
      'Create, organize, and manage your audio and MIDI tracks here. Drag tracks to reorder them.',
    spotlightSelector: '.track-list-container',
    arrowPosition: 'left',
  },
  {
    id: 3,
    title: 'Timeline & Arrangement',
    description:
      'Record, arrange, and edit your clips on the timeline. Zoom in/out and navigate your project here.',
    spotlightSelector: '.timeline-container',
    arrowPosition: 'top',
  },
  {
    id: 4,
    title: 'Sound Browser',
    description:
      'Browse and drag samples, loops, and plugins onto your tracks. Find everything you need to produce.',
    spotlightSelector: '.browser-panel',
    arrowPosition: 'right',
  },
  {
    id: 5,
    title: 'Transport Controls',
    description:
      'Control playback, recording, tempo, and timing. Click Play to start, Record to capture audio.',
    spotlightSelector: '.transport-container',
    arrowPosition: 'top',
  },
  {
    id: 6,
    title: 'Mixer & Effects',
    description:
      'Adjust volume, pan, and add effects to each track. Create professional mixes with precision control.',
    spotlightSelector: '.mixer-panel',
    arrowPosition: 'right',
  },
];

interface StudioTutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function StudioTutorial({ onComplete, onSkip }: StudioTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const containerRef = useFocusTrap(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const saveTutorialMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/user/preferences', {
        tutorialCompleted: { studio: true },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/preferences'] });
    },
  });

  const updateSpotlight = useCallback(() => {
    const step = TUTORIAL_STEPS[currentStep];
    if (!step) return;

    const element = document.querySelector(step.spotlightSelector);
    if (element) {
      const rect = element.getBoundingClientRect();
      setSpotlightRect(rect);
    } else {
      setSpotlightRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    return () => window.removeEventListener('resize', updateSpotlight);
  }, [updateSpotlight]);

  useEffect(() => {
    const step = TUTORIAL_STEPS[currentStep];
    if (step) {
      announce(
        `Step ${currentStep + 1} of ${TUTORIAL_STEPS.length}: ${step.title}. ${step.description}`
      );
    }
  }, [currentStep]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevious();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = async () => {
    setIsClosing(true);
    try {
      await saveTutorialMutation.mutateAsync();
    } catch (error: unknown) {
      logger.error('Failed to save tutorial completion:', error);
      toast({
        title: 'Tutorial Completed',
        description: 'Your progress will be saved when connection is restored.',
        variant: 'default',
      });
    } finally {
      setTimeout(() => {
        onComplete();
      }, 300);
    }
  };

  const handleClose = async () => {
    setIsClosing(true);
    try {
      await saveTutorialMutation.mutateAsync();
    } catch (error: unknown) {
      logger.error('Failed to save tutorial skip:', error);
      toast({
        title: 'Tutorial Skipped',
        description: 'Your preference will be saved when connection is restored.',
        variant: 'default',
      });
    } finally {
      setTimeout(() => {
        onSkip();
      }, 300);
    }
  };

  const step = TUTORIAL_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  const getSpotlightStyle = (): React.CSSProperties => {
    if (!spotlightRect) {
      return {
        clipPath: 'inset(0 0 0 0)',
      };
    }

    const padding = 8;
    const x = spotlightRect.left - padding;
    const y = spotlightRect.top - padding;
    const width = spotlightRect.width + padding * 2;
    const height = spotlightRect.height + padding * 2;

    return {
      clipPath: `polygon(
        0% 0%,
        0% 100%,
        ${x}px 100%,
        ${x}px ${y}px,
        ${x + width}px ${y}px,
        ${x + width}px ${y + height}px,
        ${x}px ${y + height}px,
        ${x}px 100%,
        100% 100%,
        100% 0%
      )`,
    };
  };

  const getArrowStyle = (): React.CSSProperties => {
    if (!spotlightRect || !step.arrowPosition) {
      return { display: 'none' };
    }

    const arrowSize = 40;
    let top = 0;
    let left = 0;
    let transform = '';

    switch (step.arrowPosition) {
      case 'top':
        top = spotlightRect.top - arrowSize - 20;
        left = spotlightRect.left + spotlightRect.width / 2 - arrowSize / 2;
        transform = 'rotate(180deg)';
        break;
      case 'bottom':
        top = spotlightRect.bottom + 20;
        left = spotlightRect.left + spotlightRect.width / 2 - arrowSize / 2;
        break;
      case 'left':
        top = spotlightRect.top + spotlightRect.height / 2 - arrowSize / 2;
        left = spotlightRect.left - arrowSize - 20;
        transform = 'rotate(90deg)';
        break;
      case 'right':
        top = spotlightRect.top + spotlightRect.height / 2 - arrowSize / 2;
        left = spotlightRect.right + 20;
        transform = 'rotate(-90deg)';
        break;
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      transform,
      width: `${arrowSize}px`,
      height: `${arrowSize}px`,
      pointerEvents: 'none',
      zIndex: 10002,
    };
  };

  const getContentStyle = (): React.CSSProperties => {
    if (!spotlightRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const contentWidth = 400;
    const contentHeight = 200;
    const margin = 20;

    let top = spotlightRect.bottom + margin;
    let left = spotlightRect.left;
    let transform = '';

    if (top + contentHeight > window.innerHeight) {
      top = spotlightRect.top - contentHeight - margin;
    }

    if (left + contentWidth > window.innerWidth) {
      left = window.innerWidth - contentWidth - margin;
    }

    if (left < margin) {
      left = margin;
    }

    if (top < margin) {
      top = margin;
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      transform,
    };
  };

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[10000] transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      aria-describedby="tutorial-description"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-all duration-500"
        style={getSpotlightStyle()}
        onClick={handleClose}
      />

      {spotlightRect && (
        <div
          className="absolute border-4 border-purple-500 rounded-lg pointer-events-none animate-pulse"
          style={{
            top: `${spotlightRect.top - 8}px`,
            left: `${spotlightRect.left - 8}px`,
            width: `${spotlightRect.width + 16}px`,
            height: `${spotlightRect.height + 16}px`,
            zIndex: 10001,
          }}
        />
      )}

      {step.arrowPosition && (
        <div style={getArrowStyle()} className="animate-bounce">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-purple-500"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </div>
      )}

      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-md transition-all duration-500 transform"
        style={isFirstStep ? { ...getContentStyle() } : getContentStyle()}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Close tutorial"
        >
          <X className="w-5 h-5" />
        </button>

        {isFirstStep && (
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
        )}

        <h2
          id="tutorial-title"
          className="text-2xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent"
        >
          {step.title}
        </h2>

        <p id="tutorial-description" className="text-gray-600 dark:text-gray-300 mb-6">
          {step.description}
        </p>

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Step {currentStep + 1} of {TUTORIAL_STEPS.length}
          </div>
          <div className="flex gap-1">
            {TUTORIAL_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-purple-500'
                    : index < currentStep
                      ? 'bg-purple-300'
                      : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          {!isFirstStep && (
            <Button
              onClick={handlePrevious}
              variant="outline"
              className="flex-1"
              disabled={isFirstStep}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
          )}

          {isFirstStep ? (
            <div className="flex gap-3 w-full">
              <Button onClick={handleClose} variant="ghost" className="flex-1">
                Skip Tutorial
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                Start Tour
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          ) : (
            <>
              {!isFirstStep && (
                <Button onClick={handleClose} variant="ghost" className="text-sm">
                  Skip
                </Button>
              )}
              <Button
                onClick={isLastStep ? handleFinish : handleNext}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {isLastStep ? 'Finish Tour' : 'Next'}
                {!isLastStep && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            </>
          )}
        </div>

        <div className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
          Use arrow keys to navigate • Press Esc to close
        </div>
      </div>
    </div>
  );
}
