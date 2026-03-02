# Studio — DAW & Audio Engineering

The Max Booster Studio is a fully browser-based Digital Audio Workstation (DAW) with real-time multi-user collaboration, AI music generation, and professional-grade audio processing.

## DAW Component Architecture

Multiple DAW implementations serve different use cases:

| Component | Purpose | Key Technology |
|---|---|---|
| `StudioOneDAW.tsx` | Primary full-featured DAW | React + Tone.js + Yjs |
| `HighPerformanceDAW.tsx` | Performance-optimized rendering | Tone.js + PIXI.js (WebGL) |
| `UltimateDAW.tsx` | AI-first "Flow State" DAW | Multi-mode + 3D spatial |

## StudioOneDAW — Primary Interface

The flagship DAW component (2,000+ lines). Full-featured multi-track production environment.

**Transport Controls**
- Play, Stop, Record, Loop with frame-accurate timing
- BPM and time signature control
- Metronome with pre-roll count
- Musical position (bars:beats:ticks) + wall-clock display

**Project Lifecycle**
- Auto-save with dirty-state tracking
- Version history (snapshots on major operations)
- Recovery points (crash-safe, persisted to `localStorage`)
- Collaborative conflict resolution via Yjs CRDT

**Editing Operations**
- Clip splitting, duplication, trimming
- Drag-and-drop clip repositioning
- Automation toggling per track
- Fade in/out handles
- Take group management (comping workflow)

**Keyboard Shortcuts** (professional workflow)
| Shortcut | Action |
|---|---|
| `Space` | Play/Stop |
| `R` | Toggle Record |
| `Ctrl+S` | Save project |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+D` | Duplicate selection |
| `S` | Split at playhead |
| `M` | Mute selected track |
| `I` | Toggle inspector panel |

**Inspector Panel**
- Track-level EQ, compression, reverb, delay controls
- Plugin rack management per track
- Routing configuration (aux sends, bus routing)
- VU/RMS metering per track

## HighPerformanceDAW — Real-Time Rendering Engine

Uses Tone.js for audio scheduling and PIXI.js (WebGL) for rendering — hardware-accelerated even with 100+ tracks.

### Custom Master Clock (`useMasterClock` hook)

Sub-millisecond timing accuracy using `requestAnimationFrame`:
- Synchronized with Tone.js transport for sample-accurate scheduling
- Visual position updates at display frame rate without audio jitter
- Drift compensation (corrects for animation frame budget variance)

### PixiWaveformRenderer (`PixiWaveformRenderer.tsx`)

WebGL-powered waveform rendering:
- Handles large audio files (1+ hour recordings) without UI lag
- Dynamic peak generation — downsamples to display resolution
- Smooth zooming and panning of clips
- Draggable clip boundaries with magnetic snap
- Hardware-accelerated: renders at 60fps even with 50+ tracks visible

### Audio Signal Chain

```
Input → Track Gain → Plugin Rack → Pan → Bus Send(s) → Master Bus
                                                              │
                                                    Master Compressor
                                                              │
                                                      Limiter (0dBFS)
                                                              │
                                                         Output
