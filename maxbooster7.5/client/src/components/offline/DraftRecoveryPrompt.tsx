import { useState, useEffect } from 'react';
import { FileText, X, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { draftStorage, Draft } from '@/lib/offline';
import { formatDistanceToNow } from 'date-fns';

interface DraftRecoveryPromptProps {
  formId: string;
  className?: string;
  onRecover: (data: unknown) => void;
  onDiscard?: () => void;
  autoShow?: boolean;
  showDetails?: boolean;
}

export function DraftRecoveryPrompt({
  formId,
  className,
  onRecover,
  onDiscard,
  autoShow = true,
  showDetails = true,
}: DraftRecoveryPromptProps) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!autoShow) return;

    const checkForDraft = async () => {
      try {
        await draftStorage.init();
        const existingDraft = await draftStorage.getDraft(formId);
        if (existingDraft) {
          setDraft(existingDraft);
          setTimeout(() => {
            setIsVisible(true);
            setIsAnimating(true);
          }, 500);
        }
      } catch (error) {
        console.error('[DraftRecoveryPrompt] Failed to check for draft:', error);
      }
    };

    checkForDraft();
  }, [formId, autoShow]);

  const handleRecover = async () => {
    if (!draft) return;

    onRecover(draft.data);
    await handleDismiss();
  };

  const handleDiscard = async () => {
    if (!draft) return;

    try {
      await draftStorage.deleteDraft(formId);
      onDiscard?.();
    } catch (error) {
      console.error('[DraftRecoveryPrompt] Failed to discard draft:', error);
    }
    await handleDismiss();
  };

  const handleDismiss = async () => {
    setIsAnimating(false);
    await new Promise(resolve => setTimeout(resolve, 300));
    setIsVisible(false);
    setDraft(null);
  };

  const getPreviewText = (): string => {
    if (!draft?.data) return '';
    const data = draft.data as Record<string, unknown>;
    if (typeof data === 'object') {
      const values = Object.values(data).filter(v => typeof v === 'string' && v.length > 0);
      const preview = values.join(' ').substring(0, 100);
      return preview + (preview.length >= 100 ? '...' : '');
    }
    return '';
  };

  if (!isVisible || !draft) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50',
        'transition-all duration-300 ease-out',
        isAnimating ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className
      )}
    >
      <div className="relative overflow-hidden rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
        
        <div className="relative p-4">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </button>

          <div className="flex items-start gap-3 pr-8">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
                Unsaved Draft Found
              </h4>
              <p className="text-blue-700 dark:text-blue-300 text-xs mt-0.5">
                Saved {formatDistanceToNow(draft.updatedAt, { addSuffix: true })}
              </p>
              
              {showDetails && getPreviewText() && (
                <p className="text-blue-600 dark:text-blue-400 text-xs mt-2 line-clamp-2 italic">
                  "{getPreviewText()}"
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              className="flex-1 text-blue-700 dark:text-blue-300 hover:text-blue-900 hover:bg-blue-100 dark:hover:bg-blue-900"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleRecover}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Restore Draft
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DraftRecoveryPrompt;
