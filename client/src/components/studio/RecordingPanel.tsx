import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  Circle, 
  Square, 
  AlertCircle,
  ChevronDown,
  Upload,
  Check
} from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useAudioDevices } from '@/hooks/useAudioDevices';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { logger } from '@/lib/logger';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface ArmedTrack {
  id: string;
  name: string;
}

interface RecordingPanelProps {
  projectId: string;
  armedTracks: ArmedTrack[];
  inputMonitoringMode: 'off' | 'on' | 'auto';
  latencyMs?: number;
  currentTransportTime?: number;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

export function RecordingPanel({
  projectId,
  armedTracks = [],
  inputMonitoringMode,
  latencyMs = 0,
  currentTransportTime = 0,
  onRecordingStart,
  onRecordingStop,
}: RecordingPanelProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { 
    isRecording, 
    duration,
    inputLevel,
    recordedBlob,
    isSupported,
    startMonitoring,
    stopMonitoring,
    startRecording,
    stopRecording,
    uploadRecording,
    clearRecording
  } = useAudioRecorder();

  const { 
    inputs, 
    selectedInput, 
    selectInput,
    error: deviceError
  } = useAudioDevices();

  const [isUploading, setIsUploading] = useState(false);
  const [recordStartTime, setRecordStartTime] = useState(0);
  const [hasRecording, setHasRecording] = useState(false);

  useEffect(() => {
    setHasRecording(!!recordedBlob);
  }, [recordedBlob]);

  useEffect(() => {
    if (armedTracks.length > 0 && inputMonitoringMode !== 'off') {
      startMonitoring(selectedInput || undefined).catch(err => {
        logger.warn('Failed to start monitoring:', err);
      });
    } else if (armedTracks.length === 0 || inputMonitoringMode === 'off') {
      stopMonitoring();
    }
  }, [armedTracks.length, inputMonitoringMode, selectedInput, startMonitoring, stopMonitoring]);

  const handleStartRecording = useCallback(async () => {
    if (armedTracks.length === 0) {
      toast({
        title: 'No Armed Tracks',
        description: 'Arm at least one track before recording',
        variant: 'destructive',
      });
      return;
    }

    try {
      setRecordStartTime(currentTransportTime);
      await startRecording(selectedInput || undefined);
      onRecordingStart?.();
    } catch (err) {
      logger.error('Failed to start recording:', err);
      toast({
        title: 'Recording Failed',
        description: err instanceof Error ? err.message : 'Could not start recording',
        variant: 'destructive',
      });
    }
  }, [armedTracks.length, currentTransportTime, selectedInput, startRecording, onRecordingStart, toast]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    onRecordingStop?.();
  }, [stopRecording, onRecordingStop]);

  const handleUploadRecording = useCallback(async () => {
    if (!recordedBlob || armedTracks.length === 0) return;

    setIsUploading(true);
    
    try {
      for (const track of armedTracks) {
        await uploadRecording(projectId, track.id, recordStartTime);
        
        queryClient.invalidateQueries({ 
          queryKey: ['/api/studio/tracks', track.id, 'audio-clips'] 
        });
      }

      queryClient.invalidateQueries({ 
        queryKey: ['/api/studio/projects', projectId, 'tracks'] 
      });

      toast({
        title: 'Recording Saved',
        description: `Added to ${armedTracks.length} track${armedTracks.length > 1 ? 's' : ''}`,
      });

      clearRecording();
    } catch (err) {
      logger.error('Failed to upload recording:', err);
      toast({
        title: 'Upload Failed',
        description: err instanceof Error ? err.message : 'Could not save recording',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [recordedBlob, armedTracks, projectId, recordStartTime, uploadRecording, queryClient, toast, clearRecording]);

  const handleDiscardRecording = useCallback(() => {
    clearRecording();
    toast({
      title: 'Recording Discarded',
      description: 'The recording has been deleted',
    });
  }, [clearRecording, toast]);

  if (armedTracks.length === 0 && !isRecording && !hasRecording) {
    return null;
  }

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-full px-4 py-1.5">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-xs text-destructive">Audio recording not supported</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 bg-background/80 backdrop-blur-sm border rounded-full px-4 py-1.5 shadow-sm">
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs font-medium">
              <Mic className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-[100px] truncate">
                {inputs.find(i => i.deviceId === selectedInput)?.label || 'Select Input'}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
              Input Devices
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {inputs.length === 0 ? (
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                {deviceError || 'No input devices found'}
              </DropdownMenuItem>
            ) : (
              inputs.map((input) => (
                <DropdownMenuItem 
                  key={input.deviceId}
                  onClick={() => selectInput(input.deviceId)}
                  className="text-xs"
                >
                  <div className="flex items-center gap-2">
                    {selectedInput === input.deviceId && <Check className="h-3 w-3" />}
                    <span className={selectedInput === input.deviceId ? 'font-medium' : ''}>
                      {input.label || 'Unknown Device'}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-col gap-0.5 w-16">
          <div className="flex justify-between items-center text-[8px] uppercase text-muted-foreground font-medium">
            <span>Input</span>
            <span className={inputLevel > 0.9 ? 'text-destructive font-bold' : ''}>
              {Math.round(inputLevel * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full transition-all duration-75 rounded-full"
              style={{ 
                width: `${Math.min(100, inputLevel * 100)}%`,
                backgroundColor: inputLevel > 0.9 
                  ? 'rgb(239, 68, 68)' 
                  : inputLevel > 0.7 
                    ? 'rgb(234, 179, 8)' 
                    : 'rgb(34, 197, 94)'
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-l pl-4">
        {isRecording ? (
          <>
            <Badge variant="destructive" className="animate-pulse h-6 px-2 flex gap-1.5 items-center">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="font-mono tabular-nums">
                {Math.floor(duration / 60).toString().padStart(2, '0')}:
                {Math.floor(duration % 60).toString().padStart(2, '0')}
              </span>
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0 rounded-full hover:bg-destructive/10"
              onClick={handleStopRecording}
            >
              <Square className="h-3.5 w-3.5 fill-current text-destructive" />
            </Button>
          </>
        ) : hasRecording ? (
          <>
            <Badge variant="secondary" className="h-6 px-2 text-xs">
              {Math.floor(duration)}s recorded
            </Badge>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 px-2 gap-1 text-xs hover:bg-primary/10"
              onClick={handleUploadRecording}
              disabled={isUploading}
            >
              {isUploading ? (
                <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              Save
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 w-7 p-0 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              onClick={handleDiscardRecording}
              disabled={isUploading}
            >
              <Square className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
            onClick={handleStartRecording}
            disabled={armedTracks.length === 0}
            title={armedTracks.length === 0 ? 'Arm a track to record' : 'Start recording'}
          >
            <Circle className="h-3.5 w-3.5 fill-current" />
          </Button>
        )}

        {armedTracks.length > 0 && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="font-medium">{armedTracks.length}</span>
            <span>armed</span>
          </div>
        )}

        {latencyMs > 0 && (
          <div className="flex flex-col leading-none text-[9px] text-muted-foreground ml-2">
            <span className="uppercase font-bold">Latency</span>
            <span className="font-mono">{latencyMs.toFixed(1)}ms</span>
          </div>
        )}
      </div>
    </div>
  );
}
