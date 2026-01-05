import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface UploadProgress {
  id: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export interface UploadOptions {
  endpoint: string;
  fieldName?: string;
  additionalData?: Record<string, string>;
  maxFileSize?: number;
  acceptedTypes?: string[];
  acceptedExtensions?: string[];
  onProgress?: (progress: UploadProgress) => void;
  onSuccess?: (response: any, file: File) => void;
  onError?: (error: string, file: File) => void;
  withCredentials?: boolean;
}

const DEFAULT_AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp3',
  'audio/mpeg',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
];

const DEFAULT_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg', '.webm', '.aac', '.m4a'];
const DEFAULT_MAX_SIZE = 500 * 1024 * 1024;

export function useUniversalUpload() {
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const abortControllers = useRef<Map<string, XMLHttpRequest>>(new Map());
  const { toast } = useToast();

  const generateId = () => `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const validateFile = useCallback((
    file: File,
    options: UploadOptions
  ): string | null => {
    const maxSize = options.maxFileSize ?? DEFAULT_MAX_SIZE;
    const acceptedTypes = options.acceptedTypes ?? DEFAULT_AUDIO_TYPES;
    const acceptedExtensions = options.acceptedExtensions ?? DEFAULT_EXTENSIONS;

    const extension = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    
    const isValidType = acceptedTypes.includes(file.type);
    const isValidExtension = acceptedExtensions.includes(extension);
    
    if (!isValidType && !isValidExtension) {
      return `Unsupported file type "${extension}". Accepted: ${acceptedExtensions.join(', ')}`;
    }

    if (file.size > maxSize) {
      return `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum: ${(maxSize / (1024 * 1024)).toFixed(0)}MB`;
    }

    if (file.size === 0) {
      return 'File is empty';
    }

    return null;
  }, []);

  const uploadFile = useCallback(async (
    file: File,
    options: UploadOptions
  ): Promise<{ success: boolean; response?: any; error?: string }> => {
    const uploadId = generateId();
    const fieldName = options.fieldName ?? 'audioFile';

    const validationError = validateFile(file, options);
    if (validationError) {
      options.onError?.(validationError, file);
      return { success: false, error: validationError };
    }

    const progressData: UploadProgress = {
      id: uploadId,
      fileName: file.name,
      progress: 0,
      status: 'pending',
    };

    setUploads(prev => new Map(prev).set(uploadId, progressData));
    setIsUploading(true);

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      abortControllers.current.set(uploadId, xhr);

      const formData = new FormData();
      formData.append(fieldName, file, file.name);

      if (options.additionalData) {
        Object.entries(options.additionalData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, value);
          }
        });
      }

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          const updated: UploadProgress = {
            id: uploadId,
            fileName: file.name,
            progress,
            status: 'uploading',
          };
          setUploads(prev => new Map(prev).set(uploadId, updated));
          options.onProgress?.(updated);
        }
      });

      xhr.addEventListener('load', () => {
        abortControllers.current.delete(uploadId);

        if (xhr.status >= 200 && xhr.status < 300) {
          let response: any;
          try {
            response = JSON.parse(xhr.responseText);
          } catch {
            response = { success: true };
          }

          const updated: UploadProgress = {
            id: uploadId,
            fileName: file.name,
            progress: 100,
            status: 'success',
          };
          setUploads(prev => new Map(prev).set(uploadId, updated));
          options.onSuccess?.(response, file);
          
          setTimeout(() => {
            setUploads(prev => {
              const next = new Map(prev);
              next.delete(uploadId);
              if (next.size === 0) setIsUploading(false);
              return next;
            });
          }, 2000);

          resolve({ success: true, response });
        } else {
          let errorMessage = 'Upload failed';
          try {
            const response = JSON.parse(xhr.responseText);
            errorMessage = response.message || response.error || `Server error: ${xhr.status}`;
          } catch {
            errorMessage = xhr.statusText || `Upload failed with status ${xhr.status}`;
          }

          const updated: UploadProgress = {
            id: uploadId,
            fileName: file.name,
            progress: 0,
            status: 'error',
            error: errorMessage,
          };
          setUploads(prev => new Map(prev).set(uploadId, updated));
          options.onError?.(errorMessage, file);
          setIsUploading(false);
          resolve({ success: false, error: errorMessage });
        }
      });

      xhr.addEventListener('error', () => {
        abortControllers.current.delete(uploadId);
        const errorMessage = 'Network error - please check your connection';
        
        const updated: UploadProgress = {
          id: uploadId,
          fileName: file.name,
          progress: 0,
          status: 'error',
          error: errorMessage,
        };
        setUploads(prev => new Map(prev).set(uploadId, updated));
        options.onError?.(errorMessage, file);
        setIsUploading(false);
        resolve({ success: false, error: errorMessage });
      });

      xhr.addEventListener('abort', () => {
        abortControllers.current.delete(uploadId);
        setUploads(prev => {
          const next = new Map(prev);
          next.delete(uploadId);
          if (next.size === 0) setIsUploading(false);
          return next;
        });
        resolve({ success: false, error: 'Upload cancelled' });
      });

      xhr.addEventListener('timeout', () => {
        abortControllers.current.delete(uploadId);
        const errorMessage = 'Upload timed out - please try again';
        
        const updated: UploadProgress = {
          id: uploadId,
          fileName: file.name,
          progress: 0,
          status: 'error',
          error: errorMessage,
        };
        setUploads(prev => new Map(prev).set(uploadId, updated));
        options.onError?.(errorMessage, file);
        setIsUploading(false);
        resolve({ success: false, error: errorMessage });
      });

      xhr.open('POST', options.endpoint);
      xhr.withCredentials = options.withCredentials ?? true;
      xhr.timeout = 10 * 60 * 1000;
      xhr.send(formData);
    });
  }, [validateFile]);

  const uploadMultiple = useCallback(async (
    files: File[],
    options: UploadOptions
  ): Promise<{ successful: File[]; failed: { file: File; error: string }[] }> => {
    const successful: File[] = [];
    const failed: { file: File; error: string }[] = [];

    for (const file of files) {
      const result = await uploadFile(file, options);
      if (result.success) {
        successful.push(file);
      } else {
        failed.push({ file, error: result.error || 'Unknown error' });
      }
    }

    return { successful, failed };
  }, [uploadFile]);

  const cancelUpload = useCallback((uploadId: string) => {
    const xhr = abortControllers.current.get(uploadId);
    if (xhr) {
      xhr.abort();
    }
  }, []);

  const cancelAll = useCallback(() => {
    abortControllers.current.forEach((xhr) => xhr.abort());
    abortControllers.current.clear();
    setUploads(new Map());
    setIsUploading(false);
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => {
      const next = new Map(prev);
      next.forEach((upload, id) => {
        if (upload.status === 'success' || upload.status === 'error') {
          next.delete(id);
        }
      });
      if (next.size === 0) setIsUploading(false);
      return next;
    });
  }, []);

  return {
    uploadFile,
    uploadMultiple,
    cancelUpload,
    cancelAll,
    clearCompleted,
    uploads: Array.from(uploads.values()),
    isUploading,
    validateFile,
  };
}

export function getAcceptString(extensions: string[] = DEFAULT_EXTENSIONS): string {
  const mimeTypes = [
    'audio/wav',
    'audio/mpeg',
    'audio/mp3',
    'audio/flac',
    'audio/aiff',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/mp4',
  ];
  return [...extensions, ...mimeTypes].join(',');
}
