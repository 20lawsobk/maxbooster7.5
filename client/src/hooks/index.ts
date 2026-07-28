export { useDebounce, useDebouncedCallback } from "./useDebounce";
export { useNetworkStatus, useRetryWithBackoff } from "./useNetworkStatus";
export type {
  NetworkState,
  NetworkStatus,
  UseNetworkStatusOptions,
} from "./useNetworkStatus";

export { useSubmitState, useFormField, useButtonState } from "./useSubmitState";
export type {
  SubmitState,
  FieldError,
  UseSubmitStateOptions,
  UseSubmitStateResult,
  FormFieldState,
  UseFormFieldOptions,
} from "./useSubmitState";

export {
  useToastWithRetry,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
} from "./useToastWithRetry";
export type { ToastVariant, ToastWithRetryOptions } from "./useToastWithRetry";

export { useToast, toast } from "./use-toast";
export { useApiError, useApiErrorHandler } from "./useApiError";
export {
  useFormValidation,
  useFieldValidation,
  useAsyncValidation,
} from "./useFormValidation";

export {
  useReducedMotion,
  getReducedMotionStyles,
  getAlternativeTransition,
} from "./useReducedMotion";
export type {
  ReducedMotionOptions,
  ReducedMotionResult,
} from "./useReducedMotion";

export { useHighContrast } from "./useHighContrast";
export type {
  ContrastMode,
  HighContrastOptions,
  HighContrastResult,
  ContrastColors,
} from "./useHighContrast";

export { useUserPreferences, useDashboardLayout } from "./useUserPreferences";
export type {
  ArtistType,
  CareerStage,
  LayoutPreset,
  DashboardWidget,
  DashboardLayout,
  UserPreferences,
  PreferenceRecommendation,
} from "./useUserPreferences";

export {
  useSmartDefaults,
  useSchedulingSuggestions,
  usePlatformRecommendations,
  useGenreTemplates,
  useArtistTypeDefaults,
} from "./useSmartDefaults";
export type {
  SmartDefault,
  GenreTemplate,
  SchedulingSuggestion,
  PlatformRecommendation,
} from "./useSmartDefaults";

export {
  useRecommendations,
  useNextActions,
  usePersonalizedTips,
  useCareerStageGuidance,
} from "./useRecommendations";
export type {
  NextAction,
  PersonalizedTip,
  CareerGuidance,
} from "./useRecommendations";

export { useOfflineStatus } from "./useOfflineStatus";
export type { OfflineStatusState } from "./useOfflineStatus";

export { useOnlineStatus } from "./useOnlineStatus";
export type { OnlineStatusState, ConnectionQuality } from "./useOnlineStatus";

export {
  useOfflineCache,
  useOfflineCacheCategory,
  useOfflineCacheStats,
} from "./useOfflineCache";
export type {
  UseOfflineCacheReturn,
  UseOfflineCacheOptions,
} from "./useOfflineCache";

export { useSyncStatus } from "./useSyncStatus";
export type { SyncStatusState, UseSyncStatusReturn } from "./useSyncStatus";

export { useDraftSave } from "./useDraftSave";
export type { DraftSaveOptions, DraftSaveResult } from "./useDraftSave";

export { usePendingSync } from "./usePendingSync";
export type { PendingSyncState } from "./usePendingSync";

export { useOfflineCapable } from "./useOfflineCapable";
export type {
  FeatureCapability,
  OfflineCapabilities,
} from "./useOfflineCapable";

export { useFocusTrap } from "./useFocusTrap";

export {
  useFocusReturn,
  useDialogFocusReturn,
  useModalFocusReturn,
} from "./useFocusReturn";
export type {
  UseFocusReturnOptions,
  UseFocusReturnResult,
} from "./useFocusReturn";

export { useScreenReaderAnnounce } from "./useScreenReaderAnnounce";
export type {
  UseScreenReaderAnnounceOptions,
  ScreenReaderAnnounceResult,
  AnnouncementPriority as ScreenReaderAnnouncementPriority,
} from "./useScreenReaderAnnounce";

export { useRovingFocus, useRovingFocusGroup } from "./useRovingFocus";
export type {
  RovingFocusOrientation,
  UseRovingFocusOptions,
  RovingFocusItemProps,
  UseRovingFocusResult,
} from "./useRovingFocus";

