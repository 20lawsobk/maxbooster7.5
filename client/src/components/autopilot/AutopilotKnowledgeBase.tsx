import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { apiRequest, uploadWithProgress } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface KnowledgeSource {
  id: string;
  kind: "link" | "file";
  title: string;
  sourceUrl: string | null;
  mimeType: string | null;
  sizeBytes: number;
  uploadedAt: string | null;
}

interface KnowledgeResponse {
  sources: KnowledgeSource[];
  limit: number;
  supportedFileTypes: string[];
}

interface SavedSourceResponse {
  source: KnowledgeSource;
  created?: boolean;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AutopilotKnowledgeBase() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [sourceToDelete, setSourceToDelete] = useState<KnowledgeSource | null>(
    null,
  );

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery<KnowledgeResponse>({
    queryKey: ["/api/autopilot/knowledge"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/autopilot/knowledge");
      return response.json();
    },
  });

  const refreshSources = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/autopilot/knowledge"] });

  const addLinkMutation = useMutation<SavedSourceResponse, Error, string>({
    mutationFn: async (value) => {
      const response = await apiRequest(
        "POST",
        "/api/autopilot/knowledge/links",
        { url: value },
      );
      return response.json();
    },
    onSuccess: (result) => {
      setUrl("");
      void refreshSources();
      toast({
        title: result.created === false ? "Reference already saved" : "Link saved",
        description:
          result.created === false
            ? "This page is already in your autopilot knowledge base."
            : "The page snapshot will be available to future social autopilot generations.",
      });
    },
    onError: (mutationError) => {
      toast({
        title: "Could not save link",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const uploadMutation = useMutation<SavedSourceResponse, Error, File>({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadWithProgress(
        "/api/autopilot/knowledge/files",
        formData,
        { onProgress: setUploadProgress },
      );
      return result as SavedSourceResponse;
    },
    onSuccess: () => {
      setSelectedFile(null);
      setUploadProgress(0);
      setFileInputKey((key) => key + 1);
      void refreshSources();
      toast({
        title: "File saved",
        description: "Your file will be used as private reference context for future generations.",
      });
    },
    onError: (mutationError) => {
      setUploadProgress(0);
      toast({
        title: "Could not upload file",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation<{ success: boolean }, Error, string>({
    mutationFn: async (sourceId) => {
      const response = await apiRequest(
        "DELETE",
        `/api/autopilot/knowledge/${encodeURIComponent(sourceId)}`,
      );
      return response.json();
    },
    onSuccess: () => {
      setSourceToDelete(null);
      void refreshSources();
      toast({ title: "Knowledge source removed" });
    },
    onError: (mutationError) => {
      toast({
        title: "Could not remove source",
        description: mutationError.message,
        variant: "destructive",
      });
    },
  });

  const sources = data?.sources ?? [];
  const atLimit = sources.length >= (data?.limit ?? 20);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Your autopilot knowledge base
          </CardTitle>
          <CardDescription>
            Add reference links and text files that help personalize your
            social autopilot. The content is stored in this account’s own
            encrypted PDIM pocket and supplied as context when this account
            generates posts. Adding sources does not train a model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            <p className="text-muted-foreground">
              Source text is treated as untrusted reference material, not as
              instructions. Public links are captured when added; remove and
              re-add a link to refresh its snapshot. Do not upload credentials
              or secrets.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="autopilot-knowledge-url">Add a public link</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="autopilot-knowledge-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                maxLength={2048}
                placeholder="https://example.com/your-release-or-brand-info"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={atLimit || addLinkMutation.isPending}
              />
              <Button
                type="button"
                onClick={() => addLinkMutation.mutate(url.trim())}
                disabled={
                  atLimit ||
                  !url.trim() ||
                  addLinkMutation.isPending
                }
              >
                {addLinkMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-2 h-4 w-4" />
                )}
                Save link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Only publicly reachable HTTP or HTTPS pages with readable page
              information can be saved.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="autopilot-knowledge-file">
              Add a text file
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                key={fileInputKey}
                id="autopilot-knowledge-file"
                type="file"
                accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                disabled={atLimit || uploadMutation.isPending}
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
                disabled={
                  atLimit ||
                  !selectedFile ||
                  uploadMutation.isPending
                }
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload file
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supported: .txt, .md, .csv, and .json, up to 512 KB each. Your
              library holds up to 20 sources.
              {uploadMutation.isPending ? ` Uploading ${uploadProgress}%` : ""}
            </p>
          </div>

          {isError && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
            >
              {error instanceof Error
                ? error.message
                : "Your knowledge sources could not be loaded."}
            </div>
          )}
          {atLimit && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              You have reached the source limit. Remove a source before adding
              another.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved sources</CardTitle>
          <CardDescription>
            {isLoading
              ? "Loading your private sources…"
              : `${sources.length} of ${data?.limit ?? 20} sources`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading sources
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Database className="mx-auto mb-2 h-6 w-6" />
              No knowledge sources saved yet.
            </div>
          ) : (
            <ul className="divide-y">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {source.kind === "link" ? (
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium">{source.title}</span>
                      <Badge variant="secondary">
                        {source.kind === "link" ? "Link snapshot" : "File"}
                      </Badge>
                    </div>
                    {source.sourceUrl && (
                      <a
                        className="mt-1 block truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {source.sourceUrl}
                        <ExternalLink className="ml-1 inline h-3 w-3" />
                      </a>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(source.sizeBytes)}
                      {source.uploadedAt
                        ? ` · Added ${new Date(source.uploadedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start text-destructive hover:text-destructive sm:self-auto"
                    onClick={() => setSourceToDelete(source)}
                    disabled={deleteMutation.isPending}
                    aria-label={`Remove ${source.title}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={sourceToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setSourceToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this knowledge source?</AlertDialogTitle>
            <AlertDialogDescription>
              “{sourceToDelete?.title}” will be deleted from this account’s
              personal PDIM pocket and will no longer be used for future
              generations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Keep source
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (sourceToDelete) deleteMutation.mutate(sourceToDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
