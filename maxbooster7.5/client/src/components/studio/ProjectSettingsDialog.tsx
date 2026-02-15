import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Settings, Loader2, Save } from 'lucide-react';

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  project: {
    name: string;
    description?: string;
    tempo?: number;
    timeSignatureNumerator?: number;
    timeSignatureDenominator?: number;
    sampleRate?: number;
    bitDepth?: number;
  };
  onUpdate: (updates: {
    name?: string;
    description?: string;
    tempo?: number;
    timeSignatureNumerator?: number;
    timeSignatureDenominator?: number;
    sampleRate?: number;
    bitDepth?: number;
  }) => void;
}

const GENRES = [
  'Hip-Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical',
  'Country', 'Latin', 'Afrobeat', 'Reggae', 'Blues', 'Soul', 'Funk',
  'Metal', 'Indie', 'Alternative', 'Dance', 'House', 'Techno', 'Trap',
  'Drill', 'Lo-Fi', 'Ambient', 'Other'
];

const TIME_SIGNATURES = [
  { value: '4/4', label: '4/4' },
  { value: '3/4', label: '3/4' },
  { value: '6/8', label: '6/8' },
  { value: '2/4', label: '2/4' },
  { value: '5/4', label: '5/4' },
  { value: '7/8', label: '7/8' },
  { value: '12/8', label: '12/8' },
];

const SAMPLE_RATES = [
  { value: 44100, label: '44.1 kHz' },
  { value: 48000, label: '48 kHz' },
  { value: 88200, label: '88.2 kHz' },
  { value: 96000, label: '96 kHz' },
];

const BIT_DEPTHS = [
  { value: 16, label: '16-bit' },
  { value: 24, label: '24-bit' },
  { value: 32, label: '32-bit float' },
];

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  projectId,
  project,
  onUpdate,
}: ProjectSettingsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: project.name || 'Untitled Project',
    description: project.description || '',
    tempo: project.tempo || 120,
    timeSignature: `${project.timeSignatureNumerator || 4}/${project.timeSignatureDenominator || 4}`,
    sampleRate: project.sampleRate || 48000,
    bitDepth: project.bitDepth || 24,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: project.name || 'Untitled Project',
        description: project.description || '',
        tempo: project.tempo || 120,
        timeSignature: `${project.timeSignatureNumerator || 4}/${project.timeSignatureDenominator || 4}`,
        sampleRate: project.sampleRate || 48000,
        bitDepth: project.bitDepth || 24,
      });
    }
  }, [open, project]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return null;

      const [numerator, denominator] = form.timeSignature.split('/').map(Number);

      const response = await fetch(`/api/studio/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.name,
          description: form.description,
          bpm: form.tempo,
          timeSignature: form.timeSignature,
          sampleRate: form.sampleRate,
          bitDepth: form.bitDepth,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update project settings');
      }

      return { numerator, denominator };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });

      if (data) {
        onUpdate({
          name: form.name,
          description: form.description,
          tempo: form.tempo,
          timeSignatureNumerator: data.numerator,
          timeSignatureDenominator: data.denominator,
          sampleRate: form.sampleRate,
          bitDepth: form.bitDepth,
        });
      }

      toast({
        title: 'Settings Saved',
        description: 'Project settings have been updated.',
      });

      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save project settings.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const isSubmitting = saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#1e1e22] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Settings className="h-5 w-5 text-blue-500" />
            Project Settings
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure project properties and audio settings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-300">Project Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter project name"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-300">Description</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of your project"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500 resize-none h-20"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tempo" className="text-gray-300">Tempo (BPM)</Label>
              <Input
                id="tempo"
                type="number"
                min={20}
                max={300}
                value={form.tempo}
                onChange={(e) => setForm(prev => ({ ...prev, tempo: parseInt(e.target.value) || 120 }))}
                className="bg-[#2a2a2e] border-[#444] text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Time Signature</Label>
              <Select
                value={form.timeSignature}
                onValueChange={(value) => setForm(prev => ({ ...prev, timeSignature: value }))}
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {TIME_SIGNATURES.map(ts => (
                    <SelectItem key={ts.value} value={ts.value} className="text-white hover:bg-[#333]">
                      {ts.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Sample Rate</Label>
              <Select
                value={form.sampleRate.toString()}
                onValueChange={(value) => setForm(prev => ({ ...prev, sampleRate: parseInt(value) }))}
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {SAMPLE_RATES.map(sr => (
                    <SelectItem key={sr.value} value={sr.value.toString()} className="text-white hover:bg-[#333]">
                      {sr.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Bit Depth</Label>
              <Select
                value={form.bitDepth.toString()}
                onValueChange={(value) => setForm(prev => ({ ...prev, bitDepth: parseInt(value) }))}
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {BIT_DEPTHS.map(bd => (
                    <SelectItem key={bd.value} value={bd.value.toString()} className="text-white hover:bg-[#333]">
                      {bd.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.name.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
