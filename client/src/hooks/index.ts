export { useDebounce, useDebouncedCallback } from './useDebounce';
export { useNetworkStatus, useRetryWithBackoff } from './useNetworkStatus';
export type { NetworkState, NetworkStatus, UseNetworkStatusOptions } from './useNetworkStatus';

export { useSubmitState, useFormField, useButtonState } from './useSubmitState';
export type { 
  SubmitState, 
  FieldError, 
  UseSubmitStateOptions, 
  UseSubmitStateResult,
  FormFieldState,
  UseFormFieldOptions,
} from './useSubmitState';

export { 
  useToastWithRetry,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
} from './useToastWithRetry';
export type { ToastVariant, ToastWithRetryOptions } from './useToastWithRetry';

export { useToast, toast } from './use-toast';
export { useApiError, useApiErrorHandler } from './useApiError';
export { useFormValidation, useFieldValidation, useAsyncValidation } from './useFormValidation';

export { useReducedMotion, getReducedMotionStyles, getAlternativeTransition } from './useReducedMotion';
export type { ReducedMotionOptions, ReducedMotionResult } from './useReducedMotion';

export { useHighContrast } from './useHighContrast';
export type { ContrastMode, HighContrastOptions, HighContrastResult, ContrastColors } from './useHighContrast';

export { useUserPreferences, useDashboardLayout } from './useUserPreferences';
export type { 
  ArtistType, 
  CareerStage, 
  LayoutPreset, 
  DashboardWidget, 
  DashboardLayout, 
  UserPreferences, 
  PreferenceRecommendation 
} from './useUserPreferences';

export { 
  useSmartDefaults, 
  useSchedulingSuggestions, 
  usePlatformRecommendations, 
  useGenreTemplates,
  useArtistTypeDefaults,
} from './useSmartDefaults';
export type { SmartDefault, GenreTemplate, SchedulingSuggestion, PlatformRecommendation } from './useSmartDefaults';

export { 
  useRecommendations, 
  useNextActions, 
  usePersonalizedTips, 
  useCareerStageGuidance,
} from './useRecommendations';
export type { NextAction, PersonalizedTip, CareerGuidance } from './useRecommendations';

export { useOfflineStatus } from './useOfflineStatus';
export type { OfflineStatusState } from './useOfflineStatus';

export { useDraftSave } from './useDraftSave';
export type { DraftSaveOptions, DraftSaveResult } from './useDraftSave';

export { usePendingSync } from './usePendingSync';
export type { PendingSyncState } from './usePendingSync';

export { useOfflineCapable } from './useOfflineCapable';
export type { FeatureCapability, OfflineCapabilities } from './useOfflineCapable';

export { useFocusTrap } from './useFocusTrap';

export { useScreenReaderAnnouncer } from './useScreenReaderAnnouncer';
export type { 
  AnnouncementPriority, 
  UseScreenReaderAnnouncerOptions, 
  ScreenReaderAnnouncerResult 
} from './useScreenReaderAnnouncer';

export { useKeyboardNavigation } from './useKeyboardNavigation';
export type { 
  NavigationOrientation, 
  UseKeyboardNavigationOptions, 
  UseKeyboardNavigationResult 
} from './useKeyboardNavigation';

export { useRovingTabIndex, useRovingTabIndexGroup } from './useRovingTabIndex';
export type { 
  RovingOrientation, 
  UseRovingTabIndexOptions, 
  RovingTabIndexItem, 
  UseRovingTabIndexResult 
} from './useRovingTabIndex';
