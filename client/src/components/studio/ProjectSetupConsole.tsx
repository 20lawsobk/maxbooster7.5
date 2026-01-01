import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Settings2,
  Music,
  Gauge,
  Volume2,
  Mic,
  Headphones,
  Layers,
  Save,
  RotateCcw,
  Check,
  ListMusic,
  Clock,
  FileAudio,
} from 'lucide-react';

interface ProjectSetupConsoleProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    title: string;
    bpm?: number;
    key?: string;
    timeSignature?: string;
    sampleRate?: number;
    bitDepth?: number;
  } | null;
  onSave: (settings: ProjectSettings) => void;
}

interface ProjectSettings {
  title: string;
  bpm: number;
  key: string;
  timeSignature: string;
  sampleRate: number;
  bitDepth: number;
  inputDevice: string;
  outputDevice: string;
  bufferSize: number;
  metronomeEnabled: boolean;
  countInBars: number;
  recordingMode: 'punch' | 'loop' | 'normal';
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
}

const KEYS = [
  'C Major', 'C Minor', 'C# Major', 'C# Minor',
  'D Major', 'D Minor', 'D# Major', 'D# Minor',
  'E Major', 'E Minor',
  'F Major', 'F Minor', 'F# Major', 'F# Minor',
  'G Major', 'G Minor', 'G# Major', 'G# Minor',
  'A Major', 'A Minor', 'A# Major', 'A# Minor',
  'B Major', 'B Minor',
];

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '5/4', '7/8', '12/8'];
const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000];
const BIT_DEPTHS = [16, 24, 32];
const BUFFER_SIZES = [32, 64, 128, 256, 512, 1024, 2048];

const TRACK_TEMPLATES = [
  { id: 'vocal', name: 'Vocal Recording', icon: Mic, tracks: ['Lead Vocal', 'Harmony 1', 'Harmony 2', 'Ad-libs'] },
  { id: 'band', name: 'Band Recording', icon: Music, tracks: ['Drums', 'Bass', 'Guitar', 'Keys', 'Vocals'] },
  { id: 'podcast', name: 'Podcast', icon: Headphones, tracks: ['Host', 'Guest 1', 'Guest 2', 'Music/SFX'] },
  { id: 'beats', name: 'Beat Making', icon: ListMusic, tracks: ['Kick', 'Snare', 'Hi-Hats', 'Bass', 'Melody', 'FX'] },
  { id: 'mixing', name: 'Mixing Session', icon: Layers, tracks: ['Drums Bus', 'Bass Bus', 'Synths Bus', 'Vocals Bus', 'FX Bus'] },
];

