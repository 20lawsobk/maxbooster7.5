import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import {
  Volume2,
  FileAudio,
  Upload,
  Check,
  X,
  Clock,
  Play,
  Pause,
  AlertTriangle,
  Download,
  Music,
  Disc3,
  Globe,
  FileCheck,
  ListChecks,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';

interface MasteringDeliveryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    title: string;
    bpm?: number;
    key?: string;
  } | null;
  onExport?: (settings: ExportSettings) => void;
  onDistribute?: () => void;
}

interface ExportSettings {
  format: 'wav' | 'mp3' | 'flac' | 'aiff' | 'ogg';
  sampleRate: number;
  bitDepth: number;
  normalize: boolean;
  dither: boolean;
  loudness: number;
  filename: string;
}

interface ExportJob {
  id: string;
  filename: string;
  format: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  required: boolean;
  category: 'audio' | 'metadata' | 'legal';
}

const EXPORT_FORMATS = [
  { id: 'wav', name: 'WAV', description: 'Uncompressed, highest quality', extension: '.wav' },
  { id: 'flac', name: 'FLAC', description: 'Lossless compression', extension: '.flac' },
  { id: 'aiff', name: 'AIFF', description: 'Apple lossless format', extension: '.aiff' },
  { id: 'mp3', name: 'MP3', description: 'Compressed, compatible', extension: '.mp3' },
  { id: 'ogg', name: 'OGG Vorbis', description: 'Open source lossy', extension: '.ogg' },
];

const SAMPLE_RATES = [44100, 48000, 88200, 96000];
const BIT_DEPTHS = [16, 24, 32];
const LOUDNESS_TARGETS = [
  { value: -14, label: '-14 LUFS (Spotify, YouTube)' },
  { value: -16, label: '-16 LUFS (Apple Music)' },
  { value: -9, label: '-9 LUFS (SoundCloud)' },
  { value: -24, label: '-24 LUFS (Broadcast)' },
];

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: 'peak-levels', label: 'Peak Levels', description: 'True peaks below -1 dBTP', checked: false, required: true, category: 'audio' },
  { id: 'loudness', label: 'Loudness Normalized', description: 'Integrated loudness matches target', checked: false, required: true, category: 'audio' },
  { id: 'clipping', label: 'No Clipping', description: 'No digital clipping or distortion', checked: false, required: true, category: 'audio' },
  { id: 'silence', label: 'Proper Silence', description: 'Appropriate silence at start/end', checked: false, required: false, category: 'audio' },
  { id: 'title', label: 'Track Title', description: 'Song title finalized', checked: false, required: true, category: 'metadata' },
  { id: 'artist', label: 'Artist Name', description: 'Primary artist confirmed', checked: false, required: true, category: 'metadata' },
  { id: 'isrc', label: 'ISRC Code', description: 'International Standard Recording Code', checked: false, required: true, category: 'metadata' },
  { id: 'genre', label: 'Genre Tagged', description: 'Primary and secondary genres set', checked: false, required: false, category: 'metadata' },
  { id: 'artwork', label: 'Cover Artwork', description: '3000x3000px minimum', checked: false, required: true, category: 'metadata' },
  { id: 'splits', label: 'Publishing Splits', description: 'All collaborator splits confirmed', checked: false, required: true, category: 'legal' },
  { id: 'samples', label: 'Sample Clearance', description: 'All samples cleared or royalty-free', checked: false, required: true, category: 'legal' },
  { id: 'rights', label: 'Rights Ownership', description: 'Copyright ownership established', checked: false, required: true, category: 'legal' },
];

