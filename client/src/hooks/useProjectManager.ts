import { useState, useEffect, useCallback } from 'react';
import {
  projectManager,
  type ProjectSnapshot,
  type AutosaveEntry,
  type MediaPoolItem,
  type ProjectEvent,
} from '@/lib/studio/project/ProjectManager';
import { commandManager } from '@/lib/studio/commands';

export function useProjectManager() {
  const [isDirty, setIsDirty] = useState(projectManager.isProjectDirty);
  const [autosaves, setAutosaves] = useState<AutosaveEntry[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaPoolItem[]>([]);
  const [recoveryAvailable, setRecoveryAvailable] = useState<{ projectId: string; timestamp: number } | null>(null);
  
  useEffect(() => {
    const recovery = projectManager.checkForRecovery();
    setRecoveryAvailable(recovery);
    
    const unsubscribe = projectManager.subscribe((event: ProjectEvent) => {
      switch (event.type) {
        case 'dirty_changed':
          setIsDirty(event.isDirty);
          break;
        case 'autosave_created':
        case 'autosave_restored':
          if ('entry' in event) {
            setAutosaves(projectManager.getAutosaves(event.entry.projectId));
          }
          break;
        case 'media_added':
        case 'media_removed':
        case 'media_cleaned':
          setMediaItems(projectManager.getMediaPoolItems());
          break;
        case 'crash_recovered':
        case 'project_loaded':
          setRecoveryAvailable(null);
          break;
      }
    });
    
    const commandUnsub = commandManager.subscribe(() => {
      projectManager.markDirty();
    });
    
    return () => {
      unsubscribe();
      commandUnsub();
    };
  }, []);
  
  const saveProject = useCallback(async (projectId?: string) => {
    return projectManager.saveProject(projectId);
  }, []);
  
  const loadProject = useCallback(async (projectId: string) => {
    return projectManager.loadProject(projectId);
  }, []);
  
  const createAutosave = useCallback((reason?: AutosaveEntry['reason']) => {
    return projectManager.createAutosave(reason);
  }, []);
  
  const restoreAutosave = useCallback(async (entryId: string) => {
    return projectManager.restoreAutosave(entryId);
  }, []);
  
  const recoverCrashedProject = useCallback(async (projectId: string) => {
    const success = await projectManager.recoverCrashedProject(projectId);
    if (success) {
      setRecoveryAvailable(null);
    }
    return success;
  }, []);
  
  const dismissRecovery = useCallback((projectId: string) => {
    projectManager.clearRecoveryData(projectId);
    setRecoveryAvailable(null);
  }, []);
  
  const startAutosave = useCallback((intervalMs?: number) => {
    projectManager.startAutosave(intervalMs);
  }, []);
  
  const stopAutosave = useCallback(() => {
    projectManager.stopAutosave();
  }, []);
  
  const addToMediaPool = useCallback((item: Omit<MediaPoolItem, 'id' | 'addedAt' | 'usageCount'>) => {
    return projectManager.addToMediaPool(item);
  }, []);
  
  const removeFromMediaPool = useCallback((itemId: string) => {
    return projectManager.removeFromMediaPool(itemId);
  }, []);
  
  const getMediaItems = useCallback((type?: MediaPoolItem['type']) => {
    return projectManager.getMediaPoolItems(type);
  }, []);
  
  const cleanUnusedMedia = useCallback(() => {
    return projectManager.cleanUnusedMedia();
  }, []);
  
  const exportProject = useCallback(() => {
    return projectManager.exportProject();
  }, []);
  
  const importProject = useCallback((data: string) => {
    return projectManager.importProject(data);
  }, []);
  
  const getAutosaves = useCallback((projectId: string) => {
    const entries = projectManager.getAutosaves(projectId);
    setAutosaves(entries);
    return entries;
  }, []);
  
  return {
    isDirty,
    autosaves,
    mediaItems,
    recoveryAvailable,
    
    saveProject,
    loadProject,
    createAutosave,
    restoreAutosave,
    recoverCrashedProject,
    dismissRecovery,
    startAutosave,
    stopAutosave,
    getAutosaves,
    
    addToMediaPool,
    removeFromMediaPool,
    getMediaItems,
    cleanUnusedMedia,
    
    exportProject,
    importProject,
  };
}
