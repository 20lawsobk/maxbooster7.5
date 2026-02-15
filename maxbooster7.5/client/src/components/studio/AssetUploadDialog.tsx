import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadWithProgress } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Upload, FileAudio, AlertCircle, CheckCircle2 } from 'lucide-react';

interface AssetUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetType: 'sample' | 'plugin';
}

/**
 * TODO: Add function documentation
 */
export function AssetUploadDialog({ open, onOpenChange, assetType }: AssetUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return uploadWithProgress('/api/assets/upload', formData, {
        onProgress: (percent) => setUploadProgress(percent),
        timeout: 300000, // 5 minutes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/assets'] });
      handleClose();
    },
    onError: (error: Error) => {
      setError(error.message);
      setUploadProgress(0);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setName(file.name);
      setError(null);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    const formData = new FormData();
    formData.append('assetFile', selectedFile);
    formData.append('name', name || selectedFile.name);
    formData.append('assetType', assetType);

    if (description) {
      formData.append('description', description);
    }

    if (tags) {
      formData.append('tags', tags);
    }

    uploadMutation.mutate(formData);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setName('');
    setDescription('');
    setTags('');
    setUploadProgress(0);
    setError(null);
    onOpenChange(false);
  };

  const fileTypes = assetType === 'sample' ? 'WAV, MP3, FLAC, AIFF, OGG' : 'JSON, ZIP';

  const maxSize = '500MB';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload {assetType === 'sample' ? 'Sample' : 'Plugin'}</DialogTitle>
          <DialogDescription>
            Upload your {assetType === 'sample' ? 'audio samples' : 'plugin files'} to use in your
            projects.
            <br />
            Supported formats: {fileTypes} (Max: {maxSize})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="file">File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept={assetType === 'sample' ? '.wav,.mp3,.flac,.aiff,.aif,.ogg' : '.json,.zip'}
                onChange={handleFileChange}
                className="flex-1"
              />
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileAudio className="h-4 w-4" />
                <span>{selectedFile.name}</span>
                <span className="text-xs">
                  ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
            )}
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My awesome sample"
            />
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
            />
          </div>

          {/* Tags Input */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (Optional)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="drum, kick, 808 (comma-separated)"
            />
          </div>

          {/* Progress Bar */}
          {uploadMutation.isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress.toFixed(0)}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {uploadMutation.isSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-500 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Upload successful!</span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!selectedFile || uploadMutation.isPending}>
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
