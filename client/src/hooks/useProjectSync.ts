import { logger } from '../lib/logger';
import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudioStore } from '@/stores/studioStore';
import type { 
  TrackType, 
  AudioClip, 
  MidiClip,
  Track, 
  TransportState, 
  ViewState, 
  MixerState,
  PluginInstance,
  TrackSend,
  AutomationLane
} from '@/stores/studioStore';

const SYNC_DEBOUNCE_MS = 2000;
const DAW_STATE_VERSION = 1;
const PROJECT_QUERY_KEYS = [
  '/api/projects',
  '/api/studio/projects',
  '/api/studio/start-hub/summary',
];

interface BackendTrack {
  id: string;
  name: string;
  type?: string;
  trackType?: string;
  color?: string;
  volume?: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  isMuted?: boolean;
  isSolo?: boolean;
  isArmed?: boolean;
  order?: number;
}

interface BackendClip {
  id: string;
  trackId: string;
  name: string;
  filePath: string;
  startTime: number;
  duration: number;
  offset?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface SerializedAudioClip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  color: string;
  sourceUrl?: string;
  muted: boolean;
  locked: boolean;
}

interface SerializedTrack {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  frozen: boolean;
  height: number;
  collapsed: boolean;
  inputSource?: string;
  outputTarget: string;
  plugins: PluginInstance[];
  sends: TrackSend[];
  audioClips: SerializedAudioClip[];
  midiClips: MidiClip[];
  automationLanes: AutomationLane[];
}

interface SerializedDAWState {
  version: number;
  savedAt: string;
  tracks: SerializedTrack[];
  masterTrack: SerializedTrack;
  transport: {
    position: number;
    loopStart: number;
    loopEnd: number;
    tempo: number;
    timeSignatureNumerator: number;
    timeSignatureDenominator: number;
    isLooping: boolean;
    metronomeEnabled: boolean;
    countInEnabled: boolean;
    countInBars: number;
    prerollEnabled: boolean;
    prerollBars: number;
  };
  view: {
    zoom: number;
    scrollX: number;
    scrollY: number;
    snapToGrid: boolean;
    gridSize: number;
    showMixer: boolean;
    showPluginBrowser: boolean;
    showPianoRoll: boolean;
    selectedTrackIds: string[];
    selectedClipIds: string[];
    focusedTrackId: string | null;
    editMode: ViewState['editMode'];
    timeDisplay: ViewState['timeDisplay'];
    showWaveforms: boolean;
    showAutomation: boolean;
  };
  mixer: MixerState;
  project: {
    sampleRate: number;
    bitDepth: number;
    duration: number;
  };
}

