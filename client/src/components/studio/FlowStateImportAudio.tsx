// @ts-nocheck
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Upload,
  X,
  FileAudio,
  Music,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: "pending" | "uploading" | "success" | "error";
  progress?: number;
  url?: string;
  duration?: number;
  error?: string;
}

async function uploadAudioFile(
  file: File,
  projectId: string,
): Promise<{ fileId: string; url: string; duration: number }> {
  const formData = new FormData();
  formData.append("audioFile", file);
  formData.append("projectId", projectId);

  const csrfToken = getCsrfTokenFromCookie();
  const response = await fetch("/api/studio/upload", {
    method: "POST",
    credentials: "include",
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to upload audio file");
  }

  return response.json();
}

interface FlowStateImportAudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: (
    files: { id: string; name: string; url: string; duration?: number }[],
  ) => void;
  projectId?: string;
}

export function FlowStateImportAudio({
  open,
  onOpenChange,
  onImportComplete,
  projectId,
}: FlowStateImportAudioProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ file, _fileId }: { file: File; fileId: string }) => {
      if (!projectId) throw new Error("No project selected");
      return uploadAudioFile(file, projectId);
    },
    onSuccess: (result, variables) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === variables.fileId
            ? {
                ...f,
                status: "success" as const,
                url: result.url,
                duration: result.duration,
              }
            : f,
        ),
      );
    },
    onError: (error: Error, variables) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === variables.fileId
            ? { ...f, status: "error" as const, error: error.message }
            : f,
        ),
      );
    },
  });

  const handleFiles = useCallback(
    (acceptedFiles: File[]) => {
      const audioFiles = acceptedFiles.filter(
        (file) =>
          file.type.startsWith("audio/") ||
          [".mp3", ".wav", ".flac", ".aiff", ".m4a", ".ogg"].some((ext) =>
            file.name.toLowerCase().endsWith(ext),
          ),
      );

      if (audioFiles.length === 0) {
        toast({
          title: "Invalid Files",
          description:
            "Please select audio files (MP3, WAV, FLAC, AIFF, M4A, OGG)",
          variant: "destructive",
        });
        return;
      }

      const newFiles: UploadedFile[] = audioFiles.map((file) => ({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        status: "uploading" as const,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      audioFiles.forEach((file, index) => {
        uploadMutation.mutate({ file, fileId: newFiles[index].id });
      });
    },
    [uploadMutation, toast],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      handleFiles(droppedFiles);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        handleFiles(Array.from(e.target.files));
      }
    },
    [handleFiles],
  );

  const handleComplete = () => {
    const successfulFiles = files
      .filter((f) => f.status === "success" && f.url)
      .map((f) => ({
        id: f.id,
        name: f.name,
        url: f.url!,
        duration: f.duration,
      }));

    if (successfulFiles.length > 0) {
      onImportComplete(successfulFiles);
      queryClient.invalidateQueries({ queryKey: ["studio-tracks", projectId] });
      toast({
        title: "Import Complete",
        description: `Successfully imported ${successfulFiles.length} file(s)`,
      });
    }

    setFiles([]);
    onOpenChange(false);
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const allComplete =
    files.length > 0 &&
    files.every((f) => f.status === "success" || f.status === "error");
  const hasSuccessful = files.some((f) => f.status === "success");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Import Audio
                  </h2>
                  <p className="text-xs text-white/50">
                    Drag and drop or browse files
                  </p>
                </div>
              </div>
              <motion.button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="p-4">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center transition-all",
                  isDragging
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-white/10 hover:border-white/20 hover:bg-white/5",
                )}
              >
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.flac,.aiff,.m4a,.ogg"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                  id="audio-file-input"
                />
                <label
                  htmlFor="audio-file-input"
                  className="cursor-pointer block"
                >
                  <motion.div
                    className={cn(
                      "w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4",
                      isDragging ? "bg-emerald-500/20" : "bg-white/5",
                    )}
                    animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
                  >
                    <FileAudio
                      className={cn(
                        "w-8 h-8",
                        isDragging ? "text-emerald-400" : "text-white/40",
                      )}
                    />
                  </motion.div>
                  <p className="text-white/70 mb-2">
                    {isDragging
                      ? "Drop files here"
                      : "Drag and drop audio files"}
                  </p>
                  <p className="text-xs text-white/40">
                    or click to browse • MP3, WAV, FLAC, AIFF, M4A, OGG
                  </p>
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          file.status === "success"
                            ? "bg-emerald-500/20"
                            : file.status === "error"
                              ? "bg-red-500/20"
                              : "bg-white/10",
                        )}
                      >
                        {file.status === "uploading" && (
                          <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
                        )}
                        {file.status === "success" && (
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        )}
                        {file.status === "error" && (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        )}
                        {file.status === "pending" && (
                          <Music className="w-4 h-4 text-white/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-white/40">
                          {file.status === "error"
                            ? file.error
                            : formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setFiles([]);
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              {allComplete && hasSuccessful && (
                <Button
                  onClick={handleComplete}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Done
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