export { useScreenReaderAnnouncer } from "./useScreenReaderAnnouncer";
export type {
  AnnouncementPriority,
  UseScreenReaderAnnouncerOptions,
  ScreenReaderAnnouncerResult,
} from "./useScreenReaderAnnouncer";

export { useKeyboardNavigation } from "./useKeyboardNavigation";
export type {
  NavigationOrientation,
  UseKeyboardNavigationOptions,
  UseKeyboardNavigationResult,
} from "./useKeyboardNavigation";

export { useRovingTabIndex, useRovingTabIndexGroup } from "./useRovingTabIndex";
export type {
  RovingOrientation,
  UseRovingTabIndexOptions,
  RovingTabIndexItem,
  UseRovingTabIndexResult,
} from "./useRovingTabIndex";

export {
  useAccessibility,
  useAnnounce as useA11yAnnounce,
  useA11yReducedMotion,
  useA11yHighContrast,
  useAccessibilityPreferences,
  useA11yFocusMainContent,
  useReducedMotionPreference,
  useHighContrastPreference,
} from "./useAccessibility";
export type {
  AccessibilityContextValue,
  AccessibilityPreferences,
} from "./useAccessibility";

export { useAnnounce } from "./useAnnounce";
export type { UseAnnounceOptions, UseAnnounceResult } from "./useAnnounce";

export {
  useAnnouncer,
  useLoadingAnnouncer,
  useRouteAnnouncer,
  useDialogAnnouncer,
} from "./useAnnouncer";
export type { UseAnnouncerOptions, UseAnnouncerResult } from "./useAnnouncer";

export { useAutoSyncAccessibilityPreferences } from "./useAccessibilityPreferences";
export type { AccessibilityPreferences as A11yPreferences } from "./useAccessibilityPreferences";

export {
  useUndo,
  useUndoHistory,
  useUndoActions,
  useLastAction,
  UndoProvider,
  useUndoableAction,
  useUndoableDelete,
  useUndoableCreate,
  useUndoableMove,
  useUndoableReorder,
  useUndoableUpdate,
  useUndoableSettingsChange,
  createUndoableAction,
  createActionId,
  createGroupId,
  isDestructiveAction,
  getActionLabel,
} from "./useUndo";
export type {
  UndoProviderProps,
  UseUndoableActionOptions,
  WithUndoProps,
  UndoableAction,
  ActionType,
  ActionCategory,
  ActionMetadata,
  ActionGroup,
  UndoState,
  UndoContextValue,
} from "./useUndo";

export {
  useActionHistory,
  useModuleHistory,
  useRecentActions,
} from "./useActionHistory";
export type {
  ActionHistoryEntry,
  ActionHistoryFilters,
  UseActionHistoryOptions,
  UseActionHistoryResult,
} from "./useActionHistory";

export {
  useRecoverable,
  useRecoverableDelete,
  useRecoverableUpdate,
  useRecoverableCreate,
  useRecoverableSettingsChange,
  useRecoverableBatch,
} from "./useRecoverable";
export type { RecoverableOptions, RecoverableResult } from "./useRecoverable";

export { useUndoStack, useUndoableOperation } from "./useUndoStack";
export type { UseUndoStackOptions, UseUndoStackReturn } from "./useUndoStack";

export {
  useUndoableAction as useUndoableActionHook,
  useUndoableDelete as useUndoableDeleteHook,
  useUndoableCreate as useUndoableCreateHook,
  useUndoableUpdate as useUndoableUpdateHook,
  useUndoableSettingsChange as useUndoableSettingsChangeHook,
  useUndoableBatch,
  useUndoableFileDelete,
  useUndoablePostDelete,
  useUndoableTrackRemove,
} from "./useUndoableAction";
export type { UseUndoableActionOptions as UndoableActionOptions } from "./useUndoableAction";

export { useOffline } from "./useOffline";
export type { OfflineState, UseOfflineReturn } from "./useOffline";

export { useOfflineQueue } from "./useOfflineQueue";
export type {
  UseOfflineQueueReturn,
  EnqueueOptions,
  QueueStats as OfflineQueueStats,
} from "./useOfflineQueue";

export {
  useLocalStorage,
  useLocalStorageObject,
  useSessionStorage,
  usePersistedState,
} from "./useLocalStorage";
export type { UseLocalStorageOptions } from "./useLocalStorage";

export { useSyncQueue } from "./useSyncQueue";
export type {
  QueueStats,
  UseSyncQueueOptions,
  UseSyncQueueReturn,
} from "./useSyncQueue";