export function MasteringDeliveryPanel({
  isOpen,
  onClose,
  project,
  onExport,
  onDistribute,
}: MasteringDeliveryPanelProps) {
  const [activeTab, setActiveTab] = useState('export');
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'wav',
    sampleRate: 48000,
    bitDepth: 24,
    normalize: true,
    dither: true,
    loudness: -14,
    filename: project?.title || 'Master',
  });
  const [exportQueue, setExportQueue] = useState<ExportJob[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);

  useEffect(() => {
    if (isOpen && project) {
      setExportSettings({
        format: 'wav',
        sampleRate: 48000,
        bitDepth: 24,
        normalize: true,
        dither: true,
        loudness: -14,
        filename: project.title || 'Master',
      });
      setExportQueue([]);
      setChecklist(INITIAL_CHECKLIST);
    }
  }, [isOpen, project?.id]);

  const updateExportSetting = useCallback(<K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) => {
    setExportSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const addToQueue = useCallback(() => {
    const format = EXPORT_FORMATS.find(f => f.id === exportSettings.format);
    const newJob: ExportJob = {
      id: `export-${Date.now()}`,
      filename: `${exportSettings.filename}${format?.extension || '.wav'}`,
      format: exportSettings.format.toUpperCase(),
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
    };
    setExportQueue(prev => [...prev, newJob]);

    onExport?.(exportSettings);

    setTimeout(() => {
      setExportQueue(prev =>
        prev.map(job =>
          job.id === newJob.id ? { ...job, status: 'processing', progress: 0 } : job
        )
      );
      
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setExportQueue(prev =>
            prev.map(job =>
              job.id === newJob.id ? { ...job, status: 'completed', progress: 100 } : job
            )
          );
        } else {
          setExportQueue(prev =>
            prev.map(job =>
              job.id === newJob.id ? { ...job, progress } : job
            )
          );
        }
      }, 200);
    }, 500);
  }, [exportSettings, onExport]);

  const removeFromQueue = useCallback((id: string) => {
    setExportQueue(prev => prev.filter(job => job.id !== id));
  }, []);

  const toggleChecklistItem = useCallback((id: string) => {
    setChecklist(prev =>
      prev.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  }, []);

  const checklistProgress = {
    total: checklist.length,
    completed: checklist.filter(item => item.checked).length,
    requiredTotal: checklist.filter(item => item.required).length,
    requiredCompleted: checklist.filter(item => item.required && item.checked).length,
  };

  const isReadyForDistribution = checklistProgress.requiredCompleted === checklistProgress.requiredTotal;

  const renderChecklistCategory = (category: 'audio' | 'metadata' | 'legal', title: string, icon: React.ReactNode) => {
    const items = checklist.filter(item => item.category === category);
    const completed = items.filter(item => item.checked).length;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium">{title}</span>
          </div>
          <Badge variant={completed === items.length ? 'default' : 'secondary'}>
            {completed}/{items.length}
          </Badge>
        </div>
        <div className="space-y-2 pl-6">
          {items.map(item => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
              onClick={() => toggleChecklistItem(item.id)}
            >
              <Checkbox
                checked={item.checked}
                onCheckedChange={() => toggleChecklistItem(item.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${item.checked ? 'line-through text-muted-foreground' : ''}`}>
                    {item.label}
                  </span>
                  {item.required && !item.checked && (
                    <Badge variant="destructive" className="text-[10px] px-1 py-0">
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden bg-background">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Disc3 className="h-5 w-5" />
            Mastering & Delivery
            {project && (
              <Badge variant="outline" className="ml-2 font-normal">
                {project.title}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="export" className="flex items-center gap-2">
              <FileAudio className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="queue" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Queue
              {exportQueue.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                  {exportQueue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="distribution" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Distribution
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] mt-4">
            <TabsContent value="export" className="mt-0 space-y-6 p-1">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label className="flex items-center gap-2 mb-2">
                      <FileAudio className="h-4 w-4" />
                      Filename
                    </Label>
                    <Input
                      value={exportSettings.filename}
                      onChange={(e) => updateExportSetting('filename', e.target.value)}
                      placeholder="Master"
                    />
                  </div>

                  <div>
                    <Label className="flex items-center gap-2 mb-2">
                      <Music className="h-4 w-4" />
                      Format
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {EXPORT_FORMATS.map(format => (
                        <Card
                          key={format.id}
                          className={`cursor-pointer transition-colors ${
                            exportSettings.format === format.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-primary/50'
                          }`}
                          onClick={() => updateExportSetting('format', format.id as ExportSettings['format'])}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{format.name}</span>
                              {exportSettings.format === format.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format.description}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="mb-2 block">Sample Rate</Label>
                      <Select
                        value={exportSettings.sampleRate.toString()}
                        onValueChange={(v) => updateExportSetting('sampleRate', parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SAMPLE_RATES.map(rate => (
                            <SelectItem key={rate} value={rate.toString()}>
                              {(rate / 1000).toFixed(1)} kHz
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="mb-2 block">Bit Depth</Label>
                      <Select
                        value={exportSettings.bitDepth.toString()}
                        onValueChange={(v) => updateExportSetting('bitDepth', parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BIT_DEPTHS.map(depth => (
                            <SelectItem key={depth} value={depth.toString()}>
                              {depth}-bit
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="flex items-center gap-2 mb-2">
                      <Volume2 className="h-4 w-4" />
                      Loudness Target
                    </Label>
                    <Select
                      value={exportSettings.loudness.toString()}
                      onValueChange={(v) => updateExportSetting('loudness', parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOUDNESS_TARGETS.map(target => (
                          <SelectItem key={target.value} value={target.value.toString()}>
                            {target.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Normalize</Label>
                        <p className="text-xs text-muted-foreground">
                          Adjust gain to hit loudness target
                        </p>
                      </div>
                      <Checkbox
                        checked={exportSettings.normalize}
                        onCheckedChange={(checked) =>
                          updateExportSetting('normalize', checked as boolean)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Dither</Label>
                        <p className="text-xs text-muted-foreground">
                          Apply dithering when reducing bit depth
                        </p>
                      </div>
                      <Checkbox
                        checked={exportSettings.dither}
                        onCheckedChange={(checked) =>
                          updateExportSetting('dither', checked as boolean)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={addToQueue}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add to Queue
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="queue" className="mt-0 space-y-4 p-1">
              {exportQueue.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground mt-4">No exports in queue</p>
                  <p className="text-sm text-muted-foreground">
                    Add exports from the Export tab
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {exportQueue.map(job => (
                    <Card key={job.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <FileAudio className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{job.filename}</p>
                              <p className="text-xs text-muted-foreground">
                                {job.format}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {job.status === 'queued' && (
                              <Badge variant="secondary">
                                <Clock className="h-3 w-3 mr-1" />
                                Queued
                              </Badge>
                            )}
                            {job.status === 'processing' && (
                              <Badge variant="default">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Processing
                              </Badge>
                            )}
                            {job.status === 'completed' && (
                              <Badge variant="default" className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                            )}
                            {job.status === 'failed' && (
                              <Badge variant="destructive">
                                <X className="h-3 w-3 mr-1" />
                                Failed
                              </Badge>
                            )}
                            {job.status === 'completed' && (
                              <Button size="icon" variant="ghost">
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeFromQueue(job.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        {(job.status === 'processing' || job.status === 'queued') && (
                          <Progress value={job.progress} className="h-2" />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="distribution" className="mt-0 space-y-6 p-1">
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5" />
                    <span className="font-medium">Distribution Readiness</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">
                      {checklistProgress.completed}/{checklistProgress.total} complete
                    </div>
                    <Progress
                      value={(checklistProgress.completed / checklistProgress.total) * 100}
                      className="w-24 h-2"
                    />
                  </div>
                </div>

                {!isReadyForDistribution && (
                  <div className="flex items-center gap-2 p-3 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">
                      {checklistProgress.requiredTotal - checklistProgress.requiredCompleted} required items remaining
                    </span>
                  </div>
                )}

                {isReadyForDistribution && (
                  <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 text-green-600 dark:text-green-400 mb-4">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm">Ready for distribution!</span>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {renderChecklistCategory('audio', 'Audio Quality', <Volume2 className="h-4 w-4" />)}
                <Separator />
                {renderChecklistCategory('metadata', 'Metadata', <FileCheck className="h-4 w-4" />)}
                <Separator />
                {renderChecklistCategory('legal', 'Legal & Rights', <ListChecks className="h-4 w-4" />)}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  disabled={!isReadyForDistribution}
                  onClick={onDistribute}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Distribute
                </Button>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