```

VU metering at track level and master bus. Per-track plugin racks include:
- Parametric EQ (4-band with high/low shelf)
- Compressor (threshold, ratio, attack, release, knee, makeup gain)
- Reverb (room size, pre-delay, wet/dry)
- Delay (time, feedback, wet/dry, sync to BPM option)

## UltimateDAW — AI-First Production

Switches between five specialized production modes:

| Mode | Purpose |
|---|---|
| `Create` | Songwriting with AI melody/chord suggestions |
| `Record` | Live recording with punch-in/out |
| `Mix` | Full mixer view with automation |
| `Master` | Mastering chain with LUFS metering |
| `Perform` | Live performance layout |

**AI integration**:
- Melody generation into timeline directly
- Drum pattern generation
- Bass line generation
- AI Co-Producer assistant panel
- 3D Spatial Workspace for spatial audio mixing

## RealTimeWaveformDisplay

Live audio visualization during recording:
- **Dual-layer Canvas**: Static waveform layer + dynamic progress/hover layer
- Only the dynamic layer repaints during playback — static layer cached
- Eliminates full-canvas redraws for smooth 60fps updates during playback

## DAW Controls Bar (`DAWEngineControls.tsx`)

Global control strip with:
- BPM input with tap tempo
- Time signature selector
- Grid Division (snap): 1/1, 1/2, 1/4, 1/8, 1/16, 1/32, triplet, dotted
- Musical position and wall-clock time displays
- Quick-add menus: Audio Track, Instrument Track, MIDI Track, Bus, Aux
- AI Co-Producer shortcut
- Mix Analysis shortcut
- Chord Suggestions shortcut

## Audio Processing Tools

### Signal Analyzers
| Component | Measurement |
|---|---|
| `VUMeter.tsx` | Volume Units (VU) meter — classic ballistic response |
| `RMSMeter.tsx` | RMS level — true power of signal |
| `LEDMeter.tsx` | Peak-hold LED-style meters |
| `SpectrumAnalyzer.tsx` | Real-time FFT spectrum display |
| `SidechainVisualizer.tsx` | Sidechain compression gain reduction display |

### Processors
| Component | Purpose |
|---|---|
| `AnalogWarmthProcessor.tsx` | Tape saturation and harmonic enhancement |
| `SpectralProcessor.tsx` | FFT-domain processing (spectral EQ, de-noise) |

## Piano Roll & MIDI Editing

**`PianoRoll.tsx`**
- Full MIDI editor with velocity lanes
- Note resize, move, quantize
- Scale highlighting (shows in-scale notes)
- Chord detection and labelling
- Piano keyboard scroll reference

**`DrumEditor.tsx`**
- Step-sequencer grid
- Per-hit velocity control
- Swing/groove quantization
- Pattern chaining

**`ScoreEditor.tsx`**
- Western musical notation view
- Editable note entry
- Export to MusicXML

**`PatternEditor.tsx`**
- Loop-based pattern creation
- Pattern library and arrangement

## Collaboration (`yjsService.ts`, `FlowStateCollaboration.tsx`)

Real-time multi-user editing powered by **Yjs CRDT**:

```
User A edits clip → Yjs document update → WebSocket broadcast → User B sees change
User B edits simultaneously → Yjs merges without conflict → Both see correct result
```

**Presence system**:
- Real-time cursor positions per user
- User status: online, idle, typing
- Color-coded collaborator indicators
- `UserPresenceIndicator.tsx` — shows who is active and what they're doing

**`CollaborationOutcomes.tsx`**
- Broadcasts "presence outcomes" (cursor updates, selection changes) across all connected clients
- Handles edge cases: concurrent edits, disconnection/reconnect, merge conflicts

## Take Management & Comping

Professional recording workflow:

| Table | Purpose |
|---|---|
| `take_groups` | Groups of related takes (e.g., all vocal takes for a verse) |
| `take_lanes` | Individual recording lanes within a group |
| `take_segments` | Individual audio segments on each lane |

**`compingService.ts`**: Select best moments from multiple takes and assemble them into a single composite performance.

## Stem Export System (`stemExportService.ts`)

Professional stem extraction:

| Feature | Detail |
|---|---|
| Formats | WAV, FLAC, MP3, AAC |
| Quality levels | Configurable per format |
| Sample rates | 8Hz – 192kHz |
| Bit depths | 8, 16, 24, 32-bit |
| Normalization | Peak, RMS, LUFS, or none |
| Effects | Include or bypass per stem |
| Bundle | ZIP archive for multi-stem packages |
| Progress | Real-time progress tracking with ETA |

## Custom React Hooks — Audio Domain

| Hook | Purpose |
|---|---|
| `useAudioEngine` | Direct Web Audio / Tone.js engine access |
| `useDAWCore` | Transport, track, and state management |
| `useAudioRecorder` | Single-track recording with buffer management |
| `useMultiTrackRecorder` | Multi-track simultaneous recording |
| `useMetronome` | Timing, sound generation, pre-roll |
| `useStudioScale` | High-density UI scaling calculations |
| `useProjectSync` | Server persistence with auto-save |
| `useRecoveryPoints` | Crash recovery via localStorage snapshots |
| `useUndo` / `useGlobalUndo` | Multi-level, categorized undo/redo |
| `useKeyboardShortcuts` | Global and context-aware hotkey system |
| `useOfflineCache` | Local audio asset storage for offline use |
| `useSyncQueue` | Offline-queued action sync on reconnect |

## VST Plugin Bridge (`vstPluginBridge.ts`)

Hosts local VST plugins in the cloud environment:
- Plugin discovery and registration
- Audio buffer routing to plugin host
- Parameter automation
- State serialization for project save/load
- `studioPlugins.ts` route exposes plugin management API

## Waveform Cache (`waveformCacheService.ts`)

Pre-computed waveform data (peak arrays, RMS values) is cached to avoid re-analysing audio files on every load. Cache hit = instant waveform display. Cache miss = compute and store.

## AI Music Generation (`studioGeneration.ts`, `AIMusicGenerator.tsx`)

| Endpoint | Input | Output |
|---|---|---|
| `POST /text` | Text prompt + parameters | Generated audio track |
| `POST /audio` | Audio reference | Transformed audio |
| `POST /pattern/melody` | Key, scale, tempo, complexity | MIDI melody pattern |
| `POST /pattern/drums` | Genre, tempo, complexity | MIDI drum pattern |

**`AIMusicGenerator.tsx`** UI parameters:
- Genre, tempo (BPM), key, scale
- Mood and complexity sliders
- AI Copyright Notice displayed
- Generated tracks directly addable to the active DAW project
