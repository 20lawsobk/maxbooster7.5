import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Image, Upload, X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ArtworkUploaderProps {
  artwork: File | null;
  previewUrl: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
}

/**
 * TODO: Add function documentation
 */
export function ArtworkUploader({ artwork, previewUrl, onChange }: ArtworkUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validation, setValidation] = useState<{
    isValid: boolean;
    width?: number;
    height?: number;
    errors: string[];
  } | null>(null);
  const { toast } = useToast();

  const MIN_SIZE = 3000;
  const MAX_SIZE = 5000;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png'];

  const validateImage = (
    file: File
  ): Promise<{ isValid: boolean; width?: number; height?: number; errors: string[] }> => {
    return new Promise((resolve) => {
      const errors: string[] = [];

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(
          `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum 10MB allowed.`
        );
      }

      // Check format
      if (!ALLOWED_FORMATS.includes(file.type)) {
        errors.push('Invalid format. Only JPEG and PNG allowed.');
        resolve({ isValid: false, errors });
        return;
      }

      // Check dimensions
      const img = new window.Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const { width, height } = img;
        URL.revokeObjectURL(url);

        // Check if square
        if (width !== height) {
          errors.push('Artwork must be square (1:1 aspect ratio)');
        }

        // Check minimum dimensions
        if (width < MIN_SIZE || height < MIN_SIZE) {
          errors.push(
            `Too small (${width}x${height}px). Minimum ${MIN_SIZE}x${MIN_SIZE}px required.`
          );
        }

        // Check maximum dimensions
        if (width > MAX_SIZE || height > MAX_SIZE) {
          errors.push(
            `Too large (${width}x${height}px). Maximum ${MAX_SIZE}x${MAX_SIZE}px recommended.`
          );
        }

        resolve({
          isValid: errors.length === 0,
          width,
          height,
          errors,
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        errors.push('Failed to load image. File may be corrupted.');
        resolve({ isValid: false, errors });
      };

      img.src = url;
    });
  };

  const handleFile = async (file: File | null) => {
    if (!file) {
      onChange(null, null);
      setValidation(null);
      return;
    }

    const validationResult = await validateImage(file);
    setValidation(validationResult);

    if (validationResult.isValid) {
      const url = URL.createObjectURL(file);
      onChange(file, url);
      toast({
        title: 'Artwork uploaded',
        description: `${validationResult.width}x${validationResult.height}px - Perfect!`,
      });
    } else {
      onChange(null, null);
      toast({
        title: 'Invalid artwork',
        description: validationResult.errors[0],
        variant: 'destructive',
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const removeArtwork = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onChange(null, null);
    setValidation(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          Album Artwork
        </CardTitle>
        <CardDescription>
          Upload cover art in JPEG or PNG format. Must be square and at least 3000x3000px.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Requirements Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>DSP Requirements:</strong> Square aspect ratio (1:1), minimum 3000x3000px,
            maximum 5000x5000px recommended. Avoid text, logos, or price info.
          </AlertDescription>
        </Alert>

        {/* Upload Area or Preview */}
        {!previewUrl ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Image className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2">Drag and drop artwork here</p>
            <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Select Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted-foreground mt-4">
              JPEG or PNG • 3000x3000px minimum • Square (1:1)
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative aspect-square max-w-md mx-auto rounded-lg overflow-hidden border-2 border-border">
              <img
                src={previewUrl}
                alt="Album artwork preview"
                className="w-full h-full object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={removeArtwork}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {validation && (
              <div className="text-center space-y-2">
                {validation.isValid ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">
                      {validation.width}x{validation.height}px - Perfect!
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="font-medium">Validation Failed</span>
                    </div>
                    {validation.errors.map((error, i) => (
                      <p key={i} className="text-sm text-destructive">
                        {error}
                      </p>
                    ))}
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  {artwork && (
                    <>
                      {artwork.name} • {(artwork.size / 1024 / 1024).toFixed(2)}MB
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Validation Errors */}
        {validation && !validation.isValid && validation.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validation.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
