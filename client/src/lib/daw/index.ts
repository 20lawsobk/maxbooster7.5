export { TransportEngine, transportEngine } from './TransportEngine';
export type { 
  TempoEvent, 
  TimeSignatureEvent, 
  TransportEngineState, 
  MusicalPosition, 
  TimePosition,
  TransportEventType,
  TransportEvent 
} from './TransportEngine';

export { TimelineEngine, timelineEngine } from './TimelineEngine';
export type { 
  TimelineEvent, 
  TimelineMarker, 
  TimelineRegion, 
  QuantizeSettings,
  EditMode,
  TimelineEngineState 
} from './TimelineEngine';

export { AutomationEngine, automationEngine } from './AutomationEngine';
export type { 
  AutomationMode, 
  CurveType, 
  AutomationPoint, 
  AutomationLane,
  AutomationClip,
  AutomationEngineState 
} from './AutomationEngine';

export { RoutingEngine, routingEngine } from './RoutingEngine';
export type { 
  NodeType, 
  RoutingNode, 
  RoutingEdge, 
  RoutingPath,
  RoutingGraphState 
} from './RoutingEngine';

export { MIDIEngine, midiEngine } from './MIDIEngine';
export type { 
  MIDINote, 
  MIDIControlChange, 
  MIDIPitchBend, 
  MIDIClip,
  QuantizeOptions,
  VelocityEditOptions,
  MIDIEngineState,
  MIDIEventType,
  MIDIEvent 
} from './MIDIEngine';

export { NonDestructiveAudioEngine, nonDestructiveAudio } from './NonDestructiveAudio';
export type { 
  AudioSource, 
  FadeSettings, 
  TimeStretchSettings, 
  PitchShiftSettings,
  AudioEvent,
  AudioClipboard,
  NonDestructiveAudioState 
} from './NonDestructiveAudio';

export { PluginStateManager, pluginStateManager } from './PluginStateManager';
export type { 
  PluginPreset, 
  PluginState, 
  PluginAutomationBinding,
  PluginStateManagerState 
} from './PluginStateManager';

export { MusicalIntelligenceEngine, musicalIntelligence } from './MusicalIntelligence';
export type { 
  ChordQuality, 
  Chord, 
  ChordProgression, 
  ScaleInfo,
  AnalysisResult,
  MixSuggestion,
  ArrangementSuggestion,
  MusicalIntelligenceState 
} from './MusicalIntelligence';

export { ProjectManager, projectManager } from './ProjectManager';
export type { 
  ProjectMetadata, 
  ProjectVersion, 
  MediaPoolItem,
  ProjectState,
  ProjectManagerState 
} from './ProjectManager';

export { Command, CommandHistory, BatchCommand, commandHistory, createCommand } from './CommandSystem';
export type { CommandHistoryState } from './CommandSystem';

export { DAWCore, dawCore } from './DAWCore';
export type { DAWTrack, DAWCoreState } from './DAWCore';