export function useProjectSync(projectId: string | null) {
  const queryClient = useQueryClient();
  const store = useStudioStore();
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);
  const stateVersionRef = useRef<number>(0);

  const getStoreState = useCallback(() => useStudioStore.getState(), []);

  const invalidateProjectQueries = useCallback(() => {
    PROJECT_QUERY_KEYS.forEach(key => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: [`/api/studio/projects/${projectId}`] });
    }
  }, [queryClient, projectId]);

  const serializeTrack = (track: Track): SerializedTrack => {
    return {
      id: track.id,
      name: track.name,
      type: track.type,
      color: track.color,
      volume: track.volume,
      pan: track.pan,
      muted: track.muted,
      solo: track.solo,
      armed: track.armed,
      frozen: track.frozen,
      height: track.height,
      collapsed: track.collapsed,
      inputSource: track.inputSource,
      outputTarget: track.outputTarget,
      plugins: track.plugins,
      sends: track.sends,
      audioClips: track.audioClips.map(clip => ({
        id: clip.id,
        trackId: clip.trackId,
        name: clip.name,
        startTime: clip.startTime,
        duration: clip.duration,
        offset: clip.offset,
        gain: clip.gain,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        color: clip.color,
        sourceUrl: clip.sourceUrl,
        muted: clip.muted,
        locked: clip.locked,
      })),
      midiClips: track.midiClips,
      automationLanes: track.automationLanes,
    };
  };

  const serializeFullState = useCallback((): SerializedDAWState => {
    const state = getStoreState();
    stateVersionRef.current += 1;
    
    return {
      version: DAW_STATE_VERSION,
      savedAt: new Date().toISOString(),
      tracks: state.tracks.map(serializeTrack),
      masterTrack: serializeTrack(state.masterTrack),
      transport: {
        position: state.transport.position,
        loopStart: state.transport.loopStart,
        loopEnd: state.transport.loopEnd,
        tempo: state.transport.tempo,
        timeSignatureNumerator: state.transport.timeSignatureNumerator,
        timeSignatureDenominator: state.transport.timeSignatureDenominator,
        isLooping: state.transport.isLooping,
        metronomeEnabled: state.transport.metronomeEnabled,
        countInEnabled: state.transport.countInEnabled,
        countInBars: state.transport.countInBars,
        prerollEnabled: state.transport.prerollEnabled,
        prerollBars: state.transport.prerollBars,
      },
      view: {
        zoom: state.view.zoom,
        scrollX: state.view.scrollX,
        scrollY: state.view.scrollY,
        snapToGrid: state.view.snapToGrid,
        gridSize: state.view.gridSize,
        showMixer: state.view.showMixer,
        showPluginBrowser: state.view.showPluginBrowser,
        showPianoRoll: state.view.showPianoRoll,
        selectedTrackIds: state.view.selectedTrackIds,
        selectedClipIds: state.view.selectedClipIds,
        focusedTrackId: state.view.focusedTrackId,
        editMode: state.view.editMode,
        timeDisplay: state.view.timeDisplay,
        showWaveforms: state.view.showWaveforms,
        showAutomation: state.view.showAutomation,
      },
      mixer: { ...state.mixer },
      project: {
        sampleRate: state.project.sampleRate,
        bitDepth: state.project.bitDepth,
        duration: state.project.duration,
      },
    };
  }, [getStoreState]);

  const deserializeAndRestoreState = useCallback((dawState: SerializedDAWState) => {
    
    if (dawState.transport) {
      store.setTransport({
        position: dawState.transport.position ?? 0,
        loopStart: dawState.transport.loopStart ?? 0,
        loopEnd: dawState.transport.loopEnd ?? 16,
        tempo: dawState.transport.tempo ?? 120,
        timeSignatureNumerator: dawState.transport.timeSignatureNumerator ?? 4,
        timeSignatureDenominator: dawState.transport.timeSignatureDenominator ?? 4,
        isLooping: dawState.transport.isLooping ?? false,
        metronomeEnabled: dawState.transport.metronomeEnabled ?? false,
        countInEnabled: dawState.transport.countInEnabled ?? false,
        countInBars: dawState.transport.countInBars ?? 1,
        prerollEnabled: dawState.transport.prerollEnabled ?? false,
        prerollBars: dawState.transport.prerollBars ?? 1,
      });
    }

    if (dawState.view) {
      store.setView({
        zoom: dawState.view.zoom ?? 1,
        scrollX: dawState.view.scrollX ?? 0,
        scrollY: dawState.view.scrollY ?? 0,
        snapToGrid: dawState.view.snapToGrid ?? true,
        gridSize: dawState.view.gridSize ?? 0.25,
        showMixer: dawState.view.showMixer ?? true,
        showPluginBrowser: dawState.view.showPluginBrowser ?? false,
        showPianoRoll: dawState.view.showPianoRoll ?? false,
        selectedTrackIds: dawState.view.selectedTrackIds ?? [],
        selectedClipIds: dawState.view.selectedClipIds ?? [],
        focusedTrackId: dawState.view.focusedTrackId ?? null,
        editMode: dawState.view.editMode ?? 'select',
        timeDisplay: dawState.view.timeDisplay ?? 'bars',
        showWaveforms: dawState.view.showWaveforms ?? true,
        showAutomation: dawState.view.showAutomation ?? false,
      });
    }

    if (dawState.mixer) {
      store.setMixer({
        visible: dawState.mixer.visible ?? true,
        channelWidth: dawState.mixer.channelWidth ?? 80,
        showSends: dawState.mixer.showSends ?? true,
        showInserts: dawState.mixer.showInserts ?? true,
        showEQ: dawState.mixer.showEQ ?? false,
        soloMode: dawState.mixer.soloMode ?? 'additive',
        prefaderMetering: dawState.mixer.prefaderMetering ?? false,
      });
    }

    if (dawState.project) {
      store.setProject({
        sampleRate: dawState.project.sampleRate ?? 48000,
        bitDepth: dawState.project.bitDepth ?? 32,
        duration: dawState.project.duration ?? 300,
      });
    }

    if (dawState.tracks) {
      const restoredTracks: Track[] = dawState.tracks.map((serializedTrack, index) => ({
        id: serializedTrack.id,
        name: serializedTrack.name,
        type: serializedTrack.type,
        color: serializedTrack.color || '#3b82f6',
        volume: serializedTrack.volume ?? 0,
        pan: serializedTrack.pan ?? 0,
        muted: serializedTrack.muted ?? false,
        solo: serializedTrack.solo ?? false,
        armed: serializedTrack.armed ?? false,
        frozen: serializedTrack.frozen ?? false,
        height: serializedTrack.height ?? 80,
        collapsed: serializedTrack.collapsed ?? false,
        inputSource: serializedTrack.inputSource ?? null,
        outputTarget: serializedTrack.outputTarget ?? 'master',
        meterLevel: { left: 0, right: 0 },
        plugins: (serializedTrack.plugins || []).map(p => ({
          id: p.id,
          pluginId: p.pluginId,
          pluginSlug: p.pluginSlug,
          name: p.name,
          bypassed: p.bypassed ?? false,
          parameters: p.parameters || {},
          presetName: p.presetName,
        })),
        audioClips: (serializedTrack.audioClips || []).map(c => ({
          id: c.id,
          trackId: serializedTrack.id,
          name: c.name,
          startTime: c.startTime,
          duration: c.duration,
          offset: c.offset ?? 0,
          gain: c.gain ?? 0,
          fadeIn: c.fadeIn ?? 0,
          fadeOut: c.fadeOut ?? 0,
          color: c.color,
          sourceUrl: c.sourceUrl,
          muted: c.muted ?? false,
          locked: c.locked ?? false,
        })),
        midiClips: (serializedTrack.midiClips || []).map(c => ({
          id: c.id,
          trackId: serializedTrack.id,
          name: c.name,
          startTime: c.startTime,
          duration: c.duration,
          notes: c.notes || [],
          color: c.color,
          muted: c.muted ?? false,
          locked: c.locked ?? false,
        })),
        sends: (serializedTrack.sends || []).map(s => ({
          id: s.id,
          targetTrackId: s.targetTrackId,
          gain: s.gain ?? 0,
          preFader: s.preFader ?? false,
          muted: s.muted ?? false,
        })),
        automationLanes: (serializedTrack.automationLanes || []).map(l => ({
          id: l.id,
          parameterId: l.parameterId,
          parameterName: l.parameterName,
          visible: l.visible ?? true,
          points: l.points || [],
        })),
      }));
      
      store.setTracksDirectly(restoredTracks);
    }

    if (dawState.masterTrack) {
      const mt = dawState.masterTrack;
      const restoredMaster: Track = {
        id: mt.id || 'master',
        name: mt.name || 'Master',
        type: 'master',
        color: mt.color || '#64748b',
        volume: mt.volume ?? 0,
        pan: mt.pan ?? 0,
        muted: mt.muted ?? false,
        solo: mt.solo ?? false,
        armed: false,
        frozen: false,
        height: mt.height ?? 80,
        collapsed: mt.collapsed ?? false,
        outputTarget: mt.outputTarget || 'output',
        meterLevel: { left: -60, right: -60 },
        plugins: (mt.plugins || []).map(p => ({
          id: p.id,
          pluginId: p.pluginId,
          pluginSlug: p.pluginSlug,
          name: p.name,
          bypassed: p.bypassed ?? false,
          parameters: p.parameters || {},
          presetName: p.presetName,
        })),
        audioClips: [],
        midiClips: [],
        sends: (mt.sends || []).map(s => ({
          id: s.id,
          targetTrackId: s.targetTrackId,
          gain: s.gain ?? 0,
          preFader: s.preFader ?? false,
          muted: s.muted ?? false,
        })),
        automationLanes: (mt.automationLanes || []).map(l => ({
          id: l.id,
          parameterId: l.parameterId,
          parameterName: l.parameterName,
          visible: l.visible ?? true,
          points: l.points || [],
        })),
      };
      
      store.setMasterTrackDirectly(restoredMaster);
    }
  }, [store]);

  const saveFullState = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const dawState = serializeFullState();
      const state = getStoreState();
      
      const response = await fetch(`/api/studio/projects/${projectId}/save-daw-state`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dawState: JSON.stringify(dawState),
          title: state.project.name,
          tempo: dawState.transport.tempo,
          timeSignature: `${dawState.transport.timeSignatureNumerator}/${dawState.transport.timeSignatureDenominator}`,
          sampleRate: dawState.project.sampleRate,
          bitDepth: dawState.project.bitDepth,
          version: stateVersionRef.current,
        }),
      });

      if (response.ok) {
        getStoreState().markSaved();
        logger.info(`[ProjectSync] Full DAW state saved for project ${projectId}`);
        invalidateProjectQueries();
        return true;
      } else {
        logger.error('[ProjectSync] Failed to save full state:', await response.text());
        return false;
      }
    } catch (error) {
      logger.error('[ProjectSync] Failed to save full state:', error);
      return false;
    }
  }, [projectId, getStoreState, serializeFullState, invalidateProjectQueries]);

  const loadFullState = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;

    try {
      const response = await fetch(`/api/studio/projects/${projectId}/daw-state`, { credentials: 'include' });
      
      if (!response.ok) {
        logger.error('[ProjectSync] Failed to load DAW state');
        return false;
      }

      const data = await response.json();
      
      if (data.dawState) {
        try {
          const dawState: SerializedDAWState = typeof data.dawState === 'string' 
            ? JSON.parse(data.dawState) 
            : data.dawState;
          
          if (dawState.version && dawState.tracks) {
            store.setProject({
              id: projectId,
              name: data.project?.title || 'Untitled',
            });
            
            deserializeAndRestoreState(dawState);
            
            if (data.dawVersion) {
              stateVersionRef.current = data.dawVersion;
            }
            
            store.markSaved();
            logger.info(`[ProjectSync] Full DAW state loaded for project ${projectId}`);
            return true;
          }
        } catch (parseError) {
          logger.error('[ProjectSync] Failed to parse DAW state:', parseError);
        }
      }

      return false;
    } catch (error) {
      logger.error('[ProjectSync] Failed to load full state:', error);
      return false;
    }
  }, [projectId, store, deserializeAndRestoreState]);

  const syncToBackend = useCallback(async () => {
    if (!projectId) return;

    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_DEBOUNCE_MS) return;
    lastSyncRef.current = now;

    await saveFullState();
  }, [projectId, saveFullState]);

  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(syncToBackend, SYNC_DEBOUNCE_MS);
  }, [syncToBackend]);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = useStudioStore.subscribe(
      (state) => ({
        tracks: state.tracks,
        tempo: state.transport.tempo,
        isLooping: state.transport.isLooping,
        timeSignature: state.transport.timeSignature,
        view: state.view,
        mixer: state.mixer,
        masterTrack: state.masterTrack,
      }),
      () => {
        debouncedSync();
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [projectId, debouncedSync]);

  const forceSave = useCallback(async () => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    await saveFullState();
  }, [saveFullState]);

  const refreshFromBackend = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await fetch(`/api/studio/projects/${projectId}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.project) {
          store.setProject({
            id: data.project.id,
            name: data.project.title || 'Untitled',
          });
        }
      }
    } catch (error) {
      logger.error('[ProjectSync] Failed to refresh:', error);
    }
  }, [projectId, store]);

  const loadProjectData = useCallback(async () => {
    if (!projectId) return false;

    store.resetForNewProject();

    const fullStateLoaded = await loadFullState();
    if (fullStateLoaded) {
      return true;
    }

    logger.info('[ProjectSync] No DAW state found, falling back to database tracks');
    
    try {
      const [projectRes, tracksRes] = await Promise.all([
        fetch(`/api/studio/projects/${projectId}`, { credentials: 'include' }),
        fetch(`/api/studio/projects/${projectId}/tracks`, { credentials: 'include' }),
      ]);

      if (!projectRes.ok || !tracksRes.ok) {
        logger.error('[ProjectSync] Failed to load project data');
        return false;
      }

      const projectData = await projectRes.json();
      const tracksData = await tracksRes.json();

      if (projectData) {
        store.setProject({
          id: projectId,
          name: projectData.title || projectData.project?.title || 'Untitled',
        });

        if (projectData.bpm || projectData.project?.bpm) {
          store.setTransport({
            tempo: projectData.bpm || projectData.project?.bpm || 120,
          });
        }
      }

      const backendTracks: BackendTrack[] = tracksData.tracks || tracksData || [];
      const backendClips: BackendClip[] = tracksData.clips || [];

      const currentState = getStoreState();
      const existingTrackIds = new Set(currentState.tracks.map(t => t.id));

      const normalizeAudioUrl = (url: string): string => {
        if (!url) return url;
        if (url.startsWith('/api/')) return url;
        if (url.startsWith('http')) return url;
        const cleanPath = url.replace(/^\/+/, '');
        return `/api/marketplace/audio/${cleanPath}`;
      };

      for (const track of backendTracks) {
        if (!existingTrackIds.has(track.id)) {
          const trackType = (track.trackType || track.type || 'audio') as TrackType;
          const newTrackId = store.addTrack(trackType, track.name);
          
          const trackClips = backendClips.filter(c => c.trackId === track.id);
          for (const clip of trackClips) {
            const normalizedPath = normalizeAudioUrl(clip.filePath);
            const clipDuration = clip.duration > 0 ? clip.duration : 0;
            store.addAudioClip(newTrackId, {
              trackId: newTrackId,
              name: clip.name || 'Audio Clip',
              sourceUrl: normalizedPath,
              startTime: clip.startTime || 0,
              duration: clipDuration,
              offset: clip.offset || 0,
              gain: clip.gain || 1,
              fadeIn: clip.fadeIn || 0,
              fadeOut: clip.fadeOut || 0,
              color: track.color || '#3b82f6',
              muted: false,
              locked: false,
            });
          }

          if (track.volume !== undefined) store.setTrackVolume(newTrackId, track.volume);
          if (track.pan !== undefined) store.setTrackPan(newTrackId, track.pan);
          if (track.muted || track.isMuted) store.toggleTrackMute(newTrackId);
          if (track.solo || track.isSolo) store.toggleTrackSolo(newTrackId);
        }
      }

      setTimeout(async () => {
        const currentTracks = getStoreState().tracks;
        for (const track of currentTracks) {
          for (const clip of track.audioClips) {
            // Detect duration from the audio file when:
            // - duration is missing/zero, OR
            // - duration is suspiciously small (< 2 seconds) for a clip with a source URL
            //   which would indicate a tempo-mismatch from generation at the wrong BPM
            const needsDurationDetect = clip.sourceUrl && (
              clip.duration <= 0 ||
              clip.duration < 2
            );
            if (needsDurationDetect) {
              try {
                const response = await fetch(clip.sourceUrl);
                const arrayBuffer = await response.arrayBuffer();
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                if (audioBuffer.duration > 0 && Math.abs(audioBuffer.duration - clip.duration) > 0.5) {
                  store.updateAudioClip(track.id, clip.id, { duration: audioBuffer.duration });
                  logger.info(`[ProjectSync] Corrected clip "${clip.name}" duration: ${clip.duration.toFixed(2)}s → ${audioBuffer.duration.toFixed(2)}s`);
                }
                audioContext.close();
              } catch (e) {
                logger.error('[ProjectSync] Failed to detect clip duration:', e);
              }
            }
          }
        }
      }, 100);

      store.markSaved();
      logger.info(`[ProjectSync] Loaded project ${projectId} with ${backendTracks.length} tracks from database`);
      return true;
    } catch (error) {
      logger.error('[ProjectSync] Failed to load project data:', error);
      return false;
    }
  }, [projectId, store, loadFullState, getStoreState]);

  return {
    forceSave,
    saveFullState,
    loadFullState,
    refreshFromBackend,
    loadProjectData,
    invalidateProjectQueries,
    stateVersion: stateVersionRef.current,
  };
}
