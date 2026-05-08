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
import { apiRequest, getCsrfTokenFromCookie } from '@/lib/queryClient';
import {
  Upload,
  FileAudio,
  Plus,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
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
const CHUNK_SIZE = 4 * 1024 * 1024;

type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

interface SelectedFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
}

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

    onProgress(Math.round(((i + 1) / totalChunks) * 85));
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

async function uploadFileToProject(
  file: File,
  projectId: string,
  onProgress: (percent: number) => void
): Promise<void> {
  if (file.size > CHUNK_SIZE) {
    const { audioUrl } = await uploadInChunks(file, (pct) => onProgress(Math.round(pct * 0.9)));
    const csrfToken = getCsrfTokenFromCookie();
    const res = await fetch('/api/studio/upload-from-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ projectId, audioUrl, filename: file.name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to add track');
    }
    onProgress(100);
    return;
  }

  const formData = new FormData();
  formData.append('audioFile', file, file.name);
  formData.append('projectId', projectId);

  const csrfToken = getCsrfTokenFromCookie();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/studio/upload');
    if (csrfToken) xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
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

  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && initialTitle) {
      setForm(prev => ({ ...prev, title: initialTitle }));
    }
  }, [open, initialTitle]);

  const resetForm = useCallback(() => {
    setForm({ title: '', description: '', genre: '', bpm: 120, key: 'C', scale: 'Minor' });
    setSelectedFiles([]);
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension) && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      return `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds the 500 MB limit`;
    }
    return null;
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const errors: string[] = [];
    const valid: SelectedFile[] = [];

    for (const file of incoming) {
      const err = validateFile(file);
      if (err) {
        errors.push(err);
        continue;
      }
      valid.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: 'pending',
        progress: 0,
      });
    }

    if (errors.length) {
      toast({
        title: 'Some files were skipped',
        description: errors.join('\n'),
        variant: 'destructive',
      });
    }

    if (valid.length === 0) return;

    setSelectedFiles(prev => {
      const combined = [...prev, ...valid];
      if (!form.title && combined.length === 1) {
        const name = combined[0].file.name.replace(/\.[^/.]+$/, '');
        setForm(f => ({ ...f, title: name }));
      }
      return combined;
    });
  }, [validateFile, toast, form.title]);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const updateFileState = useCallback((id: string, patch: Partial<SelectedFile>) => {
    setSelectedFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() && selectedFiles.length === 0) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a project title or select at least one audio file.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const projectTitle = form.title.trim() ||
        (selectedFiles[0]?.file.name.replace(/\.[^/.]+$/, '') ?? 'Untitled Project');

      const projectRes = await apiRequest('POST', '/api/studio/projects', {
        title: projectTitle,
        description: form.description,
        genre: form.genre,
        tempo: form.bpm,
        key: `${form.key} ${form.scale}`,
      });
      const projectData = await projectRes.json();
      const projectId = projectData?.id || projectData?.project?.id;

      if (!projectId) throw new Error('Failed to get project ID');

      for (const sf of selectedFiles) {
        updateFileState(sf.id, { status: 'uploading', progress: 0 });
        try {
          await uploadFileToProject(sf.file, projectId, (pct) => {
            updateFileState(sf.id, { progress: pct });
          });
          updateFileState(sf.id, { status: 'done', progress: 100 });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          updateFileState(sf.id, { status: 'error', error: msg });
          toast({
            title: `Failed to upload "${sf.file.name}"`,
            description: msg,
            variant: 'destructive',
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });

      toast({
        title: 'Project Created',
        description: `"${projectTitle}" is ready${selectedFiles.length > 0 ? ` with ${selectedFiles.length} track${selectedFiles.length > 1 ? 's' : ''}` : ''}.`,
      });

      if (onProjectCreated) onProjectCreated(projectId);
      resetForm();
      onOpenChange(false);
      setLocation(`/studio/${projectId}`);
    } catch (err) {
      toast({
        title: 'Creation Failed',
        description: err instanceof Error ? err.message : 'Failed to create project. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalProgress = selectedFiles.length === 0 ? 0
    : Math.round(selectedFiles.reduce((sum, f) => sum + f.progress, 0) / selectedFiles.length);

  const hasUploading = selectedFiles.some(f => f.status === 'uploading');
  const allDone = selectedFiles.length > 0 && selectedFiles.every(f => f.status === 'done');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#1e1e22] border-[#333] text-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Plus className="h-5 w-5 text-emerald-500" />
            New Project
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Create a new project and optionally import one or more audio files as tracks.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer',
              isDragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-[#444] hover:border-[#666]',
              selectedFiles.length > 0 && !isDragging && 'border-emerald-500/40'
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
              multiple
              onChange={(e) => e.target.files && addFiles(e.target.files)}
              className="hidden"
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-500" />
            <p className="text-sm text-gray-400 mb-1">
              Drag & drop audio files here, or click to browse
            </p>
            <p className="text-xs text-gray-500">
              WAV, MP3, FLAC, AIFF, OGG — up to 500 MB each — multiple files supported
            </p>
          </div>

          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </p>
                {!isSubmitting && (
                  <button
                    type="button"
                    onClick={() => setSelectedFiles([])}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                  >
                    Remove all
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {selectedFiles.map((sf) => (
                  <div
                    key={sf.id}
                    className="flex items-center gap-2 bg-[#2a2a2e] rounded-lg px-3 py-2"
                  >
                    <FileAudio className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{sf.file.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">
                          {(sf.file.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                        {sf.status === 'uploading' && (
                          <>
                            <div className="flex-1 h-0.5 bg-[#444] rounded-full">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${sf.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-emerald-400">{sf.progress}%</span>
                          </>
                        )}
                        {sf.status === 'done' && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Done
                          </span>
                        )}
                        {sf.status === 'error' && (
                          <span className="text-[10px] text-red-400 flex items-center gap-1 truncate">
                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                            {sf.error || 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>
                    {!isSubmitting && (
                      <button
                        type="button"
                        onClick={() => removeFile(sf.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {hasUploading && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Uploading tracks...</span>
                    <span>{totalProgress}%</span>
                  </div>
                  <Progress value={totalProgress} className="h-1" />
                </div>
              )}

              {allDone && (
                <p className="text-xs text-emerald-400 text-center">
                  All tracks uploaded successfully
                </p>
              )}
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
                  {hasUploading ? 'Uploading...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                  {selectedFiles.length > 0 && (
                    <span className="ml-1 text-emerald-300">
                      + {selectedFiles.length} track{selectedFiles.length > 1 ? 's' : ''}
                    </span>
                  )}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
