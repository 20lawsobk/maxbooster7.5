import { useCallback } from 'react';
import { useAccessibility } from '@/components/a11y/AccessibilityProvider';
import {
  announcePolite,
  announceAssertive,
  announcePageTransition,
  announceFormValidation,
  announceFormErrors,
  announceToast,
  announceLoadingStart,
  announceLoadingComplete,
  announceListUpdate,
  announceSelection,
  announceDialogOpen,
  announceDialogClose,
} from '@/lib/a11y/screenReader';

export type AnnouncementPriority = 'polite' | 'assertive';

export interface UseAnnounceOptions {
  defaultPriority?: AnnouncementPriority;
}

export interface UseAnnounceResult {
  announce: (message: string, priority?: AnnouncementPriority) => void;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
  announcePageChange: (pageName: string) => void;
  announceFormValidation: (fieldName: string, isValid: boolean, errorMessage?: string) => void;
  announceFormErrors: (errors: Record<string, string>) => void;
  announceToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  announceLoadingStart: (context?: string) => void;
  announceLoadingComplete: (context?: string) => void;
  announceListUpdate: (action: 'added' | 'removed', itemName: string) => void;
  announceSelection: (itemName: string, isSelected: boolean) => void;
  announceDialogOpen: (dialogName: string) => void;
  announceDialogClose: (dialogName: string) => void;
}

export function useAnnounce(options: UseAnnounceOptions = {}): UseAnnounceResult {
  const { defaultPriority = 'polite' } = options;

  const announce = useCallback(
    (message: string, priority: AnnouncementPriority = defaultPriority) => {
      if (priority === 'assertive') {
        announceAssertive(message);
      } else {
        announcePolite(message);
      }
    },
    [defaultPriority]
  );

  return {
    announce,
    announcePolite,
    announceAssertive,
    announcePageChange: announcePageTransition,
    announceFormValidation,
    announceFormErrors,
    announceToast,
    announceLoadingStart,
    announceLoadingComplete,
    announceListUpdate,
    announceSelection,
    announceDialogOpen,
    announceDialogClose,
  };
}

export function useScreenReaderAnnounce() {
  const context = useAccessibility();
  return context.announce;
}

export default useAnnounce;