export function ProjectSetupConsole({ isOpen, onClose, project, onSave }: ProjectSetupConsoleProps) {
  const [settings, setSettings] = useState<ProjectSettings>({
    title: project?.title || 'Untitled Project',
    bpm: project?.bpm || 120,
    key: project?.key || 'C Major',
    timeSignature: project?.timeSignature || '4/4',
    sampleRate: project?.sampleRate || 48000,
    bitDepth: project?.bitDepth || 24,
    inputDevice: 'Default Input',
    outputDevice: 'Default Output',
    bufferSize: 256,
    metronomeEnabled: true,
    countInBars: 1,
    recordingMode: 'normal',
    autoSaveEnabled: true,
    autoSaveInterval: 5,
  });

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && project) {
      setSettings(prev => ({
        ...prev,
        title: project.title || 'Untitled Project',
        bpm: project.bpm || 120,
        key: project.key || 'C Major',
        timeSignature: project.timeSignature || '4/4',
        sampleRate: project.sampleRate || 48000,
        bitDepth: project.bitDepth || 24,
      }));
    }
  }, [isOpen, project?.id, project?.title, project?.bpm, project?.key, project?.timeSignature, project?.sampleRate, project?.bitDepth]);

  const updateSetting = useCallback(<K extends keyof ProjectSettings>(
    key: K,
    value: ProjectSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(() => {
    onSave(settings);
    onClose();
  }, [settings, onSave, onClose]);

  const handleReset = useCallback(() => {
    setSettings({
      title: project?.title || 'Untitled Project',
      bpm: project?.bpm || 120,
      key: project?.key || 'C Major',
      timeSignature: project?.timeSignature || '4/4',
      sampleRate: project?.sampleRate || 48000,
      bitDepth: project?.bitDepth || 24,
      inputDevice: 'Default Input',
      outputDevice: 'Default Output',
      bufferSize: 256,
      metronomeEnabled: true,
      countInBars: 1,
      recordingMode: 'normal',
      autoSaveEnabled: true,
      autoSaveInterval: 5,
    });
  }, [project]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Settings2 className="h-5 w-5 text-purple-400" />
            Project Setup Console
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-zinc-800">
            <TabsTrigger value="general" className="data-[state=active]:bg-purple-600">
              <Music className="h-4 w-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="audio" className="data-[state=active]:bg-purple-600">
              <Volume2 className="h-4 w-4 mr-2" />
              Audio I/O
            </TabsTrigger>
            <TabsTrigger value="recording" className="data-[state=active]:bg-purple-600">
              <Mic className="h-4 w-4 mr-2" />
              Recording
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-purple-600">
              <Layers className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] mt-4">
            <TabsContent value="general" className="space-y-6 px-1">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Project Title</Label>
                    <Input
                      value={settings.title}
                      onChange={(e) => updateSetting('title', e.target.value)}
                      className="bg-zinc-800 border-zinc-600 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300 flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      Tempo (BPM)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={settings.bpm}
                        onChange={(e) => updateSetting('bpm', parseInt(e.target.value) || 120)}
                        min={20}
                        max={300}
                        className="bg-zinc-800 border-zinc-600 text-white w-24"
                      />
                      <div className="flex gap-1">
                        {[60, 90, 120, 140, 170].map((bpm) => (
                          <Button
                            key={bpm}
                            variant="outline"
                            size="sm"
                            className={`text-xs ${settings.bpm === bpm ? 'bg-purple-600 border-purple-500' : 'bg-zinc-800 border-zinc-600'}`}
                            onClick={() => updateSetting('bpm', bpm)}
                          >
                            {bpm}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Key</Label>
                    <Select value={settings.key} onValueChange={(v) => updateSetting('key', v)}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        {KEYS.map((key) => (
                          <SelectItem key={key} value={key} className="text-white hover:bg-zinc-700">
                            {key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Time Signature
                    </Label>
                    <Select value={settings.timeSignature} onValueChange={(v) => updateSetting('timeSignature', v)}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        {TIME_SIGNATURES.map((ts) => (
                          <SelectItem key={ts} value={ts} className="text-white hover:bg-zinc-700">
                            {ts}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300 flex items-center gap-2">
                      <FileAudio className="h-4 w-4" />
                      Sample Rate
                    </Label>
                    <Select 
                      value={settings.sampleRate.toString()} 
                      onValueChange={(v) => updateSetting('sampleRate', parseInt(v))}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        {SAMPLE_RATES.map((rate) => (
                          <SelectItem key={rate} value={rate.toString()} className="text-white hover:bg-zinc-700">
                            {(rate / 1000).toFixed(1)} kHz
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Bit Depth</Label>
                    <Select 
                      value={settings.bitDepth.toString()} 
                      onValueChange={(v) => updateSetting('bitDepth', parseInt(v))}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        {BIT_DEPTHS.map((depth) => (
                          <SelectItem key={depth} value={depth.toString()} className="text-white hover:bg-zinc-700">
                            {depth}-bit
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator className="bg-zinc-700" />

                  <div className="flex items-center justify-between">
                    <Label className="text-zinc-300">Auto-save</Label>
                    <Switch
                      checked={settings.autoSaveEnabled}
                      onCheckedChange={(v) => updateSetting('autoSaveEnabled', v)}
                    />
                  </div>

                  {settings.autoSaveEnabled && (
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm">Save every</Label>
                      <Select 
                        value={settings.autoSaveInterval.toString()} 
                        onValueChange={(v) => updateSetting('autoSaveInterval', parseInt(v))}
                      >
                        <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-800 border-zinc-600">
                          {[1, 2, 5, 10, 15, 30].map((mins) => (
                            <SelectItem key={mins} value={mins.toString()} className="text-white hover:bg-zinc-700">
                              {mins} minute{mins > 1 ? 's' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="audio" className="space-y-6 px-1">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300 flex items-center gap-2">
                      <Mic className="h-4 w-4" />
                      Input Device
                    </Label>
                    <Select value={settings.inputDevice} onValueChange={(v) => updateSetting('inputDevice', v)}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        <SelectItem value="Default Input" className="text-white hover:bg-zinc-700">
                          Default Input
                        </SelectItem>
                        <SelectItem value="Built-in Microphone" className="text-white hover:bg-zinc-700">
                          Built-in Microphone
                        </SelectItem>
                        <SelectItem value="USB Audio Interface" className="text-white hover:bg-zinc-700">
                          USB Audio Interface
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300 flex items-center gap-2">
                      <Headphones className="h-4 w-4" />
                      Output Device
                    </Label>
                    <Select value={settings.outputDevice} onValueChange={(v) => updateSetting('outputDevice', v)}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        <SelectItem value="Default Output" className="text-white hover:bg-zinc-700">
                          Default Output
                        </SelectItem>
                        <SelectItem value="Built-in Speakers" className="text-white hover:bg-zinc-700">
                          Built-in Speakers
                        </SelectItem>
                        <SelectItem value="USB Audio Interface" className="text-white hover:bg-zinc-700">
                          USB Audio Interface
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Buffer Size</Label>
                    <Select 
                      value={settings.bufferSize.toString()} 
                      onValueChange={(v) => updateSetting('bufferSize', parseInt(v))}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        {BUFFER_SIZES.map((size) => (
                          <SelectItem key={size} value={size.toString()} className="text-white hover:bg-zinc-700">
                            {size} samples ({((size / settings.sampleRate) * 1000).toFixed(1)}ms)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-zinc-500">
                      Lower = less latency, higher CPU. Higher = more latency, stable playback.
                    </p>
                  </div>

                  <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                    <h4 className="text-sm font-medium text-zinc-300 mb-2">Latency Info</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="text-zinc-400">Input Latency:</div>
                      <div className="text-white">{((settings.bufferSize / settings.sampleRate) * 1000).toFixed(1)}ms</div>
                      <div className="text-zinc-400">Output Latency:</div>
                      <div className="text-white">{((settings.bufferSize / settings.sampleRate) * 1000).toFixed(1)}ms</div>
                      <div className="text-zinc-400">Round-trip:</div>
                      <div className="text-white">{((settings.bufferSize / settings.sampleRate) * 2000).toFixed(1)}ms</div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="recording" className="space-y-6 px-1">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-zinc-300">Metronome</Label>
                    <Switch
                      checked={settings.metronomeEnabled}
                      onCheckedChange={(v) => updateSetting('metronomeEnabled', v)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Count-in Bars</Label>
                    <Select 
                      value={settings.countInBars.toString()} 
                      onValueChange={(v) => updateSetting('countInBars', parseInt(v))}
                    >
                      <SelectTrigger className="bg-zinc-800 border-zinc-600 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-600">
                        {[0, 1, 2, 4].map((bars) => (
                          <SelectItem key={bars} value={bars.toString()} className="text-white hover:bg-zinc-700">
                            {bars === 0 ? 'None' : `${bars} bar${bars > 1 ? 's' : ''}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Recording Mode</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['normal', 'punch', 'loop'] as const).map((mode) => (
                        <Button
                          key={mode}
                          variant="outline"
                          className={`capitalize ${settings.recordingMode === mode ? 'bg-purple-600 border-purple-500 text-white' : 'bg-zinc-800 border-zinc-600 text-zinc-300'}`}
                          onClick={() => updateSetting('recordingMode', mode)}
                        >
                          {mode}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                      {settings.recordingMode === 'normal' && 'Record continuously from playhead position'}
                      {settings.recordingMode === 'punch' && 'Auto punch in/out at defined locators'}
                      {settings.recordingMode === 'loop' && 'Record multiple takes in a loop region'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                    <h4 className="text-sm font-medium text-zinc-300 mb-3">Recording Checklist</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-zinc-300">Audio device connected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-zinc-300">Sample rate matched</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-zinc-300">Buffer size optimized</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-zinc-300">Metronome configured</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="templates" className="space-y-6 px-1">
              <div className="space-y-4">
                <p className="text-zinc-400 text-sm">
                  Select a track template to quickly set up your session with pre-configured tracks.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  {TRACK_TEMPLATES.map((template) => (
                    <div
                      key={template.id}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedTemplate === template.id
                          ? 'bg-purple-600/20 border-purple-500'
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500'
                      }`}
                      onClick={() => setSelectedTemplate(
                        selectedTemplate === template.id ? null : template.id
                      )}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg ${selectedTemplate === template.id ? 'bg-purple-600' : 'bg-zinc-700'}`}>
                          <template.icon className="h-5 w-5 text-white" />
                        </div>
                        <h4 className="text-white font-medium">{template.name}</h4>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {template.tracks.map((track, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-zinc-800 border-zinc-600 text-zinc-300">
                            {track}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {selectedTemplate && (
                  <div className="p-4 rounded-lg bg-green-900/20 border border-green-700">
                    <p className="text-green-400 text-sm flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      Template "{TRACK_TEMPLATES.find(t => t.id === selectedTemplate)?.name}" will be applied when you save
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <Separator className="bg-zinc-700" />

        <div className="flex justify-between">
          <Button variant="outline" onClick={handleReset} className="bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700">
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Save className="h-4 w-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
