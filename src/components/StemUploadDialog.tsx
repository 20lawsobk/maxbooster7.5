import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, FileAudio, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface StemUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
}

const STEM_TYPES = [
  { value: 'drums', label: 'Drums' },
  { value: 'bass', label: 'Bass' },
  { value: 'melody', label: 'Melody' },
  { value: 'vocals', label: 'Vocals' },
  { value: 'fx', label: 'FX/Effects' },
  { value: 'other', label: 'Other' },
];

/**
 * TODO: Add function documentation
 */
export function StemUploadDialog({ open, onOpenChange, listingId }: StemUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stemName, setStemName] = useState('');
  const [stemType, setStemType] = useState('');
  const [price, setPrice] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100;
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(xhr.responseText || 'Upload failed'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('POST', `/api/marketplace/listings/${listingId}/stems`, true);
        xhr.withCredentials = true;
        xhr.send(formData);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/marketplace/listings/${listingId}/stems`] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-stems'] });
      toast({
        title: 'Stem Uploaded!',
        description: 'Your stem has been uploaded successfully.',
      });
      handleClose();
    },
    onError: (error: Error) => {
      setError(error.message);
      setUploadProgress(0);
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!stemName) {
        setStemName(file.name.replace(/\.[^/.]+$/, ''));
      }
      setError(null);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    if (!stemName.trim()) {
      setError('Please enter a stem name');
      return;
    }

    if (!stemType) {
      setError('Please select a stem type');
      return;
    }

    const formData = new FormData();
    formData.append('stemFile', selectedFile);
    formData.append('stemName', stemName);
    formData.append('stemType', stemType);

    if (price) {
      formData.append('price', price);
    }

    uploadMutation.mutate(formData);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setStemName('');
    setStemType('');
    setPrice('');
    setUploadProgress(0);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Stem</DialogTitle>
          <DialogDescription>
            Upload individual stems for your listing.
            <br />
            Supported formats: WAV, MP3, FLAC (Max: 100MB)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="stem-file">Audio File</Label>
            <div className="mt-2">
              <Input
                id="stem-file"
                type="file"
                accept=".wav,.mp3,.flac,.aac,.ogg"
                onChange={handleFileChange}
                disabled={uploadMutation.isPending}
              />
            </div>
            {selectedFile && (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="stem-name">Stem Name</Label>
            <Input
              id="stem-name"
              value={stemName}
              onChange={(e) => setStemName(e.target.value)}
              placeholder="e.g., Drums, Bass, Lead Synth"
              disabled={uploadMutation.isPending}
            />
          </div>

          <div>
            <Label htmlFor="stem-type">Stem Type</Label>
            <Select
              value={stemType}
              onValueChange={setStemType}
              disabled={uploadMutation.isPending}
            >
              <SelectTrigger id="stem-type">
                <SelectValue placeholder="Select stem type" />
              </SelectTrigger>
              <SelectContent>
                {STEM_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="stem-price">Price (Optional)</Label>
            <Input
              id="stem-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Leave empty to include in listing price"
              disabled={uploadMutation.isPending}
            />
            <p className="mt-1 text-xs text-gray-500">
              If not set, stem will be included with the main listing purchase
            </p>
          </div>

          {uploadMutation.isPending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={uploadMutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploadMutation.isPending || !selectedFile}
              className="flex-1"
            >
              <Upload className="mr-2 h-4 w-4" />
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Stem'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
