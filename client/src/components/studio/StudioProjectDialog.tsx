import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, uploadWithProgress, getCsrfTokenFromCookie } from '@/lib/queryClient';
import {
  Upload,
  FileAudio,
  Music,
  Plus,
  FolderOpen,
  Loader2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StudioProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated?: (projectId: string) => void;
  initialTitle?: string;
}

const GENRES = [
  'Hip-Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical',
  'Country', 'Latin', 'Afrobeat', 'Reggae', 'Blues', 'Soul', 'Funk',
  'Metal', 'Indie', 'Alternative', 'Dance', 'House', 'Techno', 'Trap',
  'Drill', 'Lo-Fi', 'Ambient', 'Other'
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Major', 'Minor'];

const ACCEPTED_AUDIO_TYPES = [
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp3', 'audio/mpeg',
  'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff', 'audio/ogg',
];
const ACCEPTED_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg'];
const MAX_FILE_SIZE = 500 * 1024 * 1024;

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — safely under Replit's proxy limit

function generateUploadId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function uploadInChunks(
  file: File,
  onProgress: (percent: number) => void
): Promise<{ audioUrl: string; fileSize: number }> {
  const uploadId = generateUploadId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(i));
    formData.append('totalChunks', String(totalChunks));
    formData.append('chunk', chunk, file.name);

    const csrfToken = getCsrfTokenFromCookie();
    const res = await fetch('/api/uploads/chunk', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Chunk upload failed' }));
      throw new Error(err.message || `Chunk ${i} upload failed`);
    }

    onProgress(Math.round(((i + 1) / totalChunks) * 90));
  }

  const csrfToken2 = getCsrfTokenFromCookie();
  const assembleRes = await fetch('/api/uploads/assemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(csrfToken2 ? { 'x-csrf-token': csrfToken2 } : {}) },
    credentials: 'include',
    body: JSON.stringify({
      uploadId,
      totalChunks,
      filename: file.name,
      category: 'audio',
    }),
  });
  if (!assembleRes.ok) {
    const err = await assembleRes.json().catch(() => ({ message: 'Assembly failed' }));
    throw new Error(err.message || 'File assembly failed');
  }

  const { url, size } = await assembleRes.json();
  onProgress(100);
  return { audioUrl: url, fileSize: size };
}

export function StudioProjectDialog({
  open,
  onOpenChange,
  onProjectCreated,
  initialTitle,
}: StudioProjectDialogProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: initialTitle || '',
    description: '',
    genre: '',
    bpm: 120,
    key: 'C',
    scale: 'Minor',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (open && initialTitle) {
      setForm(prev => ({ ...prev, title: initialTitle }));
    }
  }, [open, initialTitle]);

  const resetForm = useCallback(() => {
    setForm({
      title: '',
      description: '',
      genre: '',
      bpm: 120,
      key: 'C',
      scale: 'Minor',
    });
    setSelectedFile(null);
    setUploadProgress(0);
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension) && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      return `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      toast({ title: 'Invalid File', description: error, variant: 'destructive' });
      return;
    }
    setSelectedFile(file);
    if (!form.title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setForm(prev => ({ ...prev, title: nameWithoutExt }));
    }
  }, [validateFile, toast, form.title]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      if (selectedFile) {
        const projectMeta = {
          title: form.title || 'Untitled Project',
          description: form.description,
          genre: form.genre,
          bpm: form.bpm.toString(),
          key: `${form.key} ${form.scale}`,
          isStudioProject: 'true',
        };

        if (selectedFile.size > CHUNK_SIZE) {
          // Large file — upload in chunks to bypass Replit's proxy body-size limit
          setUploadProgress(1);
          const { audioUrl, fileSize } = await uploadInChunks(
            selectedFile,
            (pct) => setUploadProgress(pct)
          );
          const response = await apiRequest('POST', '/api/projects', {
            ...projectMeta,
            audioUrl,
            fileSize,
          });
          return response.json();
        }

        // Small file — upload in a single multipart request
        const formData = new FormData();
        Object.entries(projectMeta).forEach(([k, v]) => formData.append(k, v));
        formData.append('audio', selectedFile, selectedFile.name);
        return uploadWithProgress('/api/projects', formData, {
          onProgress: (percent) => setUploadProgress(percent),
          timeout: 300000,
        });
      }

      // No audio file — create a blank studio project
      const response = await apiRequest('POST', '/api/studio/projects', {
        title: form.title || 'Untitled Project',
        description: form.description,
        genre: form.genre,
        tempo: form.bpm,
        key: `${form.key} ${form.scale}`,
      });
      return response.json();
    },
    onSuccess: (data: Record<string, unknown>) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });

      toast({
        title: 'Project Created',
        description: `"${form.title || 'Untitled Project'}" has been created successfully.`,
      });

      const projectId = data?.id || data?.project?.id;
      if (projectId && onProjectCreated) {
        onProjectCreated(projectId);
      }

      resetForm();
      onOpenChange(false);

      if (projectId) {
        setLocation(`/studio/${projectId}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create project. Please try again.',
        variant: 'destructive',
      });
      setUploadProgress(0);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() && !selectedFile) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a project title or select an audio file.',
        variant: 'destructive',
      });
      return;
    }
    createProjectMutation.mutate();
  };

  const isSubmitting = createProjectMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#1e1e22] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Plus className="h-5 w-5 text-emerald-500" />
            New Project
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a new project or upload an existing audio file to get started.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
              isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-[#444] hover:border-[#666]',
              selectedFile && 'border-emerald-500/50 bg-emerald-500/5'
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS.join(',')}
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div className="text-left">
                  <p className="font-medium text-white">{selectedFile.name}</p>
                  <p className="text-sm text-gray-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto mb-3 text-gray-500" />
                <p className="text-sm text-gray-400 mb-1">
                  Drag & drop an audio file here, or click to browse
                </p>
                <p className="text-xs text-gray-500">
                  WAV, MP3, FLAC, AIFF, OGG (max 500MB)
                </p>
              </>
            )}
          </div>

          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-1" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title" className="text-gray-300">Project Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter project title"
              className="bg-[#2a2a2e] border-[#444] text-white placeholder:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-300">Description (optional)</Label>
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
              <Label className="text-gray-300">Genre</Label>
              <Select
                value={form.genre}
                onValueChange={(value) => setForm(prev => ({ ...prev, genre: value }))}
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue placeholder="Select genre" />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {GENRES.map(genre => (
                    <SelectItem key={genre} value={genre} className="text-white hover:bg-[#333]">
                      {genre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bpm" className="text-gray-300">BPM</Label>
              <Input
                id="bpm"
                type="number"
                min={20}
                max={300}
                value={form.bpm}
                onChange={(e) => setForm(prev => ({ ...prev, bpm: parseInt(e.target.value) || 120 }))}
                className="bg-[#2a2a2e] border-[#444] text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-300">Key</Label>
              <Select
                value={form.key}
                onValueChange={(value) => setForm(prev => ({ ...prev, key: value }))}
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {KEYS.map(key => (
                    <SelectItem key={key} value={key} className="text-white hover:bg-[#333]">
                      {key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Scale</Label>
              <Select
                value={form.scale}
                onValueChange={(value) => setForm(prev => ({ ...prev, scale: value }))}
              >
                <SelectTrigger className="bg-[#2a2a2e] border-[#444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2e] border-[#444]">
                  {SCALES.map(scale => (
                    <SelectItem key={scale} value={scale} className="text-white hover:bg-[#333]">
                      {scale}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={isSubmitting}
              className="text-gray-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