export { useDraft, useAutoSaveDraft } from "./useDraft";
export type { UseDraftOptions, UseDraftReturn } from "./useDraft";

export { useCommands, useCommand, useCommandExecution } from "./useCommands";
export type { UseCommandsOptions } from "./useCommands";

export {
  useShortcut,
  useShortcuts_Multiple,
  useGlobalShortcut,
  useStudioShortcut,
} from "./useShortcut";
export type { UseShortcutOptions } from "./useShortcut";

export { useCommandPalette } from "./useCommandPalette";
export type { UseCommandPaletteReturn } from "./useCommandPalette";

export {
  useModuleShortcuts,
  useStudioShortcuts,
  useAnalyticsShortcuts,
  useSocialShortcuts,
  useDistributionShortcuts,
  useMarketplaceShortcuts,
  STUDIO_MODULE_SHORTCUTS,
  ANALYTICS_MODULE_SHORTCUTS,
  SOCIAL_MODULE_SHORTCUTS,
  DISTRIBUTION_MODULE_SHORTCUTS,
  MARKETPLACE_MODULE_SHORTCUTS,
} from "./useModuleShortcuts";
export type {
  ModuleShortcut,
  UseModuleShortcutsOptions,
} from "./useModuleShortcuts";

export { useShortcutCustomization } from "./useShortcutCustomization";
export type {
  CustomShortcut,
  ShortcutPreferences,
} from "./useShortcutCustomization";

export { useKeyboardShortcuts } from "./useKeyboardShortcuts";

export {
  useContextMenu,
  useContextMenuTarget,
  useGlobalContextMenu,
} from "./useContextMenu";
export type { ContextMenuState, UseContextMenuOptions } from "./useContextMenu";

export {
  useDashboardPersonalization,
  useWidgetTracking,
} from "./useDashboardPersonalization";
export type {
  WidgetUsageData,
  DashboardWidget as DashboardPersonalizationWidget,
  PersonalizedLayout,
  DashboardPreferences,
} from "./useDashboardPersonalization";

export {
  useSmartScheduling,
  useOptimalPostingTime,
  useAudienceTimezones,
} from "./useSmartScheduling";
export type {
  DayOfWeek as SmartScheduleDayOfWeek,
  TimeSlot as SmartScheduleTimeSlot,
  ScheduleSuggestion as SmartScheduleSuggestion,
  AudienceTimezone,
  SmartScheduleData as SmartSchedulingData,
  EngagementPattern,
} from "./useSmartScheduling";

export {
  useRecommendedActions,
  useNextAction,
  useCareerProgress,
} from "./useRecommendedActions";
export type {
  CareerStage as RecommendedActionsCareerStage,
  ArtistType as RecommendedActionsArtistType,
  ActionPriority as RecommendedActionsPriority,
  ActionType as RecommendedActionsType,
  ActionCategory,
  RecommendedAction as RecommendedActionItem,
  PersonalizedTip,
  CareerGuidance,
} from "./useRecommendedActions";

export {
  useFeatureUsage,
  useFeatureTracking,
  useFeatureVisibility,
} from "./useFeatureUsage";
export type {
  FeatureUsageEntry,
  FeatureVisibility,
  FeatureUsageStats,
  FeaturePriorityUpdate,
} from "./useFeatureUsage";

export {
  useFeatureUsageTracking,
  usePageTracking,
  useActionTracking,
} from "./useFeatureUsageTracking";

export {
  useGlobalUndo,
  useUndoState,
  useUndoActionsOnly,
  useUndoRecovery,
} from "./useGlobalUndo";
export type {
  GlobalUndoState,
  GlobalUndoActions,
  GlobalUndoRecovery,
  RestorePoint,
  UseGlobalUndoOptions,
  UseGlobalUndoReturn,
} from "./useGlobalUndo";

export {
  useRecoveryPoints,
  useAutoRecovery,
  useQuickRestore,
} from "./useRecoveryPoints";
export type {
  RecoveryPoint as RecoveryPointData,
  RecoveryPointInput,
  UseRecoveryPointsOptions,
  UseRecoveryPointsReturn,
} from "./useRecoveryPoints";

export {
  useSelection,
  useMultiSelectKeyboard,
  useSelectionShortcuts,
} from "./useSelection";
export type {
  SelectionItem,
  UseSelectionOptions,
  UseSelectionResult,
} from "./useSelection";
