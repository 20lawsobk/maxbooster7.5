import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAudioDevices } from '@/hooks/useAudioDevices';
import { useMIDIDevices } from '@/hooks/useMIDIDevices';
import { Mic, Speaker, Music, RefreshCw, AlertCircle } from 'lucide-react';
import { useState } from 'react';

interface DeviceSelectorProps {
  onAudioInputChange?: (deviceId: string) => void;
  onAudioOutputChange?: (deviceId: string) => void;
  onMIDIInputChange?: (deviceId: string) => void;
  compact?: boolean;
}

/**
 * TODO: Add function documentation
 */
export function DeviceSelector({
  onAudioInputChange,
  onAudioOutputChange,
  onMIDIInputChange,
  compact = false,
}: DeviceSelectorProps) {
  const audioDevices = useAudioDevices();
  const midiDevices = useMIDIDevices();
  const [showDetails, setShowDetails] = useState(false);

  const handleAudioInputChange = (deviceId: string) => {
    audioDevices.selectInput(deviceId);
    onAudioInputChange?.(deviceId);
  };

  const handleAudioOutputChange = (deviceId: string) => {
    audioDevices.selectOutput(deviceId);
    onAudioOutputChange?.(deviceId);
  };

  const handleMIDIInputChange = (deviceId: string) => {
    midiDevices.selectInput(deviceId);
    onMIDIInputChange?.(deviceId);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {/* Audio Input */}
        <div className="flex items-center gap-1">
          <Mic className="h-3 w-3 text-gray-400" />
          <Select
            value={audioDevices.selectedInput || undefined}
            onValueChange={handleAudioInputChange}
          >
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue placeholder="Select input" />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.inputs.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId} className="text-xs">
                  {device.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* MIDI Input (if available) */}
        {midiDevices.isSupported && midiDevices.inputs.length > 0 && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <div className="flex items-center gap-1">
              <Music className="h-3 w-3 text-gray-400" />
              <Select
                value={midiDevices.selectedInput || undefined}
                onValueChange={handleMIDIInputChange}
              >
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue placeholder="Select MIDI" />
                </SelectTrigger>
                <SelectContent>
                  {midiDevices.inputs.map((device) => (
                    <SelectItem key={device.id} value={device.id} className="text-xs">
                      {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Audio & MIDI Devices</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              audioDevices.enumerateDevices();
              midiDevices.requestMIDIAccess();
            }}
            className="h-7 gap-1 text-xs"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Audio Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-green-500" />
          <Label className="text-xs font-medium">Audio Input</Label>
          {audioDevices.permissionGranted && (
            <Badge variant="outline" className="text-xs">
              {audioDevices.inputs.length} available
            </Badge>
          )}
        </div>

        {audioDevices.error ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <AlertCircle className="h-3 w-3" />
            {audioDevices.error}
          </div>
        ) : (
          <Select
            value={audioDevices.selectedInput || undefined}
            onValueChange={handleAudioInputChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select audio input device" />
            </SelectTrigger>
            <SelectContent>
              {audioDevices.inputs.map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  <div className="flex flex-col">
                    <span>{device.label}</span>
                    {showDetails && (
                      <span className="text-xs text-gray-500">
                        ID: {device.deviceId.slice(0, 20)}...
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Audio Output */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Speaker className="h-4 w-4 text-blue-500" />
          <Label className="text-xs font-medium">Audio Output</Label>
          {audioDevices.permissionGranted && (
            <Badge variant="outline" className="text-xs">
              {audioDevices.outputs.length} available
            </Badge>
          )}
        </div>

        <Select
          value={audioDevices.selectedOutput || undefined}
          onValueChange={handleAudioOutputChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select audio output device" />
          </SelectTrigger>
          <SelectContent>
            {audioDevices.outputs.map((device) => (
              <SelectItem key={device.deviceId} value={device.deviceId}>
                <div className="flex flex-col">
                  <span>{device.label}</span>
                  {showDetails && (
                    <span className="text-xs text-gray-500">
                      ID: {device.deviceId.slice(0, 20)}...
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* MIDI Devices */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-purple-500" />
          <Label className="text-xs font-medium">MIDI Input</Label>
          {!midiDevices.isSupported && (
            <Badge variant="secondary" className="text-xs">
              Not supported
            </Badge>
          )}
          {midiDevices.accessGranted && (
            <Badge variant="outline" className="text-xs">
              {midiDevices.inputs.length} available
            </Badge>
          )}
        </div>

        {!midiDevices.isSupported ? (
          <div className="text-xs text-gray-500 p-2 bg-gray-900/50 rounded border border-gray-800">
            Web MIDI API is not supported in this browser. Try Chrome, Edge, or Opera for MIDI
            controller support.
          </div>
        ) : midiDevices.error ? (
          <div className="flex items-center gap-2 text-xs text-red-500">
            <AlertCircle className="h-3 w-3" />
            {midiDevices.error}
          </div>
        ) : midiDevices.inputs.length === 0 ? (
          <div className="text-xs text-gray-500 p-2 bg-gray-900/50 rounded border border-gray-800">
            No MIDI devices connected. Connect a MIDI controller and click Refresh.
          </div>
        ) : (
          <Select
            value={midiDevices.selectedInput || undefined}
            onValueChange={handleMIDIInputChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select MIDI input device" />
            </SelectTrigger>
            <SelectContent>
              {midiDevices.inputs.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  <div className="flex flex-col">
                    <span>{device.name}</span>
                    <span className="text-xs text-gray-500">
                      {device.manufacturer} • {device.state}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Device Details Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDetails(!showDetails)}
        className="w-full text-xs"
      >
        {showDetails ? 'Hide' : 'Show'} Device Details
      </Button>

      {/* Status Info */}
      <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-800">
        <div className="flex justify-between">
          <span>Audio Permission:</span>
          <span className={audioDevices.permissionGranted ? 'text-green-500' : 'text-yellow-500'}>
            {audioDevices.permissionGranted ? 'Granted' : 'Pending'}
          </span>
        </div>
        {midiDevices.isSupported && (
          <div className="flex justify-between">
            <span>MIDI Access:</span>
            <span className={midiDevices.accessGranted ? 'text-green-500' : 'text-yellow-500'}>
              {midiDevices.accessGranted ? 'Granted' : 'Pending'}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
