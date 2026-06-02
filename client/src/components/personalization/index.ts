export {
  PersonalizedDashboard,
  default as PersonalizedDashboardDefault,
} from "./PersonalizedDashboard";
export {
  SmartActionBar,
  default as SmartActionBarDefault,
} from "./SmartActionBar";
export {
  ArtistTypeRecommendations,
  default as ArtistTypeRecommendationsDefault,
} from "./ArtistTypeRecommendations";
export {
  SmartDefaultsProvider,
  useSmartDefaultsContext,
  default as SmartDefaultsProviderDefault,
} from "./SmartDefaultsProvider";
export {
  FeaturePrioritizer,
  default as FeaturePrioritizerDefault,
} from "./FeaturePrioritizer";
export {
  PreferenceLearner,
  default as PreferenceLearnerDefault,
} from "./PreferenceLearner";
export {
  SmartWidget,
  SmartWidgetSkeleton,
  SmartWidgetGrid,
  default as SmartWidgetDefault,
} from "./SmartWidget";
export {
  RecommendedActions,
  default as RecommendedActionsDefault,
} from "./RecommendedActions";
export {
  SmartDefaults,
  default as SmartDefaultsDefault,
} from "./SmartDefaults";
export {
  DashboardCustomizer,
  default as DashboardCustomizerDefault,
} from "./DashboardCustomizer";
export { WidgetPicker, default as WidgetPickerDefault } from "./WidgetPicker";
export {
  NextActionCard,
  NextActionsList,
  default as NextActionCardDefault,
} from "./NextActionCard";
export {
  SmartScheduleSuggestion,
  default as SmartScheduleSuggestionDefault,
} from "./SmartScheduleSuggestion";
export {
  SmartSchedulingSuggestions,
  default as SmartSchedulingSuggestionsDefault,
} from "./SmartSchedulingSuggestions";
export {
  RecommendedActionsPanel,
  default as RecommendedActionsPanelDefault,
} from "./RecommendedActionsPanel";
export {
  FeatureUsageTracker,
  FeatureTracker,
  default as FeatureUsageTrackerDefault,
} from "./FeatureUsageTracker";

export type { ArtistType, CareerStage } from "./ArtistTypeRecommendations";
export type {
  SmartDefault,
  GenrePreset,
  DashboardWidget,
  TimeOfDayLayout,
  PersonalizationPreferences,
  InteractionEvent,
  LearningInsight,
} from "./SmartDefaultsProvider";
export type { FeatureUsageData } from "./FeaturePrioritizer";
export type { InteractionPattern, LearningState } from "./PreferenceLearner";
export type {
  SmartWidgetConfig,
  SmartWidgetProps,
  WidgetSize,
} from "./SmartWidget";
export type { RecommendedAction } from "./RecommendedActions";
export type { Widget } from "./WidgetPicker";
export type { NextAction, ActionPriority, ActionType } from "./NextActionCard";
export type {
  ScheduleSuggestion,
  SmartScheduleData,
  DayOfWeek,
  TimeSlot,
} from "./SmartScheduleSuggestion";
